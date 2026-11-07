import json
import csv
import io
from contextlib import closing
import sqlite3
import tempfile
import unittest
from pathlib import Path
from portfolio import capabilities as c, data_apps as d
from portfolio.db import initialize, connect, SCHEMA
from portfolio.validation import ValidationError, NotFoundError

def enhanced(path, data, function):
    return c.enrich(path, data, function(data))

class AnalysisCapabilities(unittest.TestCase):

    def test_revenue_rejects_nonplain_amounts_without_breaking_reconciliation(self):
        values = ['1e2', '1_000', '1.000', 'NaN', 'Infinity', '100.00', '-25.25']
        data = {'csv': 'date,category,amount\n' + '\n'.join((f'2026-01-01,A,{v}' for v in values))}
        r = enhanced('/api/data/sales', data, d.sales)
        self.assertEqual((r['accepted_rows'], r['rejected_rows'], r['total']), (2, 5, '74.75'))
        self.assertEqual(r['capabilities']['tables'][1]['rows'][0][:3], ['100.00', '25.25', '74.75'])

    def test_sales_growth_crosses_century_with_canonical_month_keys(self):
        result = enhanced('/api/data/sales', {'csv': 'date,category,amount\n1000-01-01,A,20.00\n0999-12-31,A,10.00'}, d.sales)
        trend = result['capabilities']['tables'][0]['rows']
        self.assertEqual([row[0] for row in trend], ['0999-12', '1000-01'])
        self.assertEqual(trend[1][2], 100.0)
        self.assertEqual(trend[1][3], 'Consecutive observed months')

    def test_revenue_growth_gaps_refunds_and_invalid_rows(self):
        data = {'csv': 'date,category,amount\n2026-01-01,A,100\n2026-02-01,A,120\n2026-02-02,A,-20\n2026-04-01,A,50\nbad,A,999\n'}
        tables = enhanced('/api/data/sales', data, d.sales)['capabilities']['tables']
        self.assertEqual(tables[0]['rows'][1][2], 0)
        self.assertEqual(tables[0]['rows'][2][2], 'N/A')
        self.assertEqual(tables[1]['rows'][0][:3], ['270', '20', '250.00'])
if __name__ == '__main__':
    unittest.main()
