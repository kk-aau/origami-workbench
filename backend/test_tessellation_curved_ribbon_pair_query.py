"""Bounded read-only query for the saved helical RibbonPair examples."""

import json
import math
import unittest

from tessellation_curved_ribbon_pair_query import (
    query_curved_ribbon_pair, validate_curved_ribbon_pair_query,
)


class CurvedRibbonPairQueryTests(unittest.TestCase):
    def test_saved_pair_has_corresponding_base_and_explicit_limits(self):
        result = query_curved_ribbon_pair({})
        self.assertEqual(result['source']['symbolicCell'], 'In[3855]')
        self.assertEqual(result['source']['numericalCell'], 'In[3859]')
        self.assertFalse(result['source']['machineReadableWolframOut'])
        self.assertEqual(result['query']['curveSegments'], 200)
        self.assertEqual(result['query']['rulingSegments'], 20)
        sample = result['sample']
        self.assertEqual(len(sample['parameters']), 201 * 21)
        self.assertEqual(len(sample['flatSamples']), len(sample['spaceSamples']))
        self.assertEqual(sample['baseIndices'], [i * 21 + 10 for i in range(201)])
        self.assertEqual(sample['parameters'][sample['baseIndices'][0]], (0, 0))
        self.assertEqual(sample['flatSamples'][sample['baseIndices'][0]], (0, 0))
        self.assertEqual(sample['spaceSamples'][sample['baseIndices'][0]], (1, 0, 0))
        self.assertAlmostEqual(sample['focalDistance'], 2.401133004380, places=10)
        end = sample['baseIndices'][-1]
        self.assertAlmostEqual(sample['parameters'][end][0], math.pi)
        self.assertAlmostEqual(sample['spaceSamples'][end][0], -1)
        self.assertTrue(result['certification']['continuousIsometryAnalytic'])
        for field in ('sampledChordsExactIsometry', 'exactStraightCreaseFOLD',
                      'adoptableCreasePattern', 'deploymentPathChecked',
                      'selfCollisionChecked'):
            self.assertFalse(result['certification'][field])
        self.assertNotIn('fold', result)
        self.assertNotIn('vertices_coords', result)
        json.dumps(result, allow_nan=False)

    def test_certified_extensions_keep_common_parameter_grid(self):
        result = query_curved_ribbon_pair({
            'radius': 1.4, 'pitch': .3, 'etaPi': .3,
            'orientation': -1, 'parameterStartPi': -.5,
            'parameterEndPi': .5, 'halfWidth': .4,
            'curveSegments': 16, 'rulingSegments': 2,
        })
        sample = result['sample']
        self.assertEqual(len(sample['flatSamples']), 51)
        self.assertEqual(sample['baseIndices'], [3 * i + 1 for i in range(17)])
        for index in sample['baseIndices']:
            self.assertAlmostEqual(sample['parameters'][index][1], 0)
        self.assertGreater(sample['focalDistance'], result['query']['halfWidth'])

    def test_rejects_expressions_degenerate_intervals_and_focal_width(self):
        for bad in (
            None, [], {'expression': '__import__("os")'},
            {'radius': '1'}, {'radius': True}, {'radius': float('nan')},
            {'pitch': 0}, {'etaPi': .5}, {'orientation': 0},
            {'orientation': True}, {'parameterStartPi': 1},
            {'parameterEndPi': 2}, {'halfWidth': 0},
            {'etaPi': .05, 'halfWidth': .5},
            {'curveSegments': 257}, {'curveSegments': 16.5},
            {'curveSegments': 256, 'rulingSegments': 20},
            {'rulingSegments': 3}, {'rulingSegments': 21},
        ):
            with self.subTest(bad=bad):
                for function in (validate_curved_ribbon_pair_query,
                                 query_curved_ribbon_pair):
                    with self.assertRaises(ValueError):
                        function(bad)


if __name__ == '__main__':
    unittest.main()
