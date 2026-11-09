"""Regression coverage for the original ordered DualFaces data contract."""
import copy
import json
import math
import unittest
from collections import defaultdict
from pathlib import Path

from tessellation_dual_faces import reciprocal_face_topology
from tessellation_meshes import reciprocal_centers
from tessellation_patterns import fold_from_faces, make_fold


FIXTURE = Path(__file__).resolve().parents[1]/'tests/fixtures/original_dual_faces_1010.json'


def shared_edges(mother):
    owners = defaultdict(list)
    for f, face in enumerate(mother['faces_vertices']):
        rings = [face, *mother.get('faces_holes', [[] for _ in mother['faces_vertices']])[f]]
        for ring in rings:
            for a, b in zip(ring, ring[1:]+ring[:1]):
                owners[tuple(sorted((a, b)))].append(f)
    return [ids for _, ids in sorted(owners.items()) if len(ids) == 2]


def grid(columns, rows, omitted=()):
    points = [[x, y] for y in range(rows+1) for x in range(columns+1)]
    faces = [[y*(columns+1)+x, y*(columns+1)+x+1,
              (y+1)*(columns+1)+x+1, (y+1)*(columns+1)+x]
             for y in range(rows) for x in range(columns) if (x, y) not in omitted]
    return fold_from_faces(points, faces)


class OriginalDualFacesTests(unittest.TestCase):
    def test_frozen_original_exact_faces_and_primal_index_order(self):
        for fixture in json.loads(FIXTURE.read_text('utf-8'))['cases']:
            with self.subTest(fixture['case']):
                mother = fixture['mother']
                before = copy.deepcopy(mother)
                faces, vertices = reciprocal_face_topology(mother, fixture['dual']['edges_vertices'])
                self.assertEqual(faces, fixture['originalDualFaces0BasedForCurrentFormat'])
                self.assertEqual(vertices, [v-1 for v in fixture['interiorPrimalVertices1Based']])
                self.assertEqual(mother, before)
                # These two source cases have positive dual areas; area is an
                # assertion on this evidence, never a production face filter.
                coords = fixture['dual']['vertices_coords']
                for face in faces:
                    self.assertGreater(sum(coords[a][0]*coords[b][1]-coords[a][1]*coords[b][0]
                                           for a, b in zip(face, face[1:]+face[:1])), 0)

    def test_reciprocal_returns_faces_mapping_and_same_geometry(self):
        for fixture in json.loads(FIXTURE.read_text('utf-8'))['cases']:
            with self.subTest(fixture['case']):
                centers, dual = reciprocal_centers(fixture['mother'], fixture['dual']['vertices_coords'])
                self.assertEqual(dual['faces_vertices'], fixture['originalDualFaces0BasedForCurrentFormat'])
                self.assertEqual(dual['zhezhi_dual_primal_vertices'],
                                 [v-1 for v in fixture['interiorPrimalVertices1Based']])
                self.assertEqual(dual['edges_vertices'], shared_edges(fixture['mother']))
                for actual, prior in zip(centers, fixture['dual']['vertices_coords']):
                    self.assertLess(math.dist(actual, prior), 1e-9)

    def test_orientation_copy_keeps_original_face_ids_and_exact_start(self):
        mother = grid(2, 2)
        expected = reciprocal_face_topology(mother, shared_edges(mother))
        mother['faces_vertices'] = [face[::-1] for face in mother['faces_vertices']]
        before = copy.deepcopy(mother)
        self.assertEqual(reciprocal_face_topology(mother, shared_edges(mother)), expected)
        self.assertEqual(mother, before)
        self.assertEqual(expected, ([[1, 3, 2, 0]], [4]))

    def test_two_face_boundary_patch_has_proven_empty_faces(self):
        mother = grid(2, 1)
        self.assertEqual(reciprocal_face_topology(mother, shared_edges(mother)), ([], []))
        _, dual = reciprocal_centers(mother)
        self.assertEqual(dual['faces_vertices'], [])
        self.assertEqual(dual['zhezhi_dual_primal_vertices'], [])

    def test_omitted_center_is_material_hole_without_fake_dual_face(self):
        mother = grid(3, 3, omitted={(1, 1)})
        self.assertEqual(reciprocal_face_topology(mother, shared_edges(mother)), ([], []))

    def test_disconnected_patches_keep_original_vertex_and_face_offsets(self):
        first, second = grid(2, 2), grid(2, 2)
        mother = make_fold(first['vertices_coords']+[[x+5, y] for x, y in second['vertices_coords']],
                           first['edges_vertices']+[[a+9, b+9] for a, b in second['edges_vertices']],
                           first['edges_assignment']+second['edges_assignment'],
                           first['faces_vertices']+[[v+9 for v in face] for face in second['faces_vertices']])
        self.assertEqual(reciprocal_face_topology(mother, shared_edges(mother)),
                         ([[1, 3, 2, 0], [5, 7, 6, 4]], [4, 13]))

    def test_explicit_hole_rings_are_boundary_sectors(self):
        points = [[0, 0], [4, 0], [4, 4], [0, 4], [1, 1], [3, 1], [3, 3], [1, 3]]
        mother = make_fold(points, [[0, 1], [1, 2], [2, 3], [3, 0],
                                    [4, 5], [5, 6], [6, 7], [7, 4]], ['B']*8, [[0, 1, 2, 3]])
        mother['faces_holes'] = [[[4, 5, 6, 7]]]
        before = copy.deepcopy(mother)
        self.assertEqual(reciprocal_face_topology(mother, []), ([], []))
        self.assertEqual(mother, before)

    def test_source_valence_two_face_is_retained_without_area_filter(self):
        # A subdivided interior primal edge has two distinct incident faces.
        points = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [1, .5]]
        mother = fold_from_faces(points, [[0, 1, 6, 4, 3], [1, 2, 5, 4, 6]])
        self.assertEqual(reciprocal_face_topology(mother, [[0, 1]]), ([[1, 0]], [6]))
        _, dual = reciprocal_centers(mother)
        self.assertEqual(dual['faces_vertices'], [[1, 0]])
        self.assertEqual(dual['zhezhi_dual_primal_vertices'], [6])

    def test_finite_integer_coordinates_with_overflowing_area_fail_without_mutation(self):
        large = 10**200
        mother = {
            'vertices_coords': [[0, 0], [large, 0], [0, large]],
            'edges_vertices': [[0, 1], [1, 2], [2, 0]],
            'faces_vertices': [[0, 1, 2]],
        }
        # Each coordinate converts to finite float; the exact integer area
        # exceeds that conversion range and must raise the controlled error.
        self.assertTrue(all(math.isfinite(c) for point in mother['vertices_coords'] for c in point))
        before = copy.deepcopy(mother)
        with self.assertRaisesRegex(ValueError, '环面积'):
            reciprocal_face_topology(mother, [])
        self.assertEqual(mother, before)

    def test_missing_nonfinite_degenerate_and_inconsistent_inputs_fail(self):
        base = grid(2, 2)
        cases = []
        for key in ('vertices_coords', 'edges_vertices', 'faces_vertices'):
            invalid = copy.deepcopy(base); del invalid[key]; cases.append(invalid)
        invalid = copy.deepcopy(base); invalid['vertices_coords'][0][0] = math.nan; cases.append(invalid)
        invalid = copy.deepcopy(base); invalid['vertices_coords'][0][0] = math.inf; cases.append(invalid)
        invalid = copy.deepcopy(base); invalid['vertices_coords'][0][0] = 10**1000; cases.append(invalid)
        invalid = copy.deepcopy(base); invalid['vertices_coords'][0] = invalid['vertices_coords'][1]; cases.append(invalid)
        invalid = copy.deepcopy(base); invalid['edges_vertices'].append(invalid['edges_vertices'][0]); cases.append(invalid)
        invalid = copy.deepcopy(base); invalid['edges_vertices'].pop(); cases.append(invalid)
        invalid = copy.deepcopy(base); invalid['edges_vertices'].append([0, 8]); cases.append(invalid)
        invalid = copy.deepcopy(base); invalid['vertices_coords'].append([9, 9]); cases.append(invalid)
        invalid = copy.deepcopy(base); invalid['faces_vertices'][0][0] = True; cases.append(invalid)
        invalid = copy.deepcopy(base); invalid['faces_vertices'].append(invalid['faces_vertices'][0]); cases.append(invalid)
        invalid = copy.deepcopy(base); invalid['faces_vertices'][0] = [0, 1, 2]; cases.append(invalid)
        invalid = copy.deepcopy(base); invalid['faces_holes'] = None; cases.append(invalid)
        invalid = copy.deepcopy(base); invalid['faces_holes'] = [[]]; cases.append(invalid)
        for i, invalid in enumerate(cases):
            with self.subTest(i=i), self.assertRaises(ValueError):
                reciprocal_face_topology(invalid, [[0, 1], [0, 2], [1, 3], [2, 3]])
        with self.assertRaisesRegex(ValueError, '对偶面边'):
            reciprocal_face_topology(base, [])


if __name__ == '__main__':
    unittest.main()
