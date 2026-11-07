import csv
import io
import json
import unittest
from portfolio import data_apps as d
from portfolio.validation import ValidationError

class DataTests(unittest.TestCase):

    def test_csv_quotes_bom_and_embedded_newline(self):
        headers, rows = d.parse({'csv': '\ufeffname,note\nAda,"hello, world\nsecond line"\n'})
        self.assertEqual(headers, ['name', 'note'])
        self.assertEqual(rows, [['Ada', 'hello, world\nsecond line']])

    def test_csv_rejects_invalid_shapes_and_limits(self):
        for source in ['', 'x,x\n1,2', 'x,\n1,2', 'x,y\n1', 'x\n"unterminated', 'x\n' + '1\n' * 5001, 'x\n' + 'a' * 1000001]:
            with self.subTest(source=source[:30]), self.assertRaises(ValidationError):
                d.parse({'csv': source})

    def test_sales_exact_decimal_refunds_and_rejections(self):
        result = d.sales({'csv': 'date,category,amount\n2026-01-01,A,0.10\n2026-01-02,A,0.20\n2026-02-01,B,-0.05\n2026-02-30,A,9\n2026-02-01,A,NaN\n2026-02-01,A,1.001\n'})
        self.assertEqual(result['total'], '0.25')
        self.assertEqual(result['monthly'], [{'label': '2026-01', 'amount': '0.30'}, {'label': '2026-02', 'amount': '-0.05'}])
        self.assertEqual((result['accepted_rows'], result['rejected_rows'], result['refund_rows']), (3, 3, 1))

    def test_sales_month_keys_remain_iso_padded_across_the_supported_date_range(self):
        dates = ['1000-01-01', '0001-12-31', '0999-12-31', '0099-01-01', '0001-01-01', '9999-12-31']
        result = d.sales({'csv': 'date,category,amount\n' + '\n'.join((f'{day},Demo,1.00' for day in dates))})
        self.assertEqual([item['label'] for item in result['monthly']], ['0001-01', '0001-12', '0099-01', '0999-12', '1000-01', '9999-12'])
        self.assertEqual(result['accepted_rows'], len(dates))
        self.assertEqual(result['total'], '6.00')

    def test_sales_mapping_and_all_invalid(self):
        result = d.sales({'csv': 'day,team,net\nwrong,A,9\n', 'mapping': {'date': 'day', 'category': 'team', 'amount': 'net'}})
        self.assertEqual(result['total'], '0.00')
        self.assertIsNone(result['average'])
        self.assertEqual(result['accepted_rows'], 0)
        with self.assertRaises(ValidationError):
            d.sales({'csv': 'x\n1', 'mapping': {'date': 'x', 'category': 'x', 'amount': 'x'}})
