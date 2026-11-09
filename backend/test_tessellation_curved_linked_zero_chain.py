"""Exact four-band zero-perturbation subdomain of the saved concentric example."""

import math
import unittest

import numpy as np

from tessellation_curved_linked_first_band_query import query_linked_first_band


class LinkedZeroChainTests(unittest.TestCase):
    def test_four_adjacent_bands_have_one_flat_sheet_and_exact_sample_metric(self):
        result = query_linked_first_band({
            'family': 'linked-concentric-first-band', 'variant': 'zero-chain',
            'segments': 32})
        cert = result['certification']
        self.assertEqual(result['family'], 'linked-concentric-zero-chain')
        self.assertTrue(cert['fourBandsAnalyticLocalIsometry'])
        self.assertTrue(cert['singleSheetContinuous'])
        self.assertTrue(cert['boundaryEndContact'])
        self.assertFalse(cert['wholeSavedPerturbedChainCertified'])
        self.assertFalse(cert['globalLayerOrderChecked'])
        self.assertFalse(cert['adoptableCreasePattern'])
        self.assertLess(cert['numericalMetricMaxError'], 1e-12)
        self.assertEqual(cert['foldAnglesDeg'], [120., -120., 120., -120.])
        rows = result['sample']['rows']
        self.assertEqual(len(rows), 33)
        for row in rows:
            self.assertEqual(len(row['flatCurves']), 5)
            self.assertEqual(len(row['foldedCurves']), 5)
            for index in range(4):
                flat = np.array(row['flatCurves'][index+1]) - np.array(row['flatCurves'][index])
                folded = np.array(row['foldedCurves'][index+1]) - np.array(row['foldedCurves'][index])
                self.assertAlmostEqual(np.linalg.norm(flat), .1, places=12)
                self.assertAlmostEqual(np.linalg.norm(folded), .1, places=12)
            for index, point in enumerate(row['flatCurves']):
                self.assertAlmostEqual(math.hypot(*point), 1.+.1*index, places=12)
        for start, end in zip(rows[0]['foldedCurves'], rows[-1]['foldedCurves']):
            self.assertLess(np.linalg.norm(np.array(start)-np.array(end)), 1e-12)
        # This endpoint identification prevents a claim of global embedding.
        self.assertGreater(np.linalg.norm(np.array(rows[0]['flatCurves'][0])-
                                          np.array(rows[-1]['flatCurves'][0])), 1.9)

    def test_legacy_saved_first_band_and_variant_validation_remain_separate(self):
        original = query_linked_first_band({'family':'linked-concentric-first-band', 'segments':8})
        self.assertEqual(original['family'], 'linked-concentric-first-band')
        self.assertEqual(original['source']['savedQ1Perturbation'], .1)
        for invalid in ({'family':'linked-concentric-first-band','variant':'zero-chain','segments':129},
                        {'family':'linked-concentric-first-band','variant':'saved-five-fold','segments':8},
                        {'family':'linked-concentric-first-band','variant':'zero-chain','segments':8,'claim':'foldable'}):
            with self.assertRaises(ValueError):query_linked_first_band(invalid)


if __name__ == '__main__':
    unittest.main()
