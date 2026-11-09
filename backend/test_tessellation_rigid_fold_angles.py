"""Original notebook anchors for RigidlyScaleFoldAngles."""

import math
import unittest

from tessellation_rigid_fold_angles import (
    rigid_fold_angle_scale_query,
    rigidly_scale_fold_angles,
    rigidly_scale_fold_angles_to_anchor,
)


class RigidFoldAngleScaleTests(unittest.TestCase):
    def test_notebook_multiplier_example(self):
        # Notebook In[2117]: {90°, 120°}, mu=1/Sqrt[3] -> {60°, 90°}.
        result = rigid_fold_angle_scale_query({
            'operation': 'rigid-fold-angle-scale',
            'anglesDeg': [90, 120],
            'multiplier': 1 / math.sqrt(3),
        })
        for actual, expected in zip(result['scaledAnglesDeg'], [60, 90]):
            self.assertAlmostEqual(actual, expected, places=12)
        self.assertFalse(result['globalRigidFoldingChecked'])
        self.assertFalse(result['selfCollisionChecked'])

    def test_notebook_anchor_example_and_same_multiplier(self):
        # Notebook In[2119] specifies 120° -> 90° on the same input list.
        result = rigid_fold_angle_scale_query({
            'operation': 'rigid-fold-angle-scale',
            'anglesDeg': [90, 120],
            'mapAngleDeg': [120, 90],
        })
        self.assertAlmostEqual(result['multiplier'], 1 / math.sqrt(3), places=12)
        self.assertAlmostEqual(result['scaledAnglesDeg'][0], 60, places=12)
        self.assertAlmostEqual(result['scaledAnglesDeg'][1], 90, places=12)

    def test_preserves_nonzero_half_tangent_ratios_and_signs(self):
        original = [math.radians(a) for a in [20, -40, 95, -135]]
        for multiplier in (0.1, 2.5, -1.25):
            with self.subTest(multiplier=multiplier):
                result = rigidly_scale_fold_angles(original, multiplier)
                base_ratio = math.tan(original[0] / 2) / math.tan(original[1] / 2)
                new_ratio = math.tan(result[0] / 2) / math.tan(result[1] / 2)
                self.assertAlmostEqual(new_ratio, base_ratio, places=12)
                for old, new in zip(original, result):
                    self.assertAlmostEqual(math.tan(new / 2),
                                           multiplier * math.tan(old / 2), places=12)

    def test_zero_multiplier_and_negative_multiplier(self):
        angles = [math.radians(a) for a in (-90, 0, 120)]
        self.assertEqual(rigidly_scale_fold_angles(angles, 0), [0, 0, 0])
        negative = rigidly_scale_fold_angles(angles, -1)
        for old, new in zip(angles, negative):
            self.assertAlmostEqual(new, -old, places=12)

    def test_anchor_incompatible_with_zero_old_angle(self):
        with self.assertRaisesRegex(ValueError, '0°'):
            rigidly_scale_fold_angles_to_anchor([math.radians(30)], 0,
                                                math.radians(30))
        with self.assertRaisesRegex(ValueError, '0°'):
            rigidly_scale_fold_angles_to_anchor([math.radians(30)], 5e-324,
                                                math.radians(30))

    def test_near_flat_fold_keeps_principal_branch(self):
        angles = [math.radians(179.999999), math.radians(-179.999999)]
        scaled = rigidly_scale_fold_angles(angles, 10)
        self.assertGreater(math.degrees(scaled[0]), 179.999999)
        self.assertLess(math.degrees(scaled[1]), -179.999999)
        self.assertLess(scaled[0], math.pi)
        self.assertGreater(scaled[1], -math.pi)

    def test_query_rejects_singular_or_nonfinite_angles_and_ambiguous_mode(self):
        base = {'operation': 'rigid-fold-angle-scale', 'anglesDeg': [90]}
        for invalid in [
            {**base, 'multiplier': 1, 'mapAngleDeg': [90, 30]},
            base,
            {**base, 'multiplier': True},
            {**base, 'multiplier': float('inf')},
            {**base, 'multiplier': 1, 'anglesDeg': [180]},
            {**base, 'multiplier': 1, 'anglesDeg': [-180]},
            {**base, 'multiplier': 1, 'anglesDeg': [float('nan')]},
            {**base, 'mapAngleDeg': [0, 30]},
            {**base, 'mapAngleDeg': [90]},
            {**base, 'multiplier': 1, 'extra': 2},
        ]:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                rigid_fold_angle_scale_query(invalid)


if __name__ == '__main__':
    unittest.main()
