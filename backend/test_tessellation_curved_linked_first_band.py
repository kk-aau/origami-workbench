"""Saved linked-circle first band's certified scope and numerical frame."""

import math
import unittest

import numpy as np

from tessellation_curved_linked_first_band_query import query_linked_first_band


class LinkedFirstBandTests(unittest.TestCase):
    def test_saved_first_band_keeps_both_boundaries_and_rejects_whole_chain_claim(self):
        result = query_linked_first_band({'family': 'linked-concentric-first-band',
                                          'segments': 32})
        rows = result['sample']['rows']
        self.assertEqual(len(rows), 33)
        self.assertTrue(np.allclose(rows[0]['flatFirst'], (1, 0)))
        self.assertTrue(np.allclose(rows[0]['flatSecond'], (1.1, 0)))
        self.assertTrue(np.allclose(rows[0]['foldedFirst'], (1, 0, 0)))
        self.assertTrue(np.allclose(rows[0]['foldedSecond'], (1.1, 0, 0)))
        middle = rows[8]  # s=π/4, where the notebook's later tangent is wrong.
        self.assertAlmostEqual(middle['s'], math.pi / 4, places=12)
        self.assertAlmostEqual(math.hypot(*middle['flatSecond']), 1.1, places=12)
        self.assertAlmostEqual(math.dist(middle['foldedFirst'],
                                         middle['foldedSecond']),
                               math.dist(middle['flatFirst'],
                                         middle['flatSecond']), delta=2e-9)
        cert = result['certification']
        self.assertTrue(cert['firstBandAnalyticLocalIsometry'])
        self.assertGreaterEqual(cert['firstBandRegularityMarginLowerBound'], .088 - 1e-15)
        self.assertLess(cert['firstBandNumericalFrameGramMaxError'], 2e-8)
        self.assertLess(cert['firstBandNumericalTangentMaxError'], 2e-8)
        self.assertFalse(cert['wholeFiveFoldChainCertified'])
        self.assertFalse(cert['exactStraightCreaseFOLD'])
        self.assertFalse(cert['adoptableCreasePattern'])

    def test_query_is_fixed_to_original_saved_family_and_bounded_sampling(self):
        for data in ({'family': 'linked-concentric-first-band', 'segments': 129},
                     {'family': 'linked-concentric-first-band', 'segments': True},
                     {'family': 'linked-concentric-first-band', 'segments': 32,
                      'gamma1': 120},
                     {'family': 'linked-five-folds', 'segments': 32}):
            with self.subTest(data=data), self.assertRaises(ValueError):
                query_linked_first_band(data)


if __name__ == '__main__':
    unittest.main()
