from decimal import Decimal
from . import data_apps

def table(title, headers, rows):
    return {'title': title, 'headers': headers, 'rows': rows}

def enrich(path, data, result):
    """Attach diagnostics without changing existing response fields."""
    tables, notes = ([], [])
    trend = []
    previous = None
    for item in result['monthly']:
        value = Decimal(item['amount'])
        label = item['label']
        growth = None
        reason = 'First observed month'
        if previous:
            y, m = map(int, label.split('-'))
            py, pm = map(int, previous[0].split('-'))
            if y * 12 + m != py * 12 + pm + 1:
                reason = 'Gap in observed months'
            elif previous[1] <= 0:
                reason = 'Prior net amount is nonpositive'
            else:
                growth = (value - previous[1]) / previous[1] * 100
                reason = 'Consecutive observed months'
        trend.append([label, str(value), round(float(growth), 2) if growth is not None else 'N/A', reason])
        previous = (label, value)
    headers, rows = data_apps.parse(data)
    idx = headers.index(data.get('mapping', {}).get('amount', 'amount'))
    rejected = {r['record'] for r in result['rejections']}
    amounts = [Decimal(row[idx].strip()) for i, row in enumerate(rows, 2) if i not in rejected]
    gross = sum((v for v in amounts if v > 0), Decimal(0))
    refunds = -sum((v for v in amounts if v < 0), Decimal(0))
    tables = [table('Monthly growth', ['Month', 'Net amount', 'Growth %', 'Comparison'], trend), table('Revenue reconciliation', ['Gross positive sales', 'Refund magnitude', 'Net amount', 'Refund / gross %'], [[str(gross), str(refunds), result['total'], round(float(refunds / gross * 100), 2) if gross else 'N/A']])]
    notes = ['Growth does not bridge missing months. Partial-month coverage is not inferred; compare equivalent reporting periods. Refund ratio uses gross positive sales as the denominator.']
    if tables or notes:
        result['capabilities'] = {'tables': tables, 'notes': notes}
    return result
