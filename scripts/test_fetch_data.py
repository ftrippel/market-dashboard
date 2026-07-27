import unittest
from unittest.mock import patch

import pandas as pd

from scripts import fetch_data


class LatestCloseRepairTests(unittest.TestCase):
    def tearDown(self):
        fetch_data.YAHOO_QUOTE_SNAPSHOTS = {}

    def test_volume_only_latest_row_triggers_individual_repair(self):
        batch_history = pd.DataFrame(
            {
                'Open': [138.52, float('nan')],
                'High': [142.33, float('nan')],
                'Low': [138.15, float('nan')],
                'Close': [139.49, float('nan')],
                'Volume': [12_732_100, 8_907_633],
            },
            index=pd.to_datetime(['2026-07-23', '2026-07-24']),
        )
        individual_history = batch_history.copy()
        metadata = {
            'regularMarketPrice': 136.69,
            'regularMarketTime': 1_784_923_200,
            'previousClose': 139.49,
            'exchangeTimezoneName': 'America/New_York',
        }

        self.assertTrue(fetch_data._latest_price_row_has_missing_close(batch_history))

        with patch.object(
            fetch_data,
            '_fetch_yfinance_history',
            return_value=(individual_history, metadata),
        ):
            metrics = fetch_data._extract_batch_metrics(batch_history, 'USO')

        self.assertEqual(metrics['price'], 136.69)
        self.assertEqual(metrics['d1'], -2.01)
        self.assertEqual(metrics['updatedAt'], 1_784_923_200_000)

    def test_empty_shared_calendar_row_does_not_trigger_repair(self):
        history = pd.DataFrame(
            {
                'Open': [138.52, float('nan')],
                'High': [142.33, float('nan')],
                'Low': [138.15, float('nan')],
                'Close': [139.49, float('nan')],
                'Volume': [12_732_100, float('nan')],
            },
            index=pd.to_datetime(['2026-07-23', '2026-07-24']),
        )

        self.assertFalse(fetch_data._latest_price_row_has_missing_close(history))

    def test_batch_quote_snapshot_is_authoritative_for_price_and_one_day_change(self):
        history = pd.DataFrame(
            {
                'Open': [321.73, 334.90],
                'High': [323.30, 338.14],
                'Low': [319.35, 334.02],
                'Close': [321.66, 336.97],
                'Volume': [40_840_800, 14_700_000],
            },
            index=pd.to_datetime(['2026-07-23', '2026-07-27']),
        )
        fetch_data.YAHOO_QUOTE_SNAPSHOTS = {
            'AAPL': {
                'regularMarketPrice': 336.97,
                'previousClose': 333.02,
                'regularMarketTime': 1_785_164_114,
            },
        }

        metrics = fetch_data.extract_metrics(history, 'AAPL', yield_syms=[])

        self.assertEqual(metrics['price'], 336.97)
        self.assertEqual(metrics['d1'], 1.19)
        self.assertEqual(metrics['updatedAt'], 1_785_164_114_000)


if __name__ == '__main__':
    unittest.main()
