"""Analytic checks for saved ReshapeGeneric3D cylinder examples."""

import math
import unittest

import sympy as sp

from tessellation_curved_generic_cylinder_reshape import (
    INITIAL, certify_saved_generic_cylinder_reshape,
)


class SavedGenericCylinderReshapeTests(unittest.TestCase):
    def test_source_inputs_and_target_initial_conditions(self):
        self.assertEqual(INITIAL, {'u': 0, 'b': (0, 0, 0), 'd': (0, 1, 0),
                                   't': (1, 0, 0), 'sigma': 1})
        flatten = certify_saved_generic_cylinder_reshape()
        curl = certify_saved_generic_cylinder_reshape('curl-plane')
        self.assertEqual(flatten.surface('source', 0, 0), (-1, 0, 0))
        self.assertEqual(curl.surface('source', 0, 0), (0, 0, 0))
        for case in (flatten, curl):
            target = case.frame('target', 0)
            self.assertEqual(target['b'], INITIAL['b'])
            self.assertEqual(target['d'], INITIAL['d'])
            self.assertEqual(target['t'], INITIAL['t'])
            self.assertEqual(target['normal'], (0, 0, 1))
            self.assertEqual(target['l'], (0, 1, 0))

    def test_darboux_equations_force_the_two_saved_targets(self):
        u = sp.symbols('u', real=True)
        for kappa, expected in ((0, sp.Matrix([u, 0, 0])),
                                (1, sp.Matrix([sp.sin(u), 0, 1-sp.cos(u)]))):
            b = expected
            t = sp.diff(b, u)
            d = sp.Matrix([0, 1, 0])
            normal = t.cross(d)
            left = normal.cross(t)
            self.assertEqual(sp.simplify(sp.diff(t, u)-kappa*normal), sp.zeros(3, 1))
            self.assertEqual(sp.simplify(sp.diff(normal, u)+kappa*t), sp.zeros(3, 1))
            self.assertEqual(sp.simplify(sp.diff(left, u)), sp.zeros(3, 1))
            self.assertEqual(b.subs(u, 0), sp.zeros(3, 1))
            self.assertEqual(t.subs(u, 0), sp.Matrix([1, 0, 0]))
        for at in (0, .3, 1.2, math.pi):
            self.assertEqual(certify_saved_generic_cylinder_reshape().frame('target', at)['b'],
                             (at, 0, 0))
            actual = certify_saved_generic_cylinder_reshape('curl-plane').frame('target', at)['b']
            self.assertAlmostEqual(actual[0], math.sin(at), 14)
            self.assertAlmostEqual(actual[2], 1-math.cos(at), 14)

    def test_source_and_target_first_forms_regularity_and_curvature(self):
        for mode, curvatures in (('flatten-cylinder', (-1, 0)),
                                 ('curl-plane', (0, 1))):
            case = certify_saved_generic_cylinder_reshape(mode)
            for stage, kappa in zip(('source', 'target'), curvatures):
                for u in (0, .2, 1.7, math.pi):
                    frame = case.frame(stage, u)
                    self.assertAlmostEqual(frame['normalCurvature'], kappa, 14)
                    self.assertAlmostEqual(frame['geodesicCurvature'], 0, 14)
                    self.assertAlmostEqual(frame['geodesicTorsion'], 0, 14)
                    self.assertAlmostEqual(sum(x*x for x in frame['normal']), 1, 14)
                    for v in (0, .5, 1):
                        for actual, expected in zip(case.first_form(stage, u, v), (1, 0, 1)):
                            self.assertAlmostEqual(actual, expected, 14)
                        self.assertAlmostEqual(case.regularity(stage, u, v), 1, 14)
                h = 1e-6
                for u in (.1, 1.5, 3.0):
                    t_before = case.frame(stage, u-h)['t']
                    t_after = case.frame(stage, u+h)['t']
                    t_prime = [(b-a)/(2*h) for a, b in zip(t_before, t_after)]
                    measured = sum(a*b for a, b in zip(t_prime, case.frame(stage, u)['normal']))
                    self.assertAlmostEqual(measured, kappa, 8)

    def test_sample_keeps_continuous_pairs_separate_from_fold_graphs(self):
        for mode in ('flatten-cylinder', 'curl-plane'):
            case = certify_saved_generic_cylinder_reshape(mode)
            sample = case.sample(64)
            self.assertEqual(len(sample['parameterValues']), 65)
            self.assertEqual(sample['parameterValues'][-1], math.pi)
            self.assertEqual(len(sample['stages']['source']['crease']), 65)
            self.assertEqual(len(sample['stages']['target']['outerBoundary']), 65)
            self.assertFalse(sample['wolframNumericalOutputReproduced'])
            self.assertFalse(sample['exactStraightCreaseFOLD'])
            self.assertNotIn('faces', sample)
            # Arc length pi and its cylinder endpoint chord 2 differ: sampled
            # surfaces cannot be exported as an exact straight-crease FOLD.
            a = case.surface('source', 0, 0)
            b = case.surface('source', math.pi, 0)
            c = case.surface('target', 0, 0)
            d = case.surface('target', math.pi, 0)
            source_chord = math.dist(a, b)
            target_chord = math.dist(c, d)
            self.assertAlmostEqual(sorted((source_chord, target_chord))[0], 2, 14)
            self.assertAlmostEqual(sorted((source_chord, target_chord))[1], math.pi, 14)

    def test_rejects_outside_saved_subdomain(self):
        for patch in ({'mode': 'other'}, {'parameter_end': 0},
                      {'parameter_end': math.pi + .1}, {'ruling_width': 0},
                      {'ruling_width': 1.1}, {'ruling_width': True}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                certify_saved_generic_cylinder_reshape(**patch)
        case = certify_saved_generic_cylinder_reshape()
        with self.assertRaises(ValueError):
            case.surface('target', 2, 1.01)
        with self.assertRaises(ValueError):
            case.frame('other', 0)
        with self.assertRaises(ValueError):
            case.sample(15)


if __name__ == '__main__':
    unittest.main()
