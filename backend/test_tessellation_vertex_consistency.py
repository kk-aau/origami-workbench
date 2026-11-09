"""Independent rotation-closure examples and the notebook's hat numerator."""

import math
import unittest

from tessellation_vertex_consistency import (
    degree4_fold_consistency_query,
    hat_vertex_consistency_matrix,
    vertex_rotation_closure,
)


class VertexConsistencyTests(unittest.TestCase):
    def test_original_known_consistent_vertex(self):
        # Origamica notebook In[797] and In[798], lines 51750–51875.
        sectors = [math.radians(value) for value in (120, 60, 60, 120)]
        folds = [math.pi / 2, 2 * math.atan(2), -math.pi / 2, 2 * math.atan(2)]
        _, error = vertex_rotation_closure(sectors, folds)
        self.assertLess(error, 1e-12)
        hats = [math.tan(value / 2) for value in folds]
        sector_hats = [math.tan(value / 2) for value in sectors]
        for split in ('automatic', None):
            matrix = hat_vertex_consistency_matrix(hats, sector_hats, split)
            self.assertLess(max(abs(value) for row in matrix for value in row), 1e-9)

    def test_one_straight_crease_has_equal_signed_opposite_ray_angles(self):
        sectors = [math.pi / 2] * 4
        angle = math.radians(35)
        # Two opposite rays of one straight hinge are the same physical fold.
        residual, error = vertex_rotation_closure(sectors, [angle, 0, angle, 0])
        self.assertLess(error, 1e-12)
        self.assertLess(max(abs(value) for row in residual for value in row), 1e-12)
        _, reversed_ray = vertex_rotation_closure(sectors, [angle, 0, -angle, 0])
        self.assertAlmostEqual(math.degrees(reversed_ray), 70, places=9)

    def test_full_matrix_catches_half_turn_mismatch(self):
        _, error = vertex_rotation_closure([math.pi / 2] * 4,
                                           [math.pi, 0, 0, 0])
        self.assertAlmostEqual(error, math.pi, places=12)

    def test_hat_numerator_matches_normalized_rotation_product(self):
        sectors = [math.radians(value) for value in (90, 45, 135, 90)]
        folds = [math.radians(value) for value in (30, -20, 5, 10)]
        hats = [math.tan(value / 2) for value in folds]
        sector_hats = [math.tan(value / 2) for value in sectors]
        numerator = hat_vertex_consistency_matrix(hats, sector_hats, split=None)
        denominator = math.prod(1 + value * value for value in (*hats, *sector_hats))
        normalized, _ = vertex_rotation_closure(sectors, folds)
        for row in range(3):
            for column in range(3):
                self.assertAlmostEqual(numerator[row][column] / denominator,
                                       normalized[row][column], places=12)

    def test_hat_matrix_split_has_same_zero_set(self):
        sectors = [math.pi / 2] * 4
        folds = [math.radians(35), 0, math.radians(35), 0]
        hats = [math.tan(value / 2) for value in folds]
        sector_hats = [math.tan(value / 2) for value in sectors]
        for split in ('automatic', None, 0, 3, 8):
            with self.subTest(split=split):
                matrix = hat_vertex_consistency_matrix(hats, sector_hats, split)
                self.assertLess(max(abs(value) for row in matrix for value in row), 1e-9)

    def test_query_reports_condition_and_limits(self):
        query = {'operation': 'degree4-fold-consistency',
                 'sectorAnglesDeg': [90, 90, 90, 90],
                 'foldAnglesDeg': [35, 0, 35, 0]}
        result = degree4_fold_consistency_query(query)
        self.assertEqual(result['kind'], 'local-degree4-fold-consistency')
        self.assertTrue(result['compatible'])
        self.assertLess(result['closureErrorDeg'], 1e-9)
        self.assertEqual(len(result['closureResidualMatrix']), 3)
        self.assertFalse(result['selfCollisionChecked'])
        self.assertFalse(result['foldedForm3D'])
        other = degree4_fold_consistency_query({**query, 'foldAnglesDeg': [180, 0, 0, 0]})
        self.assertFalse(other['compatible'])
        self.assertAlmostEqual(other['closureErrorDeg'], 180, places=9)

    def test_invalid_inputs_are_rejected(self):
        base = {'operation': 'degree4-fold-consistency',
                'sectorAnglesDeg': [90, 90, 90, 90],
                'foldAnglesDeg': [0, 0, 0, 0]}
        for patch in ({'sectorAnglesDeg': [90, 90, 90, 80]},
                      {'sectorAnglesDeg': [0, 90, 90, 180]},
                      {'foldAnglesDeg': [0, 0, 0]},
                      {'foldAnglesDeg': [0, True, 0, 0]},
                      {'foldAnglesDeg': [0, 181, 0, 0]},
                      {'foldAnglesDeg': [0, 10 ** 400, 0, 0]},
                      {'operation': 'degree4-branch-geometry'},
                      {'unrecognized': 1}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                degree4_fold_consistency_query({**base, **patch})
        with self.assertRaises(ValueError):
            hat_vertex_consistency_matrix([0] * 4, [1] * 4, split=9)


if __name__ == '__main__':
    unittest.main()
