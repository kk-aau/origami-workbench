"""Independent source-equation checks for the saved planar-circle refolds."""

import math
import unittest

import sympy as sp

from tessellation_curved_fold_from_planar_circle import (
    fold_curved_circle_3d, nfold_curved_circle_3d,
)


U, V = sp.symbols('u v', real=True)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def derivative(vector):
    return tuple(sp.diff(x, U) for x in vector)


def zero(value):
    return sp.simplify(sp.trigsimp(value)) == 0


class PlanarCircleRefoldTests(unittest.TestCase):
    def test_saved_inputs_satisfy_fold_angle_ode_and_frenet_initial_values(self):
        # Origamica In[3972]/In[3977], source lines 324854-325065 and
        # 325554-325768.  The flat rulings are left/-right normals, so both
        # cot(rho) terms vanish and the unique signed-angle branch is constant.
        for orientation in (1, -1):
            with self.subTest(orientation=orientation):
                ex = fold_curved_circle_3d(orientation).exact_expressions(U)
                f, r_left, r_right = (ex[name] for name in
                    ('flatCrease', 'flatLeftRuling', 'flatRightRuling'))
                F = ex['foldedCrease']
                gamma = ex['foldAngleRad']
                tangent = derivative(f)
                left_normal = (-tangent[1], tangent[0])
                k_left = tangent[0] * sp.diff(tangent[1], U) - tangent[1] * sp.diff(tangent[0], U)
                self.assertTrue(zero(dot(tangent, tangent) - 1))
                self.assertTrue(zero(k_left - orientation * sp.Rational(1, 2)))
                self.assertTrue(zero(dot(tangent, r_left)))
                self.assertTrue(zero(dot(tangent, r_right)))
                self.assertTrue(zero(dot(left_normal, r_left) - 1))
                self.assertTrue(zero(dot(left_normal, r_right) + 1))
                cot_left = dot(tangent, r_left) / dot(left_normal, r_left)
                cot_right = dot(tangent, r_right) / -dot(left_normal, r_right)
                self.assertTrue(zero(sp.diff(gamma, U) * sp.cot(gamma / 2)
                                     - k_left * (cot_left - cot_right)))

                T = derivative(F)
                N = derivative(T)
                B = cross(T, N)
                self.assertTrue(zero(dot(T, T) - 1))
                self.assertTrue(zero(dot(N, N) - 1))
                self.assertTrue(zero(dot(B, B) - 1))
                self.assertTrue(zero(sp.Abs(k_left) * sp.sec(gamma / 2) - 1))
                self.assertTrue(zero(sp.tan(gamma / 2) * k_left
                                     * (cot_left + cot_right) / 2))
                for actual, expected in zip(F, (1, 0, 0)):
                    self.assertTrue(zero(actual.subs(U, 0) - expected))
                for actual, expected in zip(T, (0, 1, 0)):
                    self.assertTrue(zero(actual.subs(U, 0) - expected))
                for actual, expected in zip(B, (0, 0, orientation)):
                    self.assertTrue(zero(actual.subs(U, 0) - expected))

                sigma = sp.Integer(orientation)
                ll = tuple(sigma * (sp.cos(gamma / 2) * n
                                    + sp.sin(gamma / 2) * b)
                           for n, b in zip(N, B))
                lr = tuple(sigma * (sp.cos(gamma / 2) * n
                                    - sp.sin(gamma / 2) * b)
                           for n, b in zip(N, B))
                for actual, expected in zip(ex['foldedLeftRuling'], ll):
                    self.assertTrue(zero(actual - expected))
                for actual, expected in zip(ex['foldedRightRuling'], lr):
                    self.assertTrue(zero(actual + expected))

    def test_continuous_metric_developability_and_signed_fold_angle(self):
        for orientation in (1, -1):
            fold = fold_curved_circle_3d(orientation, left_width=.8,
                                         right_width=1.4)
            ex = fold.exact_expressions(U)
            T = derivative(ex['foldedCrease'])
            for side in ('Left', 'Right'):
                forms = []
                for prefix in ('flat', 'folded'):
                    crease = ex[f'{prefix}Crease']
                    ruling = ex[f'{prefix}{side}Ruling']
                    surface = tuple(x + V * r for x, r in zip(crease, ruling))
                    du = derivative(surface)
                    dv = ruling
                    forms.append((dot(du, du), dot(du, dv), dot(dv, dv)))
                factor = (1 - orientation * V / 2 if side == 'Left'
                          else 1 + orientation * V / 2)
                for actual, expected in zip(forms[0], (factor**2, 0, 1)):
                    self.assertTrue(zero(actual - expected))
                for a, b in zip(forms[0], forms[1]):
                    self.assertTrue(zero(a - b))
                ruling = ex[f'folded{side}Ruling']
                self.assertTrue(zero(dot(T, cross(ruling, derivative(ruling)))))

            for u in (.25, 1.2, 2.8):
                frame = fold.frame(u)
                tangent = (-orientation * math.sin(u), math.cos(u), 0)
                nl = cross(tangent, frame['foldedLeftRuling'])
                nr = tuple(-x for x in cross(tangent, frame['foldedRightRuling']))
                signed_angle = math.atan2(dot(tangent, cross(nr, nl)), dot(nl, nr))
                self.assertAlmostEqual(signed_angle, fold.fold_angle_rad)
                for side in ('left', 'right'):
                    for v in (0, .2, .7):
                        forms = (fold.first_form(dim, side, u, v) for dim in (2, 3))
                        flat, folded = forms
                        for x, y in zip(flat, folded):
                            self.assertAlmostEqual(x, y, places=13)
                        self.assertGreater(flat[0] * flat[2] - flat[1]**2, 0)

    def test_numeric_saved_inputs_share_crease_and_evaluate_exact_solution(self):
        for orientation in (1, -1):
            fold = fold_curved_circle_3d(orientation)
            sample = nfold_curved_circle_3d(orientation, curve_segments=16,
                                             ruling_segments=2)
            exact_sample = fold.sample(curve_segments=16, ruling_segments=2)
            self.assertEqual(sample['numericalRecovery'],
                             'closed-form-evaluation-of-source-ivp')
            self.assertEqual(sample['flatSamples'], exact_sample['flatSamples'])
            for numeric, exact in zip(sample['foldedSamples'],
                                      exact_sample['foldedSamples']):
                for actual, target in zip(numeric, exact):
                    self.assertAlmostEqual(actual, target, delta=2e-11)
            self.assertEqual(len(sample['flatSamples']), 17 * 5)
            self.assertEqual(sample['sideRows']['left'][0], sample['creaseIndices'])
            self.assertEqual(sample['sideRows']['right'][0], sample['creaseIndices'])
            self.assertFalse(sample['sampledChordsExactIsometry'])
            self.assertFalse(sample['deploymentPathChecked'])
            for index in (0, 4, 8, 12, 16):
                u = sample['parameterValues'][index]
                ex = fold.exact_expressions(U)
                for key, points in (('flatCrease', sample['flatSamples']),
                                    ('foldedCrease', sample['foldedSamples'])):
                    expected = tuple(float(x.subs(U, u)) for x in ex[key])
                    for actual, target in zip(points[index], expected):
                        self.assertAlmostEqual(actual, target, places=14)
            flat_chord = math.dist(sample['flatSamples'][0],
                                   sample['flatSamples'][16])
            folded_chord = math.dist(sample['foldedSamples'][0],
                                     sample['foldedSamples'][16])
            self.assertGreater(abs(flat_chord - folded_chord), .5)

    def test_rejects_other_input_branches_and_focal_distance(self):
        for orientation in (0, 2, True, 1.0):
            with self.assertRaises(ValueError):
                fold_curved_circle_3d(orientation)
        for width in (-1, 0, 2, math.inf, float('nan'), True):
            with self.assertRaises(ValueError):
                fold_curved_circle_3d(left_width=width)
        fold = fold_curved_circle_3d()
        for index, call in enumerate((lambda: fold.frame(-.1),
                     lambda: fold.frame(math.pi + .1),
                     lambda: fold.surface(4, 'left', .5, .5),
                     lambda: fold.surface(2, 'middle', .5, .5),
                     lambda: fold.surface(2, 'left', .5, 1.1),
                     lambda: fold.sample(curve_segments=True),
                     lambda: fold.sample(ruling_segments=0),
                     lambda: fold.exact_expressions(sp.Symbol('x')))):
            with self.subTest(index=index):
                with self.assertRaises(ValueError):
                    call()


if __name__ == '__main__':
    unittest.main()
