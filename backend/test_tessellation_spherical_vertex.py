"""Original numerical example and invariants for the spherical vertex bound."""

import math
import unittest

from tessellation_spherical_vertex import maximum_dihedral_angles, maximum_dihedral_query


class MaximumDihedralAngleTests(unittest.TestCase):
    def test_original_one_limited_crease_example(self):
        sectors = [math.radians(a) for a in (90, 45, 135, 90)]
        result = maximum_dihedral_angles(sectors)
        for actual, expected in zip(result, (90, 180, 180, 180)):
            self.assertAlmostEqual(math.degrees(actual), expected, places=10)

    def test_asymmetric_case_has_two_bounded_creases_and_rotates_with_input(self):
        # The notebook's second example explicitly says two are limited.
        sectors = [math.radians(a) for a in (90, 91, 30, 149)]
        result = maximum_dihedral_angles(sectors)
        self.assertEqual([i for i, x in enumerate(result) if x < math.pi - 1e-8], [0, 1])
        self.assertAlmostEqual(math.degrees(result[0]), 160.27244372149607, places=9)
        self.assertAlmostEqual(math.degrees(result[1]), 60.99516201372214, places=9)
        for shift in range(1, 4):
            shifted = sectors[shift:] + sectors[:shift]
            expected = result[shift:] + result[:shift]
            for actual, target in zip(maximum_dihedral_angles(shifted), expected):
                self.assertAlmostEqual(actual, target, places=12)

    def test_right_angle_vertex_can_reach_a_complete_fold_on_every_crease(self):
        self.assertEqual(maximum_dihedral_angles([math.pi / 2] * 4), [math.pi] * 4)

    def test_invalid_or_degenerate_sectors_are_rejected(self):
        for sectors in ([math.pi / 2] * 3, [0, 1, 1, 1], [math.pi, 1, 1, 1],
                        [float('nan'), 1, 1, 1], [True, 1, 1, 1],
                        [math.pi / 2] * 3 + [math.pi / 3], '1,1,1,1'):
            with self.subTest(sectors=sectors), self.assertRaises(ValueError):
                maximum_dihedral_angles(sectors)

    def test_json_query_uses_degrees_and_states_its_limits(self):
        result = maximum_dihedral_query({'operation': 'spherical-maximum-dihedrals',
                                         'sectorAnglesDeg': [90, 45, 135, 90]})
        self.assertEqual(result['sectorAnglesDeg'], [90, 45, 135, 90])
        self.assertEqual(result['kind'], 'local-degree4-dihedral-bound')
        self.assertFalse(result['selfCollisionChecked'])
        self.assertFalse(result['foldedForm3D'])
        for actual, expected in zip(result['maximumDihedralsDeg'], (90, 180, 180, 180)):
            self.assertAlmostEqual(actual, expected, places=10)
        for angles in ([90, 45, 135], [0, 45, 135, 90],
                       [90, True, 135, 90], [90, 90, 90, 80]):
            with self.subTest(angles=angles), self.assertRaises(ValueError):
                maximum_dihedral_query({'operation': 'spherical-maximum-dihedrals',
                                         'sectorAnglesDeg': angles})


if __name__ == '__main__':
    unittest.main()
