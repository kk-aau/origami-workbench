"""Original degree-four straight-pair and Kawasaki example regressions."""

import math
import unittest

from tessellation_degree4_branches import classify_degree4_sector_branches, degree4_branch_query


def classify_degrees(angles):
    return classify_degree4_sector_branches([math.radians(a) for a in angles])


class Degree4BranchTests(unittest.TestCase):
    def test_original_four_straight_pair_examples(self):
        # Notebook lines 161419-161428, 161482-161490, 161547-161555,
        # and 161614-161622 respectively.
        cases = [
            ((135, 45, 90, 90), 'minorFirst', 'straightMinor'),
            ((90, 45, 135, 90), 'minorFirst', 'straightMajor'),
            ((90, 135, 45, 90), 'majorFirst', 'straightMinor'),
            ((90, 90, 45, 135), 'majorFirst', 'straightMajor'),
        ]
        for angles, choice, property_name in cases:
            with self.subTest(angles=angles, choice=choice):
                result = classify_degrees(angles)
                self.assertTrue(result[choice][property_name])
                other = 'straightMajor' if property_name == 'straightMinor' else 'straightMinor'
                self.assertFalse(result[choice][other])
                self.assertFalse(result['flatFoldable'])

    def test_rotation_switches_minor_first_and_major_first(self):
        original = classify_degrees((135, 45, 90, 90))
        rotated = classify_degrees((90, 135, 45, 90))
        self.assertEqual(original['minorFirst']['straightMinor'],
                         rotated['majorFirst']['straightMinor'])
        self.assertEqual(original['minorFirst']['straightMajor'],
                         rotated['majorFirst']['straightMajor'])
        self.assertEqual(original['minorFirst']['minorCreases'], [1, 3])
        self.assertEqual(rotated['majorFirst']['minorCreases'], [2, 4])

    def test_original_kawasaki_examples_and_tolerance(self):
        # Notebook lines 39202-39215: the first alternates to zero, the
        # second does not, even though both have a 360-degree total.
        self.assertTrue(classify_degrees((60, 30, 120, 150))['flatFoldable'])
        self.assertFalse(classify_degrees((30, 60, 120, 150))['flatFoldable'])
        self.assertTrue(classify_degrees((90.00001, 89.99999, 90, 90))['flatFoldable'])
        self.assertFalse(classify_degrees((90.0001, 89.9999, 90, 90))['flatFoldable'])

    def test_invalid_paper_vertex_is_rejected(self):
        for angles in ((90, 90, 90, 80), (0, 90, 90, 180), (90, 90, 90),
                       (float('nan'), 90, 90, 90)):
            with self.subTest(angles=angles), self.assertRaises(ValueError):
                classify_degrees(angles)
        with self.assertRaises(ValueError):
            classify_degree4_sector_branches((True, math.pi / 2, math.pi / 2, math.pi / 2))

    def test_json_boundary_states_local_limits(self):
        result = degree4_branch_query({'operation': 'degree4-branch-geometry',
                                       'sectorAnglesDeg': [90, 45, 135, 90]})
        self.assertEqual(result['kind'], 'local-degree4-branch-geometry')
        self.assertEqual(result['sectorAnglesDeg'], [90, 45, 135, 90])
        self.assertAlmostEqual(result['flatFoldabilityExcessDeg'], 90)
        self.assertTrue(result['minorFirst']['straightMajor'])
        self.assertTrue(result['majorFirst']['straightMinor'])
        self.assertFalse(result['assignmentChosen'])
        self.assertFalse(result['selfCollisionChecked'])
        self.assertFalse(result['foldedForm3D'])
        for payload in ({'operation': 'wrong', 'sectorAnglesDeg': [90, 45, 135, 90]},
                        {'operation': 'degree4-branch-geometry', 'sectorAnglesDeg': [90, 90, 90, 80]},
                        {'operation': 'degree4-branch-geometry', 'sectorAnglesDeg': [90, True, 90, 90]}):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                degree4_branch_query(payload)


if __name__ == '__main__':
    unittest.main()
