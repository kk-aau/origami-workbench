"""Numerical anchors for Origamica MakeTVertex3DFromFoldVectors."""

import math
import unittest

from tessellation_vertex_fan3d import folded_vertex_fan
from tessellation_vertex_fold_vectors import (vertex_from_fold_vectors,
                                               vertex_from_fold_vectors_query)


class FoldVectorVertexTests(unittest.TestCase):
    def test_original_cube_corner_is_kept_despite_non_developability(self):
        # Notebook In[2157] rotates the orthogonal x,y,z rays by -10°.
        theta = math.radians(-10)
        rays = [(math.cos(theta), math.sin(theta), 0),
                (-math.sin(theta), math.cos(theta), 0), (0, 0, 1)]
        result = vertex_from_fold_vectors(rays)
        self.assertFalse(result['developable'])
        self.assertAlmostEqual(result['sectorSumRad'], 3*math.pi/2, places=12)
        for sector, fold in zip(result['sectorAnglesRad'], result['foldAnglesRad']):
            self.assertAlmostEqual(sector, math.pi/2, places=12)
            self.assertAlmostEqual(fold, math.pi/2, places=12)
        self.assertAlmostEqual(sum(a*b for a,b in zip(
            result['midfoldVectors'][0], result['foldVectors'][0])), 0, places=12)
        self.assertFalse(result['globalRigidFoldingChecked'])

    def test_roundtrip_existing_original_compatible_degree4_fan(self):
        fold = 2*math.atan(2)
        fan = folded_vertex_fan([math.radians(a) for a in (120, 60, 60, 120)],
                                [math.pi/2, fold, -math.pi/2, fold])
        result = vertex_from_fold_vectors(fan['foldRays'])
        self.assertTrue(result['developable'])
        for actual, expected in zip(result['foldAnglesRad'],
                                    [math.pi/2, fold, -math.pi/2, fold]):
            self.assertAlmostEqual(actual, expected, places=11)
        for actual, expected in zip(result['sectorAnglesRad'],
                                    [math.radians(a) for a in (120, 60, 60, 120)]):
            self.assertAlmostEqual(actual, expected, places=11)
        for actual, expected in zip(result['sectorVectors'], fan['faceNormals']):
            for a, b in zip(actual, expected):
                self.assertAlmostEqual(a, b, places=11)

    def test_nonunit_vectors_and_degree_query(self):
        result = vertex_from_fold_vectors_query({
            'operation': 'vertex-from-fold-vectors',
            'foldVectors': [[2, 0, 0], [0, 3, 0], [0, 0, 4]]})
        self.assertEqual(result['foldVectors'], [(1, 0, 0), (0, 1, 0), (0, 0, 1)])
        self.assertEqual(result['sectorAnglesDeg'], [90., 90., 90.])
        self.assertEqual(result['foldAnglesDeg'], [90., 90., 90.])
        self.assertEqual(result['sectorSumDeg'], 270.)

    def test_rejects_zero_parallel_and_invalid_queries(self):
        for rays in ([[[0,0,0], [0,1,0], [0,0,1]],
                      [[1,0,0], [2,0,0], [0,0,1]],
                      [[1,0,0], [0,1,0]],
                      [[1,0,0], [0,1,0], [0,0,float('nan')]]]):
            with self.subTest(rays=rays), self.assertRaises(ValueError):
                vertex_from_fold_vectors(rays)
        for payload in ({'operation': 'wrong', 'foldVectors': [[1,0,0]]*3},
                        {'operation': 'vertex-from-fold-vectors', 'foldVectors': []},
                        {'operation': 'vertex-from-fold-vectors',
                         'foldVectors': [[1,0,0]]*3, 'extra': True}):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                vertex_from_fold_vectors_query(payload)


if __name__ == '__main__':
    unittest.main()
