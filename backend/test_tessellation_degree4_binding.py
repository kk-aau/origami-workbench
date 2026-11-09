"""Origamica's six binding examples plus independent spherical closure checks."""

import math
import random
import unittest

from tessellation_degree4_binding import minor_first_binding_angles, major_first_binding_angles
from tessellation_spherical_vertex import maximum_dihedral_angles


def _rotate_z(a):
    c, s = math.cos(a), math.sin(a)
    return ((c, -s, 0), (s, c, 0), (0, 0, 1))


def _rotate_x(a):
    c, s = math.cos(a), math.sin(a)
    return ((1, 0, 0), (0, c, -s), (0, s, c))


def _multiply(left, right):
    return tuple(tuple(sum(left[i][k] * right[k][j] for k in range(3))
                       for j in range(3)) for i in range(3))


def _closure_error(sectors, magnitudes):
    """Spherical four-bar linkage closure, independent of the binding formula."""
    identity = ((1, 0, 0), (0, 1, 0), (0, 0, 1))
    errors = []
    for minor_sign in (1, -1):
        g1, g2, g3, g4 = magnitudes
        signed = (minor_sign * g1, g2, -minor_sign * g3, g4)
        orientation = identity
        for sector, next_fold in zip(sectors, (signed[1], signed[2], signed[3], signed[0])):
            orientation = _multiply(_multiply(orientation, _rotate_z(sector)), _rotate_x(next_fold))
        errors.append(max(abs(orientation[i][j] - identity[i][j])
                          for i in range(3) for j in range(3)))
    return min(errors)


class Degree4BindingTests(unittest.TestCase):
    def test_original_six_minor_first_examples(self):
        # Notebook lines 161947-162109, covering all four source branches.
        examples = [
            ((120, 65, 60, 115), (180, 180, 180, 180)),  # Flat-foldable.
            ((90, 100, 80, 90), (0, 180, 0, 180)),     # Straight major.
            ((120, 30, 90, 120), (90, 180, 120, 90)),  # General; γ2 binds.
            ((120, 90, 40, 110), (102.130458, 113.261661, 122.146701, 180)),
            ((135, 45, 90, 90), (90, 180, 90, 90)),    # Straight minor; γ2 binds.
            ((90, 90, 120, 60), (90, 120, 90, 180)),   # Straight minor; γ4 binds.
        ]
        for angles, expected in examples:
            with self.subTest(angles=angles):
                sectors = [math.radians(a) for a in angles]
                binding = minor_first_binding_angles(sectors)
                for actual, target in zip(binding, expected):
                    self.assertAlmostEqual(math.degrees(actual), target, places=5)
                self.assertLess(_closure_error(sectors, binding), 1e-10)
                for bound, maximum in zip(binding, maximum_dihedral_angles(sectors)):
                    self.assertLessEqual(bound, maximum + 1e-10)

    def test_major_first_is_source_rotation_of_minor_first(self):
        # Notebook lines 162402-162415, 162489-162509.
        original = [math.radians(a) for a in (120, 30, 90, 120)]
        rotated = original[-1:] + original[:-1]
        minor = minor_first_binding_angles(original)
        major = major_first_binding_angles(rotated)
        for actual, expected in zip(major, minor[-1:] + minor[:-1]):
            self.assertAlmostEqual(actual, expected, places=12)
        self.assertEqual([round(math.degrees(a)) for a in major], [90, 90, 180, 120])

    def test_regular_general_vertices_close_and_bind_before_geometric_maximum(self):
        rng = random.Random(412)
        checked = 0
        for _ in range(180):
            sectors = [rng.uniform(.05, math.pi - .05) for _ in range(3)]
            sectors.append(math.tau - math.fsum(sectors))
            if not .05 < sectors[3] < math.pi - .05:
                continue
            binding = minor_first_binding_angles(sectors)
            self.assertLess(_closure_error(sectors, binding), 1e-10)
            self.assertTrue(any(abs(binding[i] - math.pi) < 1e-10 for i in (1, 3)))
            for bound, maximum in zip(binding, maximum_dihedral_angles(sectors)):
                self.assertLessEqual(bound, maximum + 1e-9)
            checked += 1
        self.assertGreater(checked, 50)

    def test_nearly_flat_vertex_does_not_get_invalid_four_complete_folds(self):
        # The original FlatFoldableAnglesQ default tolerance (1e-6 rad)
        # would label this example flat, although its exact binding angles
        # are below 180 degrees. This numerical safeguard is intentional.
        sectors = [math.radians(a) for a in (120.00001, 65, 60, 114.99999)]
        binding = minor_first_binding_angles(sectors)
        self.assertLess(binding[2], math.pi - math.radians(.01))
        self.assertLess(_closure_error(sectors, binding), 1e-8)
        for bound, maximum in zip(binding, maximum_dihedral_angles(sectors)):
            self.assertLessEqual(bound, maximum + 1e-9)

    def test_rejects_non_developable_or_degenerate_sectors(self):
        for sectors in ([math.pi / 2] * 3, [math.pi / 2] * 3 + [math.pi / 3],
                        [0, 1, 2, math.tau - 3], [True, 1, 2, math.tau - 3],
                        [float('nan'), 1, 2, math.tau - 3]):
            with self.subTest(sectors=sectors), self.assertRaises(ValueError):
                minor_first_binding_angles(sectors)
        self.assertEqual(major_first_binding_angles([math.radians(a) for a in (60, 120, 60, 120)]),
                         [math.pi, 0.0, math.pi, 0.0])


if __name__ == '__main__':
    unittest.main()
