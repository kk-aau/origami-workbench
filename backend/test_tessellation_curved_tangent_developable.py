"""Analytic and independent differential checks for Origamica In[3913]."""

import math
import unittest

from tessellation_curved_tangent_developable import (
    first_fundamental_form, flattened_frame, source_frame, source_invariants,
    surface_differentials, surface_point, unit_surface_normal)
from tessellation_curved_tangent_developable_query import (
    query_tangent_developable, validate_tangent_developable_query)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1],
            a[2]*b[0]-a[0]*b[2],
            a[0]*b[1]-a[1]*b[0])


def distance(a, b):
    return math.sqrt(sum((x-y)**2 for x, y in zip(a, b)))


def finite_derivative(fn, u, h=1e-5):
    a, b = fn(u-h), fn(u+h)
    return tuple((y-x)/(2*h) for x, y in zip(a, b))


class TangentDevelopableTests(unittest.TestCase):
    def test_saved_source_and_reshaped_initial_frame(self):
        a = math.sqrt(3)/2
        source = source_frame(0)
        target = flattened_frame(0)
        for got, expected in zip(source['base'], (-a, 0, 0)):
            self.assertAlmostEqual(got, expected, places=13)
        for got, expected in zip(source['director'], (0, a, .5)):
            self.assertAlmostEqual(got, expected, places=13)
        self.assertEqual(target['base'], (-1, 0, 0))
        self.assertEqual(target['director'], (0, 1, 0))
        self.assertEqual(unit_surface_normal(0, .5, space=False), (0, 0, 1))
        for got, expected in zip(unit_surface_normal(0, .5, space=True),
                                 (0, -.5, a)):
            self.assertAlmostEqual(got, expected, places=13)
        self.assertAlmostEqual(source_invariants()['sourceTorsion'], -.5)
        self.assertEqual(source_invariants()['targetTorsion'], 0)
        for space, frame in ((True, source_frame), (False, flattened_frame)):
            for u in (.2, 1.1, 2.6):
                actual = frame(u)
                self.assertLess(distance(
                    finite_derivative(lambda t: frame(t)['base'], u),
                    actual['baseDerivative']), 1e-9)
                self.assertLess(distance(actual['baseDerivative'],
                                         actual['director']), 1e-13)
                self.assertLess(distance(
                    finite_derivative(lambda t: frame(t)['director'], u),
                    actual['directorDerivative']), 1e-9)
                self.assertAlmostEqual(dot(actual['director'],
                                           actual['director']), 1, places=13)
        # Frenet torsion from the saved source bb', bb'', bb'''; the target is planar.
        for u in (.4, 1.7):
            d = source_frame(u)['director']
            dp = source_frame(u)['directorDerivative']
            dpp = (-a * math.sin(u), -a * math.cos(u), 0)
            self.assertAlmostEqual(dot(cross(d, dp), dpp) /
                                   dot(cross(d, dp), cross(d, dp)), -.5,
                                   places=13)
            flat = flattened_frame(u)
            self.assertEqual(cross(flat['director'],
                                   flat['directorDerivative'])[0:2], (0, 0))

    def test_common_metric_developability_and_singular_regression_edge(self):
        for u in (.2, 1.1, 2.6):
            for v in (.01, .3, 1):
                expected = first_fundamental_form(v)
                self.assertAlmostEqual(expected[3], .75 * v*v, places=13)
                for space in (False, True):
                    xu, xv = surface_differentials(u, v, space=space)
                    metric = (dot(xu, xu), dot(xu, xv), dot(xv, xv))
                    for got, want in zip(metric, expected[:3]):
                        self.assertAlmostEqual(got, want, places=12)
                    self.assertAlmostEqual(metric[0]*metric[2]-metric[1]**2,
                                           expected[3], places=12)
                    normal = unit_surface_normal(u, v, space=space)
                    self.assertAlmostEqual(dot(normal, xu), 0, places=12)
                    self.assertAlmostEqual(dot(normal, xv), 0, places=12)
                    self.assertLess(distance(normal,
                                             unit_surface_normal(u, .7, space=space)),
                                    1e-12)
                    numerical_xu = finite_derivative(
                        lambda t: surface_point(t, v, space=space), u)
                    self.assertLess(distance(numerical_xu, xu), 1e-9)
            self.assertEqual(first_fundamental_form(0)[3], 0)
            with self.assertRaisesRegex(ValueError, 'singular'):
                unit_surface_normal(u, 0, space=True)
            with self.assertRaisesRegex(ValueError, 'singular'):
                unit_surface_normal(u, 0, space=False)

    def test_bounded_query_and_non_fold_certificate(self):
        data = query_tangent_developable({'family': 'tangent-developable-in3913',
                                          'curveSegments': 16, 'rulingSegments': 2})
        self.assertEqual(data['source']['savedCell'], 'In[3913]')
        self.assertFalse(data['source']['machineReadableWolframOut'])
        self.assertEqual(len(data['sample']['flatSamples']), 17)
        self.assertEqual(len(data['sample']['flatSamples'][0]), 3)
        self.assertEqual(data['sample']['rulingDistances'], [0, .5, 1])
        self.assertEqual(data['sample']['flatSamples'][0][0], [-1, 0])
        self.assertAlmostEqual(data['sample']['foldedSamples'][0][0][0],
                               -math.sqrt(3)/2)
        cert = data['certification']
        self.assertTrue(cert['continuousIsometryAnalytic'])
        self.assertTrue(cert['regressionEdgeSingularAtZero'])
        self.assertFalse(cert['regressionEdgeIsCrease'])
        self.assertFalse(cert['exactStraightCreaseFOLD'])
        self.assertFalse(cert['sampledMeshExactIsometry'])
        # Smooth isometry does not make nonmatching sampled chord lengths equal.
        flat = data['sample']['flatSamples']
        folded = data['sample']['foldedSamples']
        self.assertGreater(abs(distance(flat[0][0], flat[4][0]) -
                               distance(folded[0][0], folded[4][0])), 1e-5)

    def test_closed_json_and_strict_budgets(self):
        valid = {'family': 'tangent-developable-in3913'}
        self.assertEqual(validate_tangent_developable_query(valid)['rulingEnd'], 1)
        invalid = [None, [], {}, {**valid, 'formula': '__import__("os")'},
                   {**valid, 'curveSegments': True},
                   {**valid, 'curveSegments': 257},
                   {**valid, 'rulingSegments': 17},
                   {**valid, 'rulingEnd': False},
                   {**valid, 'rulingEnd': float('nan')},
                   {**valid, 'rulingEnd': 0},
                   {**valid, 'curveSegments': 256, 'rulingSegments': 16}]
        for item in invalid:
            with self.subTest(item=item), self.assertRaises(ValueError):
                validate_tangent_developable_query(item)
        for u, v in ((float('inf'), .5), (.2, -1), (.2, 1.1)):
            with self.assertRaises(ValueError):
                surface_point(u, v, space=True)


if __name__ == '__main__':
    unittest.main()
