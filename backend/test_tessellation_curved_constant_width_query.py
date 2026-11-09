"""Independent geometry and contract tests for saved In[3879]."""

import math
import unittest

from tessellation_curved_constant_width_query import (
    END, actual_circle_width, circle, query_constant_width_circle,
    tangent_extended_width, validate_constant_width_query)


class ConstantWidthCircleTests(unittest.TestCase):
    def test_saved_anchors_and_both_signed_branches(self):
        result = query_constant_width_circle({'family': 'constant-width-circle-in3879'})
        sample = result['sample']
        self.assertEqual(result['source']['definitionCell'], 'In[3878]')
        self.assertEqual(result['source']['savedCell'], 'In[3879]')
        self.assertFalse(result['source']['machineReadableWolframOut'])
        self.assertEqual(len(sample['parameterValues']), 81)
        self.assertAlmostEqual(sample['parameterValues'][-1], .35*math.pi)
        self.assertEqual(sample['sourceCurve'][0], [1, 0])
        self.assertAlmostEqual(sample['leftWidthValues'][0], .1)
        self.assertAlmostEqual(sample['rightWidthValues'][0], -.1)
        self.assertAlmostEqual(sample['leftBoundary'][0][0], .9)
        self.assertAlmostEqual(sample['rightBoundary'][0][0], 1.1)
        self.assertGreater(sample['leftWidthValues'][-1], .32)
        self.assertLess(sample['rightWidthValues'][-1], -.18)

    def test_perpendicular_distance_equation_for_every_sample(self):
        for width in (.02, .07, .1, .105):
            sample = query_constant_width_circle({
                'family': 'constant-width-circle-in3879', 'width': width,
                'segments': 256})['sample']
            for sign, boundary, values, feet, foot_points in (
                (1, 'leftBoundary', 'leftWidthValues', 'leftFootParameters',
                 'leftFootPoints'),
                (-1, 'rightBoundary', 'rightWidthValues', 'rightFootParameters',
                 'rightFootPoints'),
            ):
                for s, point, scale, ui, foot in zip(
                        sample['parameterValues'], sample[boundary],
                        sample[values], sample[feet], sample[foot_points]):
                    x, y = circle(s)
                    bx, by = circle(ui)
                    self.assertAlmostEqual(point[0], x-scale, places=13)
                    self.assertAlmostEqual(point[1], y, places=13)
                    self.assertAlmostEqual(foot[0], bx, places=13)
                    self.assertAlmostEqual(foot[1], by, places=13)
                    self.assertAlmostEqual(point[0], bx-sign*width*bx, places=12)
                    self.assertAlmostEqual(point[1], by-sign*width*by, places=12)
                    # The difference to b(ui) is normal to the tangent there.
                    self.assertAlmostEqual(
                        (point[0]-bx)*(-by)+(point[1]-by)*bx, 0,
                        places=12)
                    self.assertAlmostEqual(math.dist(point, foot), width, places=12)
                    self.assertLess(ui, math.pi/2)

    def test_real_saved_equation_continues_circle_past_end(self):
        sample = query_constant_width_circle({
            'family': 'constant-width-circle-in3879'})['sample']
        self.assertGreater(sample['leftFootParameters'][-1], END)
        self.assertLess(sample['rightFootParameters'][-1], END)
        self.assertAlmostEqual(actual_circle_width(END, .1)[0],
                               sample['leftWidthValues'][-1], places=14)
        intended = tangent_extended_width(END, .1)
        self.assertGreater(sample['leftWidthValues'][-1]-intended, .1)
        self.assertAlmostEqual(tangent_extended_width(0, .1), .1)

    def test_bounded_query_and_false_engineering_claims(self):
        valid = {'family': 'constant-width-circle-in3879'}
        certificate = query_constant_width_circle(valid)['certification']
        self.assertTrue(certificate['actualFootCanExceedDomain'])
        self.assertFalse(certificate['endpointTangentExtrapolationImplemented'])
        self.assertFalse(certificate['sampledBandExactFOLD'])
        self.assertFalse(certificate['adoptableCreasePattern'])
        for invalid in (None, [], {}, {**valid, 'formula': 'Sin[u]'},
                        {**valid, 'width': True}, {**valid, 'width': .11},
                        {**valid, 'width': float('nan')},
                        {**valid, 'segments': 16.5},
                        {**valid, 'segments': 300},
                        {**valid, 'segments': False}):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                validate_constant_width_query(invalid)
        for s, width in ((-1, .1), (END+.001, .1), (.5, .11)):
            with self.assertRaises(ValueError):
                actual_circle_width(s, width)


if __name__ == '__main__':
    unittest.main()
