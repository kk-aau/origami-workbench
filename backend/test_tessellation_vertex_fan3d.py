"""Geometric checks for the local Origamica 3D vertex fan."""

import math
import unittest

from tessellation_vertex_fan3d import degree4_vertex_fan_query, folded_vertex_fan


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def signed_angle(a, b, axis):
    return math.atan2(dot(axis, cross(a, b)), dot(a, b))


class VertexFan3DTests(unittest.TestCase):
    def test_origamica_known_compatible_vertex_has_expected_fold_rays(self):
        # Origamica notebook In[797], lines 51750–51802. The second ray is
        # in the first flat face; the third has exact coordinates derived
        # independently from Rz(120°) Rx(2 atan(2)) Rz(60°) (1,0,0).
        dihedral = 2 * math.atan(2)
        sectors = [math.radians(value) for value in (120, 60, 60, 120)]
        folds = [math.pi / 2, dihedral, -math.pi / 2, dihedral]
        fan = folded_vertex_fan(sectors, folds)
        rays = fan['foldRays']
        self.assertEqual(len(rays), 4)
        self.assertEqual(len(fan['faces']), 4)
        for actual, expected in zip(rays[0], (1, 0, 0)):
            self.assertAlmostEqual(actual, expected, places=12)
        for actual, expected in zip(rays[1], (-.5, math.sqrt(3)/2, 0)):
            self.assertAlmostEqual(actual, expected, places=12)
        for actual, expected in zip(rays[2],
                                    (.2, 2*math.sqrt(3)/5, 2*math.sqrt(3)/5)):
            self.assertAlmostEqual(actual, expected, places=12)
        for ray in rays:
            self.assertAlmostEqual(dot(ray, ray), 1, places=12)

        # Re-measure all sectors and signed dihedrals from *returned mesh*
        # vertices and oriented triangle normals, rather than trusting the
        # module's own measured-angle fields.
        actual_normals = []
        for i, face in enumerate(fan['faces']):
            self.assertEqual(face, (0, i+1, (i+1) % 4 + 1))
            a, b = rays[i], rays[(i+1) % 4]
            n = cross(a, b)
            norm = math.sqrt(dot(n, n))
            actual_normals.append(tuple(value / norm for value in n))
            self.assertAlmostEqual(math.atan2(norm, dot(a, b)), sectors[i],
                                   places=12)
        for i, fold in enumerate(folds):
            measured = signed_angle(actual_normals[i-1], actual_normals[i],
                                    rays[i])
            self.assertAlmostEqual(math.atan2(math.sin(measured-fold),
                                              math.cos(measured-fold)), 0,
                                   places=12)
        self.assertLess(fan['closureErrorRad'], 1e-12)
        self.assertLess(fan['rayLoopGap'], 1e-12)
        self.assertFalse(fan['selfCollisionChecked'])
        self.assertFalse(fan['globalFoldabilityChecked'])

    def test_flat_and_half_turn_hinge(self):
        sectors = [math.pi / 2] * 4
        for folds in ([0.0] * 4, [math.pi, 0.0, math.pi, 0.0]):
            with self.subTest(folds=folds):
                fan = folded_vertex_fan(sectors, folds)
                self.assertLess(fan['maxSectorErrorRad'], 1e-12)
                self.assertLess(fan['maxFoldErrorRad'], 1e-12)
                self.assertEqual(fan['faceNormals'][0], (0.0, 0.0, 1.0))

    def test_six_sector_line_hinge_keeps_opposite_crease_rays(self):
        # A straight hinge through opposite rays is a valid higher-valence
        # fan; only those two collinear creases have a nonzero rotation.
        fan = folded_vertex_fan([math.pi / 3] * 6,
                                [1.2, 0.0, 0.0, 1.2, 0.0, 0.0])
        self.assertEqual(len(fan['faces']), 6)
        for first, opposite in zip(fan['foldRays'][0], fan['foldRays'][3]):
            self.assertAlmostEqual(first, -opposite, places=12)
        self.assertLess(fan['maxFoldErrorRad'], 1e-12)

    def test_rejects_incompatible_angles_without_moving_a_face(self):
        with self.assertRaisesRegex(ValueError, '不闭合'):
            folded_vertex_fan([math.pi / 2] * 4,
                              [math.pi / 3, 0.0, 0.0, 0.0])

    def test_degree4_query_uses_degrees_and_rejects_bad_payloads(self):
        dihedral = math.degrees(2 * math.atan(2))
        query = {'operation': 'degree4-vertex-fan3d',
                 'sectorAnglesDeg': [120, 60, 60, 120],
                 'foldAnglesDeg': [90, dihedral, -90, dihedral]}
        fan = degree4_vertex_fan_query(query)
        for actual, expected in zip(fan['measuredFoldAnglesDeg'],
                                    query['foldAnglesDeg']):
            self.assertAlmostEqual(actual, expected, places=10)
        self.assertEqual(fan['kind'], 'local-single-vertex-fan3d')
        for patch in ({'foldAnglesDeg': [90, 0, 0, 0]},
                      {'sectorAnglesDeg': [120, 60, 60]},
                      {'foldAnglesDeg': [True, 0, 0, 0]},
                      {'foldAnglesDeg': ['90', 0, 0, 0]},
                      {'sectorAnglesDeg': [10**1000, 60, 60, 120]},
                      {'foldAnglesDeg': [10**1000, 0, 0, 0]},
                      {'operation': 'degree4-fold-consistency'},
                      {'surprise': 1}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                degree4_vertex_fan_query({**query, **patch})


if __name__ == '__main__':
    unittest.main()
