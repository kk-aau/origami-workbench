"""Source-anchored checks for Origamica 15.0 In[4087]--In[4093]."""

import math
import unittest

from tessellation_curved_discretization import (
    LocalFlatFoldabilityError,
    SingularMultiplierError,
    discretize_curve_uniformly,
    discretize_system,
    fold_angle_multipliers_2d,
)


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _unit(vector):
    length = math.sqrt(sum(x * x for x in vector))
    return tuple(x / length for x in vector)


def _direction_equation(curve, derivative, samples, i):
    before = _unit(_sub(curve(samples[i]), curve(samples[i - 1])))
    after = _unit(_sub(curve(samples[i + 1]), curve(samples[i])))
    return sum((a - b) * d for a, b, d in zip(before, after, derivative(samples[i])))


def _ray(degrees):
    angle = math.radians(degrees)
    return (math.cos(angle), math.sin(angle))


class CurvedDiscretizationTests(unittest.TestCase):
    def test_discretize_system_preserves_order_keys_and_notebook_example(self):
        parameters = [0, .25, .5, .75, 1]
        system = [('Curve2D', lambda t: (t, t * t)),
                  ('Curve3D', lambda t: (t, t * t, 0)),
                  ('Curve2D', lambda t: t + 10)]
        sampled = discretize_system(system, parameters)
        self.assertEqual([key for key, _ in sampled],
                         ['Curve2D', 'Curve3D', 'Curve2D'])
        self.assertEqual(sampled[0][1],
                         [(0, 0), (.25, .0625), (.5, .25),
                          (.75, .5625), (1, 1)])
        self.assertEqual(sampled[1][1][2], (.5, .25, 0))
        self.assertEqual(sampled[2][1], [10, 10.25, 10.5, 10.75, 11])
        with self.assertRaisesRegex(ValueError, 'pair'):
            discretize_system([('bad', 3)], parameters)

    def test_parabola_satisfies_coupled_chord_equations_not_equal_arc_length(self):
        # In[4090] supplies f(t)=(-t^2,t), n=4, [0,1], but no saved
        # numerical Out.  These values are checked by the source equation.
        curve = lambda t: (-t * t, t)
        derivative = lambda t: (-2 * t, 1)
        samples = discretize_curve_uniformly(curve, 4, (0, 1),
                                             derivative=derivative)
        self.assertEqual((samples[0], samples[-1]), (0, 1))
        self.assertTrue(all(a < b for a, b in zip(samples, samples[1:])))
        for i in range(1, 4):
            self.assertAlmostEqual(_direction_equation(curve, derivative,
                                                        samples, i), 0, 10)
        chords = [math.dist(curve(a), curve(b)) for a, b in zip(samples, samples[1:])]
        self.assertGreater(max(chords) / min(chords), 3)
        self.assertGreater(abs(samples[1] - .25), .05)
        # The optional numerical derivative solves the same equation to its
        # documented approximation accuracy.
        approximate = discretize_curve_uniformly(curve, 4, (0, 1))
        for actual, expected in zip(approximate, samples):
            self.assertAlmostEqual(actual, expected, 8)

    def test_three_dimensional_constant_speed_helix_has_equal_parameters(self):
        curve = lambda t: (math.cos(t), math.sin(t), t / 3)
        derivative = lambda t: (-math.sin(t), math.cos(t), 1 / 3)
        samples = discretize_curve_uniformly(curve, 8, (0, math.pi),
                                             derivative=derivative)
        for i, actual in enumerate(samples):
            self.assertAlmostEqual(actual, i * math.pi / 8, 10)
        for i in range(1, 8):
            self.assertAlmostEqual(_direction_equation(curve, derivative,
                                                        samples, i), 0, 10)

    def test_degenerate_and_invalid_curve_inputs_are_rejected(self):
        line = lambda t: (t, 0)
        self.assertEqual(discretize_curve_uniformly(line, 1, (0, 1)), [0, 1])
        for divisions, interval in ((0, (0, 1)), (True, (0, 1)),
                                    (4, (1, 0)), (4, (0, math.inf))):
            with self.subTest(divisions=divisions, interval=interval), self.assertRaises(ValueError):
                discretize_curve_uniformly(line, divisions, interval)
        with self.assertRaisesRegex(ValueError, 'chord'):
            discretize_curve_uniformly(lambda t: (0, 0), 4, (0, 1))
        with self.assertRaisesRegex(ValueError, 'derivative'):
            discretize_curve_uniformly(lambda t: (t ** 3, 0), 2, (-1, 1),
                                       derivative=lambda t: (3 * t * t, 0))
        with self.assertRaisesRegex(ValueError, 'did not converge'):
            discretize_curve_uniformly(lambda t: (-t * t, t), 4, (0, 1),
                                       derivative=lambda t: (-2 * t, 1),
                                       max_evaluations=1)

    def test_fold_angle_multipliers_use_signed_sectors_and_endpoint_rules(self):
        # A kink with interior ray angles prev=160°, next=20°, left=100°,
        # right=260° has sectors (60°,100°,120°,80°): Kawasaki sum zero.
        # The first and last vertices exercise different source expressions.
        kink = math.radians(20)
        points = [(-math.cos(kink), math.sin(kink)),
                  (0, 0), (math.cos(kink), math.sin(kink))]
        left, right = _ray(100), _ray(260)
        multipliers = fold_angle_multipliers_2d(
            points, ([left] * 3, [right] * 3))
        magnitude = math.sin(math.radians(80)) / math.sin(math.radians(20))
        for actual, expected in zip(multipliers,
                                    (magnitude, -magnitude, magnitude)):
            self.assertAlmostEqual(actual, expected, 12)
        scaled = fold_angle_multipliers_2d(
            points, ([tuple(1e200 * x for x in left)] * 3,
                     [tuple(1e200 * x for x in right)] * 3))
        for actual, expected in zip(scaled, multipliers):
            self.assertAlmostEqual(actual, expected, 12)

    def test_kawasaki_failure_identifies_one_based_interior_vertex(self):
        kink = math.radians(20)
        points = [(-math.cos(kink), math.sin(kink)),
                  (0, 0), (math.cos(kink), math.sin(kink))]
        right = [_ray(260), _ray(265), _ray(260)]
        with self.assertRaises(LocalFlatFoldabilityError) as caught:
            fold_angle_multipliers_2d(points, ([_ray(100)] * 3, right))
        self.assertEqual(caught.exception.vertex, 2)
        self.assertAlmostEqual(math.degrees(caught.exception.kawasaki_sum_rad),
                               -10, 10)

    def test_singular_boundary_and_invalid_rulings_are_rejected(self):
        with self.assertRaises(SingularMultiplierError) as caught:
            fold_angle_multipliers_2d([(0, 0), (1, 0)],
                                      ([_ray(90)] * 2, [_ray(270)] * 2))
        self.assertEqual(caught.exception.vertex, 1)
        with self.assertRaises(SingularMultiplierError) as caught:
            fold_angle_multipliers_2d(
                [(0, 0), (1, 0), (2, 0)],
                ([_ray(100), _ray(100), _ray(100)],
                 [_ray(250), _ray(260), _ray(250)]))
        self.assertEqual(caught.exception.vertex, 2)
        with self.assertRaisesRegex(ValueError, 'match'):
            fold_angle_multipliers_2d([(0, 0), (1, 0)],
                                      ([_ray(90)], [_ray(270)] * 2))
        with self.assertRaisesRegex(ValueError, 'nonzero'):
            fold_angle_multipliers_2d([(0, 0), (1, 0)],
                                      ([(0, 0), _ray(90)], [_ray(270)] * 2))
        with self.assertRaisesRegex(ValueError, 'distinct'):
            fold_angle_multipliers_2d([(0, 0), (0, 0)],
                                      ([_ray(90)] * 2, [_ray(270)] * 2))


if __name__ == '__main__':
    unittest.main()
