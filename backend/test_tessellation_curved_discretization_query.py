"""Bounded workspace queries for the saved section-45 input cells."""

import math
import unittest

from tessellation_curved_discretization_query import (
    query_curved_discretization,
    validate_curved_discretization_query,
)


class CurvedDiscretizationQueryTests(unittest.TestCase):
    def test_in_4088_replays_fixed_ordered_system(self):
        result = query_curved_discretization({'example': 'in-4088'})
        self.assertEqual(result['source']['inputCell'], 'In[4088]')
        self.assertFalse(result['source']['wolframNumericOutAvailable'])
        self.assertEqual(result['sample']['parameterValues'], [0, .25, .5, .75, 1])
        rows = result['sample']['system']
        self.assertEqual([row['key'] for row in rows], ['Curve2D', 'Curve3D'])
        self.assertEqual(rows[0]['values'][3], [.75, .5625])
        self.assertEqual(rows[1]['values'][3], [.75, .5625, 0])

    def test_in_4090_recomputes_saved_parabola_and_independent_residual(self):
        result = query_curved_discretization({'example': 'in-4090'})
        sample = result['sample']
        self.assertEqual(result['source']['inputCell'], 'In[4090]')
        self.assertEqual(result['query']['divisions'], 4)
        self.assertEqual((sample['parameterValues'][0], sample['parameterValues'][-1]), (0, 1))
        self.assertTrue(all(a < b for a, b in zip(sample['parameterValues'], sample['parameterValues'][1:])))
        self.assertAlmostEqual(sample['parameterValues'][1], .183316669579, places=9)
        self.assertEqual(len(sample['directionResiduals']), 3)
        for i, row in enumerate(sample['directionResiduals'], 1):
            t = sample['parameterValues'][i]
            before = sample['chords'][i - 1]['unit']
            after = sample['chords'][i]['unit']
            residual = (before[0] - after[0]) * -2 * t + before[1] - after[1]
            self.assertAlmostEqual(row['residual'], residual, places=12)
            self.assertLess(abs(residual), 1e-9)
        self.assertGreater(max(c['length'] for c in sample['chords']) /
                           min(c['length'] for c in sample['chords']), 3)

    def test_bounded_division_queries_keep_monotone_root(self):
        for n in (2, 3, 8, 16):
            with self.subTest(n=n):
                sample = query_curved_discretization({'example': 'in-4090', 'divisions': n})['sample']
                self.assertEqual(len(sample['parameterValues']), n + 1)
                self.assertTrue(sample['increasingRootFromEqualParameterGuess'])
                self.assertLess(sample['maximumAbsoluteResidual'], 1e-9)

    def test_fixed_multiplier_fixture_is_not_claimed_as_saved_ellipse(self):
        result = query_curved_discretization({'example': 'multiplier-fixture'})
        self.assertEqual(result['source']['inputCell'], 'In[4092]')
        self.assertEqual(result['source']['origin'], 'verification-fixture')
        self.assertFalse(result['sample']['in4093EllipseReproduced'])
        magnitude = math.sin(math.radians(80)) / math.sin(math.radians(20))
        for actual, expected in zip(result['sample']['multipliers'],
                                    (magnitude, -magnitude, magnitude)):
            self.assertAlmostEqual(actual, expected, places=12)

    def test_in_4093_preserves_saved_conic_system_and_uniform_multipliers(self):
        result = query_curved_discretization({'example': 'in-4093'})
        sample = result['sample']
        self.assertEqual(result['source']['inputCell'], 'In[4093]')
        self.assertEqual(result['source']['definitionCell'], 'In[4019]')
        self.assertEqual(result['source']['savedDivisions'], 5)
        self.assertEqual(result['source']['parameterStatus'], 'saved-input')
        self.assertEqual(result['query']['divisions'], 5)
        self.assertFalse(result['source']['wolframNumericOutAvailable'])
        self.assertEqual(sample['conicParameters'], {
            'leftFocus': -2, 'rightFocus': -1,
            'leftDirectrix': -1.5, 'rightDirectrix': 1,
            'simplification': 'Simplify'})
        self.assertEqual(sample['divisions'], 5)
        self.assertEqual(sample['intervalRad'], [0, math.pi / 2])
        self.assertEqual([row['key'] for row in sample['system']], [
            'CurvedFold2D', 'DirectrixLeft2D', 'DirectorLeft2D',
            'CrossCurveLeft2D', 'SecondCrossCurveLeft2D',
            'DirectrixRight2D', 'DirectorRight2D', 'CrossCurveRight2D',
            'SecondCrossCurveRight2D'])
        self.assertEqual(len(sample['parameterValuesRad']), 6)
        self.assertTrue(all(a < b for a, b in zip(
            sample['parameterValuesRad'], sample['parameterValuesRad'][1:])))
        self.assertAlmostEqual(sample['parameterValuesRad'][1], .262966419351, places=10)
        self.assertLess(sample['maximumAbsoluteResidual'], 1e-9)
        self.assertLess(sample['maximumMultiplierDeviation'], 1e-9)
        self.assertLess(sample['maximumEllipseEquationResidual'], 1e-12)
        for i, t in enumerate(sample['parameterValuesRad']):
            x, y = sample['foldPoints'][i]
            cosine, sine = math.cos(t), math.sin(t)
            self.assertAlmostEqual(x, -2 + 4 * cosine / (3 - cosine), places=12)
            self.assertAlmostEqual(y, 4 * sine / (3 - cosine), places=12)
            self.assertAlmostEqual(8 * (x + 1.5) ** 2 + 9 * y ** 2, 18, places=12)
            lx, ly = sample['leftSecondCrossPoints'][i]
            self.assertAlmostEqual(lx, -2 + .5 * cosine, places=12)
            self.assertAlmostEqual(ly, .5 * sine, places=12)
            half_tangent = math.tan(t / 2)
            right_denominator = 1 + 4 * half_tangent ** 2
            rx, ry = sample['rightSecondCrossPoints'][i]
            self.assertAlmostEqual(rx, -3 + 4 / right_denominator, places=12)
            self.assertAlmostEqual(ry, 8 * half_tangent / right_denominator, places=12)
            self.assertAlmostEqual(sample['multipliers'][i], -5.139331298929,
                                   places=10)

    def test_in_4093_bounded_divisions_are_explicit_local_extensions(self):
        for n in range(2, 17):
            with self.subTest(divisions=n):
                result = query_curved_discretization(
                    {'example': 'in-4093', 'divisions': n})
                sample = result['sample']
                self.assertEqual(result['source']['parameterStatus'],
                                 'saved-input' if n == 5
                                 else 'bounded-local-extension')
                self.assertEqual(result['source']['savedDivisions'], 5)
                self.assertEqual(sample['divisions'], n)
                self.assertEqual(len(sample['parameterValuesRad']), n + 1)
                self.assertTrue(all(a < b for a, b in zip(
                    sample['parameterValuesRad'], sample['parameterValuesRad'][1:])))
                self.assertLess(sample['maximumAbsoluteResidual'], 1e-9)
                self.assertLess(sample['maximumMultiplierDeviation'], 1e-8)

    def test_fails_closed_on_expressions_extra_fields_and_bad_ranges(self):
        for data in (None, [], {}, {'example': '__import__("os")'},
                     {'example': 'in-4088', 'expression': 'sin(t)'},
                     {'example': 'multiplier-fixture', 'divisions': 4},
                     {'example': 'in-4093', 'divisions': -1},
                     {'example': 'in-4093', 'divisions': 0},
                     {'example': 'in-4093', 'divisions': 1},
                     {'example': 'in-4093', 'divisions': 17},
                     {'example': 'in-4093', 'divisions': 4.5},
                     {'example': 'in-4093', 'divisions': '5'},
                     {'example': 'in-4093', 'curve': 'ellipse'},
                     {'example': 'in-4090', 'divisions': True},
                     {'example': 'in-4090', 'divisions': 1},
                     {'example': 'in-4090', 'divisions': 17},
                     {'example': 'in-4090', 'divisions': '4'},
                     {'example': 'in-4090', 'curve': 'lambda t: t'}):
            with self.subTest(data=data), self.assertRaises(ValueError):
                validate_curved_discretization_query(data)


if __name__ == '__main__':
    unittest.main()
