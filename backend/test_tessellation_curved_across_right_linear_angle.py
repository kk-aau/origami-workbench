"""Source-derived checks for Origamica In[3984]/In[3987]."""

import math
import unittest

import sympy as sp

from tessellation_curved_across_right_linear_angle import (
    FAMILY, certify_linear_angle_circle_across_right_2d,
)


class LinearAngleCircleAcrossRightTests(unittest.TestCase):
    def test_saved_inputs_have_source_derived_not_wolfram_output_anchors(self):
        fold = certify_linear_angle_circle_across_right_2d()
        self.assertEqual((fold.angle_slope, fold.parameter_start,
                          fold.parameter_end), (.5, .001, math.pi / 2))
        frame = fold.frame(math.pi / 2)
        t = math.sqrt(2) - 1  # tan(pi/8)
        d = math.hypot(.5, t)
        self.assertAlmostEqual(frame['crease'][0], 0, 14)
        self.assertAlmostEqual(frame['crease'][1], 1, 14)
        self.assertAlmostEqual(frame['rightRuling'][0], .5 / d, 14)
        self.assertAlmostEqual(frame['rightRuling'][1], t / d, 14)
        self.assertAlmostEqual(frame['foldAngleRad'], math.pi / 4, 14)
        self.assertLess(fold.frame(.001)['rightLeftNormalCoefficient'], 0)

    def test_right_ruling_is_exact_saved_2d_source_branch(self):
        k, u = sp.symbols('k u', positive=True)
        tangent = sp.Matrix([-sp.sin(u), sp.cos(u)])
        left_normal = sp.Matrix([-sp.cos(u), -sp.sin(u)])
        left_ruling = left_normal
        self.assertEqual(sp.trigsimp(tangent.dot(left_ruling)), 0)
        self.assertEqual(sp.trigsimp(left_normal.dot(left_ruling)), 1)
        # In[3983]: q=tan(gamma/2)*cot(rho_L)-gamma'/(speed*k_g).
        q = -k
        tan_half = sp.tan(k * u / 2)
        norm = sp.sqrt(q * q + tan_half * tan_half)
        right = q / norm * tangent - tan_half / norm * left_normal
        self.assertEqual(sp.simplify(right.dot(right)), 1)
        for at in (.001, .1, .7, math.pi / 2):
            frame = certify_linear_angle_circle_across_right_2d().frame(at)
            expected = [float(x.subs({k: sp.Rational(1, 2), u: at}))
                        for x in right]
            for actual, wanted in zip(frame['rightRuling'], expected):
                self.assertAlmostEqual(actual, wanted, 13)

    def test_jacobian_exact_sign_and_independent_differences(self):
        fold = certify_linear_angle_circle_across_right_2d(
            angle_slope=.7, right_width=2)
        h = 1e-6
        for side in ('left', 'right'):
            for u in (.01, .6, 1.4):
                for v in (.1, .5, .7):
                    exact = fold.signed_area_jacobian(side, u, v)
                    before, after = fold.surface(side, u-h, v), fold.surface(side, u+h, v)
                    low, high = fold.surface(side, u, v-h), fold.surface(side, u, v+h)
                    du = [(x-y)/(2*h) for x, y in zip(after, before)]
                    dv = [(x-y)/(2*h) for x, y in zip(high, low)]
                    measured = du[0]*dv[1]-du[1]*dv[0]
                    self.assertAlmostEqual(measured, exact, 8)
                    self.assertGreater(exact, 0) if side == 'left' else self.assertLess(exact, 0)
        # Source normalization gives beta=-t/D and delta'>0, so the right
        # Jacobian is negative for every allowed u and positive width.
        self.assertLess(fold.signed_area_jacobian('right', .001, 2), 0)
        near_focal = certify_linear_angle_circle_across_right_2d(left_width=.9999)
        self.assertGreater(near_focal.signed_area_jacobian('left', .001, .999), 0)

    def test_samples_only_describe_planar_curves(self):
        fold = certify_linear_angle_circle_across_right_2d()
        sample = fold.sample(64)
        self.assertEqual(sample['family'], FAMILY)
        self.assertEqual(len(sample['crease']), 65)
        self.assertEqual(sample['parameterValues'][0], .001)
        self.assertEqual(sample['parameterValues'][-1], math.pi/2)
        for key in ('crease', 'leftBoundary', 'rightBoundary'):
            self.assertEqual(len(sample[key]), 65)
            self.assertTrue(all(len(p)==2 and all(math.isfinite(x) for x in p)
                                for p in sample[key]))
        for forbidden in ('foldedSamples', 'faces', 'edges', 'foldAngles3D'):
            self.assertNotIn(forbidden, sample)

    def test_rejects_zero_angle_singularity_and_left_focal_width(self):
        for bad in ({'parameter_start': 0}, {'angle_slope': 0},
                    {'parameter_end': 2}, {'left_width': 1},
                    {'left_width': 0}, {'right_width': 0},
                    {'right_width': math.inf}, {'angle_slope': True}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                certify_linear_angle_circle_across_right_2d(**bad)
        fold = certify_linear_angle_circle_across_right_2d()
        with self.assertRaises(ValueError):
            fold.frame(0)
        with self.assertRaises(ValueError):
            fold.surface('left', .5, 1)
        with self.assertRaises(ValueError):
            fold.sample(True)


if __name__ == '__main__':
    unittest.main()
