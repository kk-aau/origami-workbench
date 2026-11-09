"""Bounded checks for the saved perturbed five-curve numerical diagram."""

import math
import unittest

from tessellation_curved_linked_first_band_query import query_linked_first_band


class P45LinkedChainTests(unittest.TestCase):
    def test_five_curve_source_rendering_is_read_only_and_preserves_first_band(self):
        query = {'family': 'linked-concentric-first-band',
                 'variant': 'saved-chain', 'segments': 32}
        result = query_linked_first_band(query)
        first = query_linked_first_band({'family': query['family'], 'segments': 32})
        self.assertEqual(result['source']['interpolationIntervals'], 32)
        self.assertFalse(result['source']['savedNumericalOut'])
        self.assertEqual(len(result['sample']['rows']), 33)
        for row, first_row in zip(result['sample']['rows'], first['sample']['rows']):
            self.assertEqual(len(row['flatCurves']), 5)
            self.assertEqual(len(row['foldedCurves']), 5)
            self.assertAlmostEqual(row['qValues'][1],
                                   row['s'] + .1 * math.sin(2 * row['s']), places=12)
            for index in (0, 1):
                self.assertLess(math.dist(row['foldedCurves'][index],
                                          first_row['foldedFirst' if index == 0 else
                                                    'foldedSecond']), 2e-9)
        self.assertAlmostEqual(result['sample']['rows'][8]['qValues'][0],
                               math.pi / 4, places=12)
        self.assertAlmostEqual(result['sample']['rows'][0]['foldAnglesDeg'][0],
                               -128.613238191, places=9)
        self.assertFalse(result['certification']['wholeSavedPerturbedChainCertified'])
        self.assertFalse(result['certification']['secondBandIsometric'])
        self.assertFalse(result['certification']['adoptableCreasePattern'])

    def test_root_residual_and_endpoint_sensitivity_are_visible(self):
        result = query_linked_first_band({'family': 'linked-concentric-first-band',
                                          'variant': 'saved-chain', 'segments': 8})
        diagnostics = result['diagnostics']
        self.assertLess(diagnostics['maxNodeRootResidual'], 1e-10)
        self.assertAlmostEqual(diagnostics['secondBandGeodesicMismatchAtZero'],
                               396 / 665, places=12)
        self.assertAlmostEqual(diagnostics['cachedTangentErrorAtPiOver4Rad'],
                               .1, places=12)
        ends = diagnostics['q4EndpointByIntervals16_32_64']
        self.assertEqual(len(ends), 3)
        self.assertLess(ends[0][0], ends[1][0])
        self.assertLess(ends[1][0], ends[2][0])
        self.assertLess(ends[1][0], 0.)
        self.assertGreater(ends[1][1], math.pi)
        self.assertAlmostEqual(ends[1][0], result['sample']['rows'][0]['qValues'][4],
                               places=12)
        self.assertGreater(diagnostics['q4EndpointExtrapolation'], .006)
        self.assertFalse(result['certification']['wolframNumericalOutputReproduced'])

    def test_original_interpolation_points_option_changes_only_local_diagram(self):
        base = {'family': 'linked-concentric-first-band',
                'variant': 'saved-chain', 'segments': 8}
        default = query_linked_first_band(base)
        dense = query_linked_first_band({**base, 'interpolationPoints': 64})
        self.assertEqual(dense['query']['interpolationPoints'], 64)
        self.assertEqual(dense['source']['interpolationIntervals'], 64)
        self.assertFalse(dense['certification']['adoptableCreasePattern'])
        self.assertLess(dense['diagnostics']['maxNodeRootResidual'], 1e-10)
        self.assertLess(dense['diagnostics']['q4EndpointExtrapolation'],
                        default['diagnostics']['q4EndpointExtrapolation'])
        self.assertGreater(abs(dense['sample']['rows'][0]['qValues'][4] -
                               default['sample']['rows'][0]['qValues'][4]), .003)
        for original, altered in zip(default['sample']['rows'], dense['sample']['rows']):
            for index in (0, 1):
                self.assertLess(math.dist(original['foldedCurves'][index],
                                          altered['foldedCurves'][index]), 1e-12)
        for points in (8, 128):
            with self.subTest(points=points):
                result = query_linked_first_band({**base,
                                                  'interpolationPoints': points})
                self.assertEqual(result['source']['interpolationIntervals'], points)
                self.assertFalse(result['certification']['secondBandIsometric'])

    def test_fixed_source_parameters_and_bounded_render_sampling(self):
        for data in ({'family': 'linked-concentric-first-band',
                      'variant': 'saved-chain', 'segments': 129},
                     {'family': 'linked-concentric-first-band',
                      'variant': 'saved-chain', 'segments': True},
                     {'family': 'linked-concentric-first-band',
                      'variant': 'saved-chain', 'segments': 32, 'epsilon': 0},
                     {'family': 'linked-concentric-first-band',
                      'variant': 'saved-chain', 'segments': 32,
                      'interpolationPoints': True},
                     {'family': 'linked-concentric-first-band',
                      'variant': 'saved-chain', 'segments': 32,
                      'interpolationPoints': 129},
                     {'family': 'linked-concentric-first-band',
                      'segments': 32, 'interpolationPoints': 64},
                     {'family': 'linked-concentric-first-band',
                      'variant': 'other', 'segments': 32}):
            with self.subTest(data=data), self.assertRaises(ValueError):
                query_linked_first_band(data)


if __name__ == '__main__':
    unittest.main()
