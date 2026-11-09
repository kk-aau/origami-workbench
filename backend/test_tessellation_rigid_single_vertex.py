"""Checks for the original In[2106] rigid quad mesh single-vertex example."""

import math
import unittest

from tessellation_rigid_single_vertex import (
    rigid_quad_mesh_angle_propagation_query,
    rigid_single_vertex_quad_mesh,
    rigid_single_vertex_quad_mesh_query,
)


_EXAMPLE = {'operation': 'rigid-single-vertex-quad-mesh',
            'bottom': [90, 60], 'left': [0, 135]}


class RigidSingleVertexQuadMeshTests(unittest.TestCase):
    def test_original_in_2106_example_folds_and_sectors(self):
        result = rigid_single_vertex_quad_mesh_query(_EXAMPLE)
        self.assertEqual(result['kind'], 'origamica-rigid-single-vertex-quad-mesh')
        self.assertFalse(result['majorVertical'])  # 60° < 135°
        self.assertAlmostEqual(result['halfTangentRatio'],
                               math.tan(math.radians(30)) / math.tan(math.radians(67.5)))
        self.assertEqual(len(result['vertices_coords']), 9)
        self.assertEqual(len(result['edges_vertices']), 12)
        self.assertEqual(len(result['faces_vertices']), 4)
        # Counterclockwise fan starts at the outgoing right ray.
        for actual, expected in zip(result['foldAnglesDeg'], [135, -60, 135, 60]):
            self.assertAlmostEqual(actual, expected, places=11)
        for actual, expected in zip(result['sectorAnglesDeg'],
                                    [90, 63.10104894772737, 90, 116.89895105227262]):
            self.assertAlmostEqual(actual, expected, places=10)
        self.assertAlmostEqual(result['outgoingDirectionsDeg'][0],
                               26.898951052272626, places=10)
        self.assertAlmostEqual(result['outgoingDirectionsDeg'][1],
                               116.89895105227262, places=10)
        self.assertLess(result['localClosureErrorRad'], 1e-12)

    def test_all_faces_are_isometric_and_creases_are_classified(self):
        result = rigid_single_vertex_quad_mesh_query(_EXAMPLE)
        planar = result['vertices_coords']
        folded = result['vertices_coords3d']
        for face in result['faces_vertices']:
            for i in range(4):
                for j in range(i + 1, 4):
                    a, b = face[i], face[j]
                    self.assertAlmostEqual(math.dist(planar[a], planar[b]),
                                           math.dist(folded[a], folded[b]), places=10)
        self.assertLess(result['maximumFaceDistanceError'], 1e-10)
        self.assertEqual(result['edges_assignment'],
                         ['B', 'B', 'V', 'V', 'B', 'B', 'B', 'V', 'B', 'B', 'M', 'B'])
        self.assertFalse(result['continuousRigidPathChecked'])
        self.assertFalse(result['selfCollisionChecked'])
        self.assertFalse(result['globalFoldabilityChecked'])

    def test_major_vertical_branch_has_opposite_outgoing_assignment(self):
        result = rigid_single_vertex_quad_mesh_query({
            **_EXAMPLE, 'bottom': [90, 135], 'left': [0, 60]})
        self.assertTrue(result['majorVertical'])
        for actual, expected in zip(result['foldAnglesDeg'], [-60, 135, 60, 135]):
            self.assertAlmostEqual(actual, expected, places=11)
        self.assertLess(result['maximumFaceDistanceError'], 1e-10)
        self.assertLess(result['localClosureErrorRad'], 1e-12)

    def test_minimum_edge_length_scales_geometry(self):
        original = rigid_single_vertex_quad_mesh_query(_EXAMPLE)
        double = rigid_single_vertex_quad_mesh_query({**_EXAMPLE,
                                                      'minimumEdgeLength': 2})
        self.assertAlmostEqual(double['minimumTotalEdgeLength'],
                               2 * original['minimumTotalEdgeLength'], places=9)
        for before, after in zip(original['vertices_coords'], double['vertices_coords']):
            for a, b in zip(before, after):
                self.assertAlmostEqual(2 * a, b, places=9)
        for before, after in zip(original['vertices_coords3d'],
                                 double['vertices_coords3d']):
            for a, b in zip(before, after):
                self.assertAlmostEqual(2 * a, b, places=9)

    def test_single_edge_override_changes_only_minimum_contract(self):
        result = rigid_single_vertex_quad_mesh_query({
            **_EXAMPLE, 'minimumEdgeLengths': [[0, 1, 0, 2]]})
        edge = result['edges_vertices'][1]
        self.assertGreaterEqual(math.dist(*(result['vertices_coords'][i]
                                            for i in edge)), 2 - 1e-9)
        self.assertEqual(result['edgeMinimums'][1], 2)
        self.assertLess(result['maximumFaceDistanceError'], 1e-10)

    def test_rejects_undefined_sector_and_unsupported_collapsed_edge(self):
        for data in [
            {**_EXAMPLE, 'left': [0, 60]},
            {**_EXAMPLE, 'left': [0, -60]},
            {**_EXAMPLE, 'bottom': [0, 60]},
            {**_EXAMPLE, 'bottom': [90, 0]},
            {**_EXAMPLE, 'minimumEdgeLengths': [[0, 0, 0, 0]]},
            {**_EXAMPLE, 'minimumEdgeLengths': [[0, 3, 0, 2]]},
            {**_EXAMPLE, 'minimumEdgeLength': 0},
            {**_EXAMPLE, 'unexpected': 1},
        ]:
            with self.subTest(data=data), self.assertRaises(ValueError):
                rigid_single_vertex_quad_mesh_query(data)
        with self.assertRaises(ValueError):
            rigid_single_vertex_quad_mesh(math.pi/2, math.pi/3, 0,
                                          3*math.pi/4,
                                          default_minimum_edge_length=1e-9)

    def test_original_miura_in_2101_global_angle_propagation(self):
        small = math.degrees(2 * math.atan(1 / math.sqrt(2)))
        large = math.degrees(2 * math.atan(math.sqrt(2)))
        result = rigid_quad_mesh_angle_propagation_query({
            'operation': 'rigid-quad-mesh-angle-propagation',
            'bottomDirectionsDeg': [90, 90],
            'bottomFoldAnglesDeg': [-small, small],
            'leftDirectionsDeg': [30, 30],
            'leftFoldAnglesDeg': [large, -large],
        })
        self.assertEqual((result['horizontalFaces'], result['verticalFaces']), (3, 3))
        self.assertEqual(len(result['interiorVertices']), 4)
        self.assertEqual(len(result['horizontalInteriorCreases']), 6)
        self.assertEqual(len(result['verticalInteriorCreases']), 6)
        first = result['interiorVertices'][0]
        for actual, expected in zip(first['sectorAnglesDeg'], [120, 120, 60, 60]):
            self.assertAlmostEqual(actual, expected, places=10)
        self.assertLess(result['maximumLocalClosureErrorRad'], 1e-12)
        self.assertFalse(result['planarAndFoldedCoordinatesSolved'])
        self.assertFalse(result['globalRigidFoldingChecked'])

    def test_single_vertex_graph_uses_same_global_recurrence(self):
        single = rigid_single_vertex_quad_mesh_query(_EXAMPLE)
        propagated = rigid_quad_mesh_angle_propagation_query({
            'operation': 'rigid-quad-mesh-angle-propagation',
            'bottomDirectionsDeg': [90], 'bottomFoldAnglesDeg': [60],
            'leftDirectionsDeg': [0], 'leftFoldAnglesDeg': [135],
        })['interiorVertices'][0]
        for name in ('sectorAnglesDeg', 'foldAnglesDeg', 'outgoingDirectionsDeg'):
            for left, right in zip(single[name], propagated[name]):
                self.assertAlmostEqual(left, right, places=11)

    def test_original_in_2102_global_edges_agree_at_both_ends(self):
        result = rigid_quad_mesh_angle_propagation_query({
            'operation': 'rigid-quad-mesh-angle-propagation',
            'bottomDirectionsDeg': [90] * 4,
            'bottomFoldAnglesDeg': [120, -120, -120, 120],
            'leftDirectionsDeg': [0] * 4,
            'leftFoldAnglesDeg': [90, -90, -90, 90],
        })
        self.assertEqual((result['horizontalFaces'], result['verticalFaces']), (5, 5))
        self.assertEqual(len(result['interiorVertices']), 16)
        vertices = {(v['i'], v['j']): v for v in result['interiorVertices']}
        for (i, j), vertex in vertices.items():
            self.assertAlmostEqual(sum(vertex['sectorAnglesDeg']), 360, places=9)
            if i > 1:
                neighbor = vertices[i - 1, j]
                self.assertAlmostEqual(vertex['foldAnglesDeg'][2],
                                       neighbor['foldAnglesDeg'][0], places=9)
                self.assertAlmostEqual(vertex['incomingDirectionsDeg'][1],
                                       neighbor['outgoingDirectionsDeg'][0], places=9)
            if j > 1:
                neighbor = vertices[i, j - 1]
                self.assertAlmostEqual(vertex['foldAnglesDeg'][3],
                                       neighbor['foldAnglesDeg'][1], places=9)
                self.assertAlmostEqual(vertex['incomingDirectionsDeg'][0],
                                       neighbor['outgoingDirectionsDeg'][1], places=9)
        self.assertLess(result['maximumLocalClosureErrorRad'], 1e-12)

    def test_global_query_rejects_mismatched_lists_and_shared_fold_magnitude(self):
        base = {
            'operation': 'rigid-quad-mesh-angle-propagation',
            'bottomDirectionsDeg': [90, 90], 'bottomFoldAnglesDeg': [60, -60],
            'leftDirectionsDeg': [0, 0], 'leftFoldAnglesDeg': [135, -135],
        }
        for data in [
            {**base, 'bottomDirectionsDeg': [90]},
            {**base, 'leftFoldAnglesDeg': [60, -135]},
            {**base, 'leftDirectionsDeg': []},
            {**base, 'bottomFoldAnglesDeg': [0, 60]},
            {**base, 'extra': 1},
        ]:
            with self.subTest(data=data), self.assertRaises(ValueError):
                rigid_quad_mesh_angle_propagation_query(data)


if __name__ == '__main__':
    unittest.main()
