"""Read-only JSON entry for the two saved analytic curved-fold subfamilies."""

import math
import unittest

from tessellation_curved_saved_pair_query import (
    query_curved_saved_pair, validate_curved_saved_pair_query,
)
from tessellate import dispatch_request


class SavedPairQueryTests(unittest.TestCase):
    def test_cone_saved_input_and_shared_crease(self):
        result = query_curved_saved_pair({'family': 'cone-across-right'})
        self.assertEqual(result['source']['symbolicCell'], 'In[3999]')
        self.assertEqual(result['source']['numericalCell'], 'In[4002]')
        self.assertEqual(result['foldAngleDeg'], 120)
        sample = result['sample']
        self.assertEqual(len(sample['flatSamples']), 65 * 9)
        self.assertEqual(len(sample['flatSamples']), len(sample['foldedSamples']))
        self.assertEqual(sample['sideRows']['left'][0], sample['creaseIndices'])
        self.assertEqual(sample['sideRows']['right'][0], sample['creaseIndices'])
        middle = sample['creaseIndices'][32]
        for actual, expected in zip(sample['flatSamples'][middle], (0, 1)):
            self.assertAlmostEqual(actual, expected, places=12)
        for actual, expected in zip(sample['foldedSamples'][middle],
                                    (0, math.sqrt(3) / 2, .5)):
            self.assertAlmostEqual(actual, expected, places=12)
        self.assertTrue(result['certification']['continuousIsometryAnalytic'])
        self.assertFalse(result['certification']['exactStraightCreaseFOLD'])
        self.assertFalse(result['certification']['adoptableCreasePattern'])

    def test_both_signed_circle_saved_inputs(self):
        for orientation, symbolic, numerical in (
                (1, 'In[3973]', 'In[3978]'),
                (-1, 'In[3974]', 'In[3979]')):
            with self.subTest(orientation=orientation):
                result = query_curved_saved_pair({
                    'family': 'planar-circle-to-curved-fold-3d',
                    'orientation': orientation, 'curveSegments': 16,
                    'rulingSegments': 2})
                self.assertEqual(result['source']['symbolicCell'], symbolic)
                self.assertEqual(result['source']['numericalCell'], numerical)
                self.assertEqual(result['foldAngleDeg'], 120 * orientation)
                sample = result['sample']
                self.assertEqual(len(sample['flatSamples']), 17 * 5)
                self.assertEqual(sample['flatSamples'][0], (orientation, 0))
                self.assertEqual(sample['foldedSamples'][0], (1, 0, 0))
                self.assertEqual(sample['sideRows']['left'][0],
                                 sample['sideRows']['right'][0])
                self.assertFalse(result['certification']['sampledChordsExactIsometry'])

    def test_closed_and_bounded_query(self):
        cone = {'family': 'cone-across-right'}
        circle = {'family': 'planar-circle-to-curved-fold-3d'}
        for bad in (
                {**cone, 'expression': '__import__("os")'},
                {**cone, 'thetaDeg': '30'}, {**cone, 'thetaDeg': True},
                {**cone, 'leftWidth': 1},
                {**cone, 'parameterStartPi': .5},
                {**cone, 'parameterEndPi': 2},
                {**cone, 'curveSegments': 256, 'rulingSegments': 8},
                {**circle, 'orientation': 0},
                {**circle, 'rightWidth': 2},
                {**circle, 'parameterStartPi': 0},
                {**circle, 'curveSegments': 16.5},
                {**circle, 'leftWidth': float('nan')},
                {'family': 'custom'}, None,
        ):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    validate_curved_saved_pair_query(bad)

    def test_dedicated_dispatch_does_not_generate_crease_pattern(self):
        result = dispatch_request({'operation': 'curved-saved-pair',
                                   'family': 'cone-across-right',
                                   'curveSegments': 16, 'rulingSegments': 1})
        self.assertEqual(result['family'], 'origamica-curved-saved-pair')
        self.assertNotIn('fold', result)
        self.assertNotIn('vertices_coords', result)
        self.assertEqual(len(result['sample']['creaseIndices']), 17)


if __name__ == '__main__':
    unittest.main()
