"""Rectangular CP/3D anchors from Origamica In[2101] and In[2102]."""

from collections import Counter
import math
import unittest

from tessellation_rigid_fold_angles import rigidly_scale_fold_angles
from tessellation_rigid_quad_mesh import rigid_rectangular_quad_mesh_query


def _miura():
    # Original In[2101]: x=1, mu=2; left major angles alternate, bottom
    # minor angles alternate. Those are input cells, not Wolfram output data.
    small = math.degrees(2 * math.atan(1 / math.sqrt(2)))
    large = math.degrees(2 * math.atan(math.sqrt(2)))
    return {
        'operation': 'rigid-quad-mesh',
        'bottomDirectionsDeg': [90, 90],
        'bottomFoldAnglesDeg': [-small, small],
        'leftDirectionsDeg': [30, 30],
        'leftFoldAnglesDeg': [large, -large],
    }


def _check_face_isometry(test, graph):
    flat = graph['vertices_coords']
    folded = graph['vertices_coords3d']
    for face in graph['faces_vertices']:
        for a in range(len(face)):
            for b in range(a+1, len(face)):
                test.assertAlmostEqual(math.dist(flat[face[a]], flat[face[b]]),
                                       math.dist(folded[face[a]], folded[face[b]]),
                                       places=8)


def _check_finite_static(test, graph):
    for key in ('vertices_coords', 'vertices_coords3d'):
        test.assertTrue(all(math.isfinite(value)
                            for vertex in graph[key] for value in vertex))
    for key in ('minimumTotalEdgeLength', 'maximumGridClosureError',
                'maximumSharedEdgeDirectionError', 'maximumFrameLoopError',
                'maximumFaceDistanceError', 'maximumFaceNormalError',
                'maximumFoldAngleErrorRad', 'minimumPlanarFaceArea',
                'paperArea', 'faceAreaSumError',
                'maximumLocalClosureErrorRad',
                'maximumBaseFaceHeightError'):
        test.assertTrue(math.isfinite(graph[key]), key)
    test.assertTrue(all(math.isfinite(value) for value in graph['edgeMinimums']))
    test.assertTrue(all(math.isfinite(value) for value in graph['edges_foldAngleRad']))
    test.assertTrue(all(math.isfinite(value) for values in
                        graph['boundaryDirectionsDeg'].values() for value in values))
    if graph['minimumOtherVertexHeight'] is not None:
        test.assertTrue(math.isfinite(graph['minimumOtherVertexHeight']))
    if graph['planeGraphBuilt']:
        test.assertTrue(all(math.dist(graph['vertices_coords3d'][a],
                                      graph['vertices_coords3d'][b]) > 0
                            for a, b in graph['edges_vertices']))


class RigidRectangularQuadMeshTests(unittest.TestCase):
    def test_miura_original_in_2101_has_complete_cp_and_folded_mesh(self):
        graph = rigid_rectangular_quad_mesh_query(_miura())
        self.assertEqual(graph['kind'], 'origamica-rigid-rectangular-quad-mesh')
        self.assertEqual((graph['horizontalFaces'], graph['verticalFaces']), (3, 3))
        self.assertEqual(len(graph['vertices_coords']), 16)
        self.assertEqual(len(graph['vertices_coords3d']), 16)
        self.assertEqual(len(graph['edges_vertices']), 24)
        self.assertEqual(len(graph['faces_vertices']), 9)
        self.assertEqual(Counter(graph['edges_assignment']),
                         Counter({'B': 12, 'M': 6, 'V': 6}))
        self.assertGreater(graph['minimumPlanarFaceArea'], 0)
        self.assertLess(graph['maximumGridClosureError'], 1e-9)
        self.assertLess(graph['maximumFrameLoopError'], 1e-9)
        self.assertLess(graph['maximumSharedEdgeDirectionError'], 1e-9)
        self.assertLess(graph['maximumFaceDistanceError'], 1e-9)
        self.assertLess(graph['maximumFoldAngleErrorRad'], 1e-9)
        self.assertLess(graph['faceAreaSumError'], 1e-9)
        self.assertTrue(graph['planarEdgeCrossingChecked'])
        _check_face_isometry(self, graph)
        self.assertTrue(graph['staticGlobalIsometryChecked'])
        self.assertFalse(graph['continuousRigidPathChecked'])
        self.assertFalse(graph['selfCollisionChecked'])
        self.assertFalse(graph['globalRigidFoldingChecked'])
        _check_finite_static(self, graph)

    def test_each_shared_crease_has_two_faces_and_one_length(self):
        graph = rigid_rectangular_quad_mesh_query(_miura())
        face_counts = Counter()
        for face in graph['faces_vertices']:
            for a, b in zip(face, face[1:] + face[:1]):
                face_counts[frozenset((a, b))] += 1
        for edge, assignment in zip(graph['edges_vertices'],
                                    graph['edges_assignment']):
            self.assertEqual(face_counts[frozenset(edge)],
                             1 if assignment == 'B' else 2)
            a, b = edge
            self.assertAlmostEqual(
                math.dist(graph['vertices_coords'][a], graph['vertices_coords'][b]),
                math.dist(graph['vertices_coords3d'][a], graph['vertices_coords3d'][b]),
                places=9)
        self.assertEqual(len(face_counts), len(graph['edges_vertices']))

    def test_same_cp_remains_isometric_at_another_rigid_fold_state(self):
        original = _miura()
        before = rigid_rectangular_quad_mesh_query(original)
        changed = {**original,
                   'bottomFoldAnglesDeg': [math.degrees(value) for value in
                        rigidly_scale_fold_angles([
                            math.radians(v) for v in original['bottomFoldAnglesDeg']], 1.5)],
                   'leftFoldAnglesDeg': [math.degrees(value) for value in
                        rigidly_scale_fold_angles([
                            math.radians(v) for v in original['leftFoldAnglesDeg']], 1.5)]}
        after = rigid_rectangular_quad_mesh_query(changed)
        for a, b in zip(before['vertices_coords'], after['vertices_coords']):
            self.assertLess(math.dist(a, b), 1e-9)
        self.assertAlmostEqual(before['minimumTotalEdgeLength'],
                               after['minimumTotalEdgeLength'], places=9)
        self.assertGreater(max(math.dist(a, b) for a, b in
                               zip(before['vertices_coords3d'],
                                   after['vertices_coords3d'])), 0.1)
        _check_face_isometry(self, after)

    def test_original_in_2102_larger_mesh_is_isometric(self):
        graph = rigid_rectangular_quad_mesh_query({
            'operation': 'rigid-quad-mesh',
            'bottomDirectionsDeg': [90] * 4,
            'bottomFoldAnglesDeg': [120, -120, -120, 120],
            'leftDirectionsDeg': [0] * 4,
            'leftFoldAnglesDeg': [90, -90, -90, 90],
        })
        self.assertEqual(len(graph['vertices_coords']), 36)
        self.assertEqual(len(graph['edges_vertices']), 60)
        self.assertEqual(len(graph['faces_vertices']), 25)
        self.assertLess(graph['maximumFaceDistanceError'], 1e-9)
        self.assertLess(graph['maximumGridClosureError'], 1e-9)
        _check_face_isometry(self, graph)
        _check_finite_static(self, graph)

    def test_nonrectangular_miura_satisfies_original_corner_equations(self):
        for corners in ([95, 85, 95, 85], [100, 80, 100, 80],
                        [85, 95, 85, 95]):
            with self.subTest(corners=corners):
                graph = rigid_rectangular_quad_mesh_query({
                    **_miura(), 'rectangular': False,
                    'cornerAnglesDeg': corners})
                self.assertEqual(graph['kind'],
                                 'origamica-rigid-nonrectangular-quad-mesh')
                self.assertFalse(graph['rectangular'])
                self.assertIsNone(graph['rectangleArea'])
                self.assertGreater(graph['paperArea'], 0)
                self.assertEqual(len(graph['faces_vertices']), 9)
                self.assertLess(graph['maximumGridClosureError'], 1e-8)
                self.assertLess(graph['maximumFaceDistanceError'], 1e-8)
                self.assertLess(graph['maximumFoldAngleErrorRad'], 1e-8)
                self.assertLess(graph['faceAreaSumError'], 1e-8)
                directions = graph['boundaryDirectionsDeg']
                actual = [directions['left'][0] - directions['bottom'][0],
                          directions['bottom'][-1] + 180 - directions['right'][0],
                          directions['right'][-1] - directions['top'][-1],
                          directions['top'][0] + 180 - directions['left'][-1]]
                for found, expected in zip(actual, corners):
                    self.assertAlmostEqual(found, expected, places=7)
                self.assertGreater(abs(directions['bottom'][0]), 1)
                _check_face_isometry(self, graph)
                _check_finite_static(self, graph)

    def test_nonrectangular_five_by_five_grid_and_failure_domain(self):
        original = {
            'operation': 'rigid-quad-mesh',
            'bottomDirectionsDeg': [90] * 4,
            'bottomFoldAnglesDeg': [120, -120, -120, 120],
            'leftDirectionsDeg': [0] * 4,
            'leftFoldAnglesDeg': [90, -90, -90, 90],
            'rectangular': False,
            'cornerAnglesDeg': [95, 85, 95, 85],
        }
        graph = rigid_rectangular_quad_mesh_query(original)
        self.assertEqual(len(graph['faces_vertices']), 25)
        self.assertLess(graph['maximumGridClosureError'], 1e-8)
        _check_face_isometry(self, graph)
        _check_finite_static(self, graph)
        scalar = rigid_rectangular_quad_mesh_query({
            **_miura(), 'rectangular': False, 'cornerAnglesDeg': 90})
        self.assertEqual(scalar['cornerAnglesDeg'], [90] * 4)
        self.assertLess(scalar['maximumFaceDistanceError'], 1e-8)
        with self.assertRaisesRegex(ValueError, '折后面退化'):
            rigid_rectangular_quad_mesh_query({
                **_miura(), 'rectangular': False,
                'cornerAnglesDeg': [180, 90, 90, 90]})
        for bad in ({**original, 'cornerAnglesDeg': [90, 90]},
                    {**original, 'cornerAnglesDeg': 0},
                    {**original, 'cornerAnglesDeg': 181},
                    {**original, 'rectangular': 'false'}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                rigid_rectangular_quad_mesh_query(bad)

    def test_nonrectangular_backplane_constraints_are_verified_in_spatial_coordinates(self):
        query = {
            'operation': 'rigid-quad-mesh',
            'bottomDirectionsDeg': [90] * 5,
            'bottomFoldAnglesDeg': [108, -72, -72, -72, 108],
            'leftDirectionsDeg': [0] * 4,
            'leftFoldAnglesDeg': [132.5, -132.5, -132.5, 132.5],
            'rectangular': False,
            'cornerAnglesDeg': [95, 85, 95, 85],
            'baseFaces': [[0, 0], [5, 0]],
        }
        graph = rigid_rectangular_quad_mesh_query(query)
        self.assertEqual((len(graph['vertices_coords']),
                          len(graph['faces_vertices'])), (42, 30))
        self.assertEqual(graph['baseFaces'], query['baseFaces'])
        self.assertEqual(len(graph['unverifiedOrigamicaOptions']), 1)
        self.assertEqual(graph['unsupportedOrigamicaOptions'], [])
        self.assertLess(graph['maximumBaseFaceHeightError'], 1e-8)
        self.assertGreaterEqual(graph['minimumOtherVertexHeight'], -1e-8)
        self.assertGreater(graph['minimumPlanarFaceArea'], 0)
        self.assertLess(graph['maximumFaceDistanceError'], 1e-8)
        directions = graph['boundaryDirectionsDeg']
        actual_corners = [directions['left'][0] - directions['bottom'][0],
                          directions['bottom'][-1] + 180 - directions['right'][0],
                          directions['right'][-1] - directions['top'][-1],
                          directions['top'][0] + 180 - directions['left'][-1]]
        for found, expected in zip(actual_corners, query['cornerAnglesDeg']):
            self.assertAlmostEqual(found, expected, places=7)
        _check_face_isometry(self, graph)
        _check_finite_static(self, graph)

        # Verify the source equations independently from the solver's
        # reported metrics: the selected centroids share a plane and every
        # other grid vertex lies on its positive side.
        spatial = graph['vertices_coords3d']
        faces = graph['faces_vertices']
        base = [faces[j*graph['horizontalFaces']+i] for i, j in query['baseFaces']]
        def centroid(face):
            return [sum(spatial[index][axis] for index in face)/len(face)
                    for axis in range(3)]
        def dot(one, two):
            return sum(a*b for a, b in zip(one, two))
        first = centroid(base[0])
        a, b, c = [spatial[index] for index in base[0][:3]]
        u = [b[axis]-a[axis] for axis in range(3)]
        v = [c[axis]-a[axis] for axis in range(3)]
        normal = [u[1]*v[2]-u[2]*v[1],
                  u[2]*v[0]-u[0]*v[2],
                  u[0]*v[1]-u[1]*v[0]]
        magnitude = math.sqrt(dot(normal, normal))
        normal = [value/magnitude for value in normal]
        self.assertLess(abs(dot(normal, [x-y for x, y in
                                        zip(centroid(base[1]), first)])), 1e-8)
        base_vertices = {index for face in base for index in face}
        other_heights = [dot(normal, [x-y for x, y in zip(point, first)])
                         for index, point in enumerate(spatial)
                         if index not in base_vertices]
        self.assertTrue(other_heights)
        self.assertGreaterEqual(min(other_heights), -1e-8)

        unconstrained = rigid_rectangular_quad_mesh_query({
            key: value for key, value in query.items() if key != 'baseFaces'})
        self.assertGreater(graph['minimumTotalEdgeLength'],
                           unconstrained['minimumTotalEdgeLength'] + 1)
        with self.assertRaisesRegex(ValueError, '法向不平行'):
            rigid_rectangular_quad_mesh_query({**query, 'baseFaces': [[0, 0], [1, 0]]})

    def test_nonrectangular_backplane_optimizer_failure_has_optional_sectors(self):
        query = {**_miura(), 'rectangular': False,
                 'cornerAnglesDeg': [95, 85, 95, 85],
                 'baseFaces': [[0, 0]]}
        with self.assertRaisesRegex(ValueError, '优化未收敛') as plain:
            rigid_rectangular_quad_mesh_query(query)
        self.assertNotIn('扇区角诊断', str(plain.exception))
        with self.assertRaisesRegex(ValueError, '扇区角诊断') as detailed:
            rigid_rectangular_quad_mesh_query({**query, 'printSectorsOnFail': True})
        self.assertIn('(1,1)', str(detailed.exception))

    def test_original_in_2104_base_faces_share_backplane(self):
        query = {
            'operation': 'rigid-quad-mesh',
            'bottomDirectionsDeg': [90] * 5,
            'bottomFoldAnglesDeg': [108, -72, -72, -72, 108],
            'leftDirectionsDeg': [0] * 4,
            'leftFoldAnglesDeg': [132.5, -132.5, -132.5, 132.5],
            'baseFaces': [[0, 0], [5, 0]],
        }
        graph = rigid_rectangular_quad_mesh_query(query)
        self.assertEqual(graph['baseFaces'], query['baseFaces'])
        self.assertLess(graph['maximumBaseFaceHeightError'], 1e-8)
        self.assertGreaterEqual(graph['minimumOtherVertexHeight'], -1e-8)
        self.assertEqual(len(graph['faces_vertices']), 30)
        _check_face_isometry(self, graph)
        _check_finite_static(self, graph)
        unconstrained = rigid_rectangular_quad_mesh_query({
            key: value for key, value in query.items() if key != 'baseFaces'})
        self.assertGreaterEqual(graph['minimumTotalEdgeLength'] + 1e-8,
                                unconstrained['minimumTotalEdgeLength'])
        with self.assertRaises(ValueError):
            rigid_rectangular_quad_mesh_query({**query, 'baseFaces': [[6, 0]]})

    def test_original_in_2104_zero_edge_merges_one_pair_and_makes_triangle(self):
        query = {
            'operation': 'rigid-quad-mesh',
            'bottomDirectionsDeg': [90] * 5,
            'bottomFoldAnglesDeg': [108, -72, -72, -72, 108],
            'leftDirectionsDeg': [0] * 4,
            'leftFoldAnglesDeg': [132.5, -132.5, -132.5, 132.5],
            'baseFaces': [[0, 0], [5, 0]],
            'minimumEdgeLengths': [[1, 6, 2, 0]],
        }
        graph = rigid_rectangular_quad_mesh_query(query)
        self.assertEqual(len(graph['vertices_coords']), 41)
        self.assertEqual(len(graph['edges_vertices']), 70)
        self.assertEqual(len(graph['faces_vertices']), 30)
        self.assertEqual(Counter(map(len, graph['faces_vertices'])),
                         Counter({4: 29, 3: 1}))
        self.assertEqual(graph['indexGrid'][2][6], graph['indexGrid'][3][6])
        self.assertLess(graph['maximumBaseFaceHeightError'], 1e-8)
        self.assertGreaterEqual(graph['minimumOtherVertexHeight'], -1e-8)
        _check_face_isometry(self, graph)
        _check_finite_static(self, graph)
        with self.assertRaises(ValueError):
            rigid_rectangular_quad_mesh_query({**query,
                'minimumEdgeLengths': [[1, 6, 2, -0.1]]})

    def test_plane_graph_switch_and_none_tolerance_preserve_original_raw_graph(self):
        raw = rigid_rectangular_quad_mesh_query({
            **_miura(), 'addPlaneGraph': False, 'samePtTolerance': None})
        self.assertFalse(raw['planeGraphBuilt'])
        self.assertFalse(raw['planarEdgeCrossingChecked'])
        self.assertIsNone(raw['samePtTolerance'])
        self.assertEqual(len(raw['faces_vertices']), 0)
        self.assertEqual((len(raw['vertices_coords']), len(raw['edges_vertices'])),
                         (16, 24))
        self.assertEqual(len(raw['vertices_coords3d']), 16)
        sample = {
            'operation': 'rigid-quad-mesh',
            'bottomDirectionsDeg': [90] * 5,
            'bottomFoldAnglesDeg': [108, -72, -72, -72, 108],
            'leftDirectionsDeg': [0] * 4,
            'leftFoldAnglesDeg': [132.5, -132.5, -132.5, 132.5],
            'baseFaces': [[0, 0], [5, 0]],
            'minimumEdgeLengths': [[1, 6, 2, 0]],
        }
        merged = rigid_rectangular_quad_mesh_query(sample)
        unmerged = rigid_rectangular_quad_mesh_query({
            **sample, 'addPlaneGraph': False, 'samePtTolerance': None})
        self.assertEqual((len(merged['vertices_coords']),
                          len(merged['edges_vertices'])), (41, 70))
        self.assertEqual((len(unmerged['vertices_coords']),
                          len(unmerged['edges_vertices']),
                          len(unmerged['faces_vertices'])), (42, 71, 0))
        with self.assertRaises(ValueError):
            rigid_rectangular_quad_mesh_query({**sample, 'samePtTolerance': None})

    def test_print_sectors_on_optimizer_failure_is_diagnostic_only(self):
        failing = {**_miura(), 'leftDirectionsDeg': [-10, 20]}
        with self.assertRaisesRegex(ValueError, '无法形成矩形刚性') as plain:
            rigid_rectangular_quad_mesh_query(failing)
        self.assertNotIn('扇区角诊断', str(plain.exception))
        with self.assertRaisesRegex(ValueError, '扇区角诊断') as detailed:
            rigid_rectangular_quad_mesh_query({
                **failing, 'printSectorsOnFail': True})
        self.assertIn('(1,1)', str(detailed.exception))
        self.assertIn('°', str(detailed.exception))
        with self.assertRaises(ValueError):
            rigid_rectangular_quad_mesh_query({**_miura(),
                'printSectorsOnFail': 'true'})

    def test_minimum_length_override_and_invalid_contract(self):
        bigger = rigid_rectangular_quad_mesh_query({
            **_miura(), 'minimumEdgeLengths': [[0, 0, 0, 3]]})
        a, b = bigger['edges_vertices'][0]
        self.assertGreaterEqual(math.dist(bigger['vertices_coords'][a],
                                          bigger['vertices_coords'][b]), 3-1e-8)
        self.assertLess(bigger['maximumFaceDistanceError'], 1e-9)
        for payload in [
            {**_miura(), 'minimumEdgeLength': 0},
            {**_miura(), 'minimumEdgeLengths': [[0, 0, 0, -0.1]]},
            {**_miura(), 'minimumEdgeLengths': [[1, 4, 0, 2]]},
            {**_miura(), 'bottomFoldAnglesDeg':
                [_miura()['leftFoldAnglesDeg'][0],
                 -_miura()['leftFoldAnglesDeg'][0]]},
            {**_miura(), 'bottomDirectionsDeg': [90] * 13,
             'bottomFoldAnglesDeg': [60] * 13},
            {**_miura(), 'Rectangular': False},
        ]:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                rigid_rectangular_quad_mesh_query(payload)


if __name__ == '__main__':
    unittest.main()
