import csv
import io
import re
from collections import defaultdict
from datetime import date
from decimal import Decimal, InvalidOperation
from .validation import ValidationError

def parse(data):
    source = data.get('csv')
    if not isinstance(source, str) or not source.strip() or len(source.encode('utf-8')) > 1000000:
        raise ValidationError('Provide a nonempty UTF-8 CSV of at most 1 MB')
    try:
        reader = csv.reader(io.StringIO(source.lstrip('\ufeff')), strict=True)
        headers = [h.strip() for h in next(reader)]
        if not 1 <= len(headers) <= 50 or any((not h for h in headers)) or len(set(headers)) != len(headers):
            raise ValidationError('Use 1–50 unique, nonempty column names')
        records = []
        for row in reader:
            if not row:
                continue
            if len(row) != len(headers):
                raise ValidationError(f'CSV line {reader.line_num}: expected {len(headers)} fields, got {len(row)}')
            records.append(row)
            if len(records) > 5000:
                raise ValidationError('CSV limit is 5,000 data rows')
        if not records:
            raise ValidationError('Include at least one data row')
        return (headers, records)
    except (csv.Error, StopIteration) as error:
        raise ValidationError(f'Invalid CSV: {error}') from error

def safe_csv(headers, records, *, include_header=True):

    def safe(value):
        if re.fullmatch('-[0-9]+(?:\\.[0-9]+)?', value):
            return value
        return "'" + value if value.lstrip().startswith(('=', '+', '-', '@')) or value.startswith(('\t', '\r')) else value
    output = io.StringIO(newline='')
    writer = csv.writer(output)
    if include_header:
        writer.writerow([safe(h) for h in headers])
    writer.writerows([[safe(value) for value in row] for row in records])
    return output.getvalue()

def sales(data):
    headers, records = parse(data)
    mapping = data.get('mapping', {})
    if not isinstance(mapping, dict):
        raise ValidationError('mapping must be an object')
    fields = {}
    for field in ('date', 'category', 'amount'):
        column = mapping.get(field, field)
        if not isinstance(column, str) or column not in headers:
            raise ValidationError(f'Select a valid {field} column')
        fields[field] = headers.index(column)
    if len(set(fields.values())) != 3:
        raise ValidationError('Date, category, and amount must use different columns')
    monthly, categories = (defaultdict(Decimal), defaultdict(Decimal))
    rejected, accepted = ([], 0)
    amounts = []
    for number, row in enumerate(records, 2):
        try:
            day_text = row[fields['date']].strip()
            try:
                day = date.fromisoformat(day_text)
            except ValueError:
                raise ValueError('Date must be a valid YYYY-MM-DD date') from None
            if day.isoformat() != day_text:
                raise ValueError('Date must be YYYY-MM-DD')
            category = row[fields['category']].strip()
            if not category:
                raise ValueError('Category is empty')
            raw = row[fields['amount']].strip()
            if not re.fullmatch('[+-]?[0-9]+(?:\\.[0-9]{1,2})?', raw):
                raise ValueError('Amount must be a plain number with at most two decimals')
            amount = Decimal(raw)
            if not amount.is_finite() or abs(amount) > Decimal('1000000000'):
                raise ValueError('Amount must be finite and within ±1 billion')
            if amount != amount.quantize(Decimal('.01')):
                raise ValueError('Amount must have at most two decimal places')
        except InvalidOperation:
            rejected.append({'record': number, 'reason': 'Amount must be a plain number with at most two decimals', 'values': row})
            continue
        except ValueError as error:
            rejected.append({'record': number, 'reason': str(error) or 'Invalid amount', 'values': row})
            continue
        accepted += 1
        amounts.append(amount)
        monthly[day.isoformat()[:7]] += amount
        categories[category] += amount
    total = sum(amounts, Decimal(0))
    money = lambda value: format(value.quantize(Decimal('.01')), 'f')
    return {'accepted_rows': accepted, 'rejected_rows': len(rejected), 'total': money(total), 'average': money(total / accepted) if accepted else None, 'refund_rows': sum((a < 0 for a in amounts)), 'monthly': [{'label': key, 'amount': money(value)} for key, value in sorted(monthly.items())], 'categories': [{'label': key, 'amount': money(value)} for key, value in sorted(categories.items(), key=lambda pair: pair[1], reverse=True)], 'rejections': rejected, 'rejected_csv': safe_csv(['record', 'reason', *headers], [[str(r['record']), r['reason'], *r['values']] for r in rejected])}
