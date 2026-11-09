"""JSON-only read-only entry for the certified curved-space-curve core."""

import json
import math
import unittest

from tessellation_curved_space_curve_query import (
    query_curved_space_curve, validate_curved_space_curve_query,
)
from tessellation_curved_uniform_helix import uniform_helix_curved_fold_frame


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def output_metric_error(sample, distance):
    """Finite-difference the returned samples; this is only a convergence check."""
    frames = sample['frames']
    errors = []
    for i in (len(frames) // 5, len(frames) // 2, 4 * len(frames) // 5):
        delta = frames[i + 1]['u'] - frames[i - 1]['u']
        for side in ('Left', 'Right'):
            metrics = []
            for prefix in ('flat', 'folded'):
                def point(frame):
                    return tuple(x + distance * r for x, r in zip(
                        frame[f'{prefix}Crease'],
                        frame[f'{prefix}{side}Ruling']))
                before, after = point(frames[i - 1]), point(frames[i + 1])
                du = tuple((a - b) / delta for a, b in zip(after, before))
                ruling = frames[i][f'{prefix}{side}Ruling']
                metrics.append((dot(du, du), dot(du, ruling),
                                dot(ruling, ruling)))
            errors.extend(abs(a - b) for a, b in zip(*metrics))
    return max(errors)


class CurvedSpaceCurveQueryTests(unittest.TestCase):
    def assert_close(self, actual, expected, tolerance=1e-9):
        self.assertLessEqual(abs(actual - expected), tolerance)

    def test_saved_circle_input_has_exact_source_derived_plane_anchor(self):
        result = query_curved_space_curve({'family': 'planar-circle'})
        self.assertEqual(len(result['sample']['frames']), 97)
        self.assertEqual(len(result['sample']['flatVertices']), 873)
        self.assertEqual(len(result['sample']['faces']), 1536)
        self.assertEqual(result['sample']['creaseVertexIndices'],
                         list(range(97)))
        first, middle, final = (result['sample']['frames'][i]
                                for i in (0, 48, 96))
        self.assertEqual(first['flatCrease'], [1.0, 0.0])
        self.assertEqual(first['foldedCrease'], [1.0, 0.0, 0.0])
        self.assert_close(middle['flatCrease'][0], math.sqrt(2) - 1)
        self.assert_close(middle['flatCrease'][1], math.sqrt(2))
        self.assert_close(final['flatCrease'][0], -1)
        self.assert_close(final['flatCrease'][1], 2)
        self.assert_close(first['foldedLeftRuling'][0], -.5)
        self.assert_close(first['foldedRightRuling'][0], .5)
        certification = result['certification']
        self.assertTrue(certification['bothSidesDevelopableAnalytic'])
        self.assertTrue(certification['pairedContinuousIsometryAnalytic'])
        self.assertTrue(certification['rulingWidthBeforeFocalSetCertified'])
        self.assertFalse(certification['sampledMeshExactIsometry'])
        self.assertFalse(certification['exactStraightCreaseFOLD'])
        self.assertFalse(certification['deploymentPathChecked'])
        self.assertFalse(certification['selfCollisionChecked'])
        json.dumps(result, allow_nan=False)

    def test_saved_helix_input_matches_specialized_analytic_constructor(self):
        result = query_curved_space_curve({'family': 'circular-helix'})
        theta = math.atan(.5)
        frames = result['sample']['frames']
        for i in (0, 17, 48, 79, 96):
            frame = frames[i]
            special = uniform_helix_curved_fold_frame(
                1, theta, math.pi / 2, frame['u'])
            for name in ('flatCrease', 'foldedCrease', 'flatLeftRuling',
                         'flatRightRuling', 'foldedLeftRuling',
                         'foldedRightRuling'):
                for actual, expected in zip(frame[name], special[name]):
                    self.assert_close(actual, expected)
        self.assertEqual(result['query']['pitchPerRadian'], .5)
        self.assertEqual(result['sample']['parameterRange'], [0.0, math.pi])

    def test_non_circle_and_linear_angle_queries_preserve_smooth_metric(self):
        examples = (
            {'family': 'planar-ellipse'},
            {'family': 'planar-circle', 'parameterEndPi': .5,
             'foldAngleStartDeg': 90, 'foldAngleEndDeg': 96,
             'rulingWidth': .1},
        )
        for request in examples:
            with self.subTest(request=request):
                coarse = query_curved_space_curve(request)
                fine = query_curved_space_curve({**request,
                                                 'curveSegments': 192})
                width = coarse['query']['rulingWidth']
                coarse_error = output_metric_error(coarse['sample'], width / 2)
                fine_error = output_metric_error(fine['sample'], width / 2)
                self.assertGreater(coarse_error, 0)
                self.assertLess(fine_error, coarse_error / 3)
                self.assertLess(fine_error, 2e-4)
                self.assertTrue(coarse['certification'][
                    'pairedContinuousIsometryAnalytic'])
                json.dumps(coarse, allow_nan=False)
        ellipse = query_curved_space_curve({'family': 'planar-ellipse'})
        self.assertEqual(ellipse['sample']['frames'][0]['foldedCrease'],
                         [2.0, 0.0, 0.0])

    def test_closed_contract_rejects_code_text_bad_ranges_and_unsafe_width(self):
        invalid = (
            {},
            {'family': ['planar-circle']},
            {'family': 'not-a-family'},
            {'family': 'planar-circle', 'curve': ['cos(u)', 'sin(u)', '0']},
            {'family': 'planar-circle', 'radius': '__import__("os")'},
            {'family': 'planar-circle', 'radius': True},
            {'family': 'planar-circle', 'radius': math.nan},
            {'family': 'planar-circle', 'radius': 10**1000},
            {'family': 'planar-circle', 'rulingWidth': math.inf},
            {'family': 'planar-circle', 'parameterEndPi': 0},
            {'family': 'planar-circle', 'parameterStartPi': -2,
             'parameterEndPi': 2},
            {'family': 'planar-circle', 'foldAngleStartDeg': 0},
            {'family': 'planar-circle', 'orientation': 0},
            {'family': 'planar-circle', 'curveSegments': 96.5},
            {'family': 'planar-circle', 'curveSegments': 512,
             'rulingSegments': 16},
            {'family': 'planar-ellipse', 'axisX': 1, 'axisY': 1},
            {'family': 'circular-helix', 'foldAngleEndDeg': 100},
        )
        for request in invalid:
            with self.subTest(request=request):
                with self.assertRaises(ValueError):
                    validate_curved_space_curve_query(request)
        for request in (
            {'family': 'planar-circle', 'rulingWidth': 2},
            {'family': 'planar-circle', 'parameterEndPi': .5,
             'foldAngleStartDeg': 90, 'foldAngleEndDeg': 170,
             'rulingWidth': 4},
        ):
            with self.subTest(request=request):
                with self.assertRaises(ValueError):
                    query_curved_space_curve(request)


if __name__ == '__main__':
    unittest.main()
