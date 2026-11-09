import math
import unittest
from collections import Counter

from tessellation_lattice_patch import (
    lattice_patch_mesh, make_lattice_tiling, patch_check_parity, patch_check_types,
    patch_vector, patch_vectors, polygons_from_custom, twist_patch_options,
)


SQUARE = [[[0, 0], [1, 0], [1, 1], [0, 1]]]
TWO_SQUARES = [SQUARE[0], [[1, 0], [2, 0], [2, 1], [1, 1]]]


class LatticePatchTests(unittest.TestCase):
    def test_patch_vector_and_vectors_use_original_one_based_tile_vertex_references(self):
        self.assertEqual(patch_vector(TWO_SQUARES, [1, 1], [2, 2]), [2, 0])
        self.assertEqual(patch_vectors(TWO_SQUARES, [1, 1], [2, 2], [1, 4]),
                         [[2, 0], [0, 1]])
        self.assertEqual(polygons_from_custom(
            [[0, 0], [1, 0], [1, 1], [0, 1], [2, 0], [2, 1]],
            [[0, 1, 2, 3], [1, 4, 5, 2]]), TWO_SQUARES)
        for ref in ([0, 1], [3, 1], [1, 5], [1.5, 2], [True, 1]):
            with self.subTest(ref=ref), self.assertRaises(ValueError):
                patch_vector(TWO_SQUARES, ref, [1, 1])

    def test_negative_inclusive_ranges_preserve_notebook_j2_j1_source_order(self):
        instances = make_lattice_tiling(TWO_SQUARES, [[2, 0], [0, 1]], [-1, 1], [0, 1])
        self.assertEqual(len(instances), 12)
        self.assertEqual([(item['cell'], item['sourceFace']) for item in instances],
                         [([j1, j2], source) for j2 in (0, 1) for j1 in (-1, 0, 1)
                          for source in (0, 1)])
        self.assertEqual(instances[0]['polygon'], [[-2., 0.], [-1., 0.], [-1., 1.], [-2., 1.]])
        self.assertEqual(instances[-1]['polygon'], [[3., 1.], [4., 1.], [4., 2.], [3., 2.]])
        self.assertEqual([item['tileIndex'] for item in instances], list(range(12)))

    def test_original_two_colorable_archimedean_patch_number_two(self):
        # Notebook 233842–233878: JoinTiling of two unit squares, parity
        # {+1,-1}, lattice PatchVectors[patch,{1,1},{2,2},{1,3}].
        vectors = patch_vectors(TWO_SQUARES, [1, 1], [2, 2], [1, 3])
        self.assertEqual(vectors, [[2, 0], [1, 1]])
        self.assertEqual(patch_check_parity(TWO_SQUARES, [1, -1]), [1, -1])
        mesh = lattice_patch_mesh(TWO_SQUARES, vectors, [-1, 1], [-1, 1])
        self.assertEqual((len(mesh['vertices_coords']), len(mesh['edges_vertices']),
                          len(mesh['faces_vertices'])), (30, 47, 18))
        self.assertEqual(Counter(mesh['zhezhi_custom_face_index']), {0: 9, 1: 9})
        self.assertEqual(len(mesh['vertices_coords'])-len(mesh['edges_vertices'])+
                         len(mesh['faces_vertices']), 1)

    def test_shared_edges_weld_for_negative_square_grid(self):
        mesh = lattice_patch_mesh(SQUARE, [[1, 0], [0, 1]], [-1, 1], [-1, 1])
        self.assertEqual((len(mesh['vertices_coords']), len(mesh['edges_vertices']),
                          len(mesh['faces_vertices'])), (16, 24, 9))
        self.assertEqual(mesh['zhezhi_lattice_cells'],
                         [[j1, j2] for j2 in (-1, 0, 1) for j1 in (-1, 0, 1)])
        self.assertEqual(mesh['zhezhi_custom_face_index'], [0]*9)
        uses = Counter(tuple(sorted(edge)) for face in mesh['faces_vertices']
                       for edge in zip(face, face[1:]+face[:1]))
        self.assertEqual(Counter(uses.values()), {1: 12, 2: 12})
        self.assertEqual(len(mesh['vertices_coords'])-len(mesh['edges_vertices'])+
                         len(mesh['faces_vertices']), 1)

    def test_skew_basis_welds_and_keeps_source_identity(self):
        rhombus = [[[0, 0], [1, 0], [1.5, 1], [.5, 1]]]
        mesh = lattice_patch_mesh(rhombus, [[1, 0], [.5, 1]], [-2, 0], [1, 2])
        self.assertEqual((len(mesh['vertices_coords']), len(mesh['faces_vertices'])), (12, 6))
        self.assertEqual(mesh['zhezhi_lattice_cells'][0], [-2, 1])
        self.assertEqual(mesh['zhezhi_lattice_cells'][-1], [0, 2])
        self.assertEqual(len({tuple(point) for point in mesh['vertices_coords']}), 12)

    def test_partial_shared_edge_is_split_and_welded_without_source_reordering(self):
        patch = [SQUARE[0], [[1, 0], [2, 0], [2, 1], [1, 1], [1, .5]]]
        mesh = lattice_patch_mesh(patch, [[2, 0], [0, 1]], [0, 0], [0, 0])
        self.assertEqual(mesh['zhezhi_custom_face_index'], [0, 1])
        self.assertEqual(len(mesh['faces_vertices'][0]), 5)
        shared = [tuple(sorted((a, b))) for a, b in mesh['edges_vertices']
                  if all(abs(mesh['vertices_coords'][v][0]-1) < 1e-9 for v in (a, b))]
        self.assertEqual(len(shared), 2)
        for edge in shared:
            self.assertEqual(sum(edge in {tuple(sorted((a, b))) for a, b in
                                              zip(face, face[1:]+face[:1])}
                                 for face in mesh['faces_vertices']), 2)

    def test_negative_cell_can_feed_existing_individual_twist_assembler(self):
        from tessellation_tile_patch import construct_tile_patch
        vertices = [[0, 0], [.5, 0], [1, 0], [0, .5], [.5, .5], [1, .5],
                    [0, 1], [.5, 1], [1, 1]]
        faces = [[0, 1, 4, 3], [1, 2, 5, 4], [3, 4, 7, 6], [4, 5, 8, 7]]
        patch = polygons_from_custom(vertices, faces)
        mother = lattice_patch_mesh(patch, [[1, 0], [0, 1]], [-1, 0], [0, 0])
        options = [dict(width=.2, offset=0, tilt=tilt,
                        centralTypes=[type_]*4)
                   for tilt, type_ in zip((70, 110, 110, 70), ('M', 'V', 'V', 'M'))]
        fold = construct_tile_patch(mother, options, vertices, faces)
        self.assertEqual(len(mother['faces_vertices']), 8)
        self.assertEqual(mother['zhezhi_custom_face_index'], list(range(4))*2)
        self.assertEqual(set(fold['zhezhi_face_tile_source']), set(range(4)))
        self.assertEqual(len(fold['zhezhi_face_tile_instance']), len(fold['faces_vertices']))

    def test_types_parity_and_three_original_twist_patch_variants(self):
        types = [['M']*4, ['V', 'M', 'M', 'V']]
        self.assertEqual(patch_check_types(TWO_SQUARES, types), types)
        self.assertEqual(patch_check_parity(TWO_SQUARES, [1, -1]), [1, -1])
        options = twist_patch_options(TWO_SQUARES, types, .2, offset=.1,
                                      parity=[1, -1])
        self.assertEqual([entry['offset'] for entry in options], [.1, -.1])
        self.assertEqual([entry['centralTypes'] for entry in options], types)
        centered = twist_patch_options(TWO_SQUARES, types, .2,
                                       variant='centered', tilt=70)
        self.assertTrue(all(entry['offset'] == 0 and entry['tilt'] == 70
                            for entry in centered))
        alt = twist_patch_options(TWO_SQUARES, types, .2,
                                  variant='centered-angle', angle=35)
        expected = math.degrees(math.atan2(math.sin(math.radians(35)),
                                           .2*math.cos(math.radians(35))))
        self.assertTrue(all(abs(entry['tilt']-expected) < 1e-12 for entry in alt))
        self.assertEqual(types, [['M']*4, ['V', 'M', 'M', 'V']])

    def test_invalid_ranges_lattice_and_assignments_are_rejected(self):
        for range1, range2 in (([1, 0], [0, 1]), ([0, 1.5], [0, 1]),
                               ([-65, 0], [0, 1]), ([-8, 8], [-8, 8])):
            with self.subTest(ranges=(range1, range2)), self.assertRaises(ValueError):
                make_lattice_tiling(SQUARE, [[1, 0], [0, 1]], range1, range2)
        for lattice in ([[1, 0], [2, 0]], [[0, 0], [0, 1]],
                        [[1, 0], [0, float('nan')]]):
            with self.subTest(lattice=lattice), self.assertRaises(ValueError):
                make_lattice_tiling(SQUARE, lattice, [0, 1], [0, 1])
        for types in ([['M']*4], [['M']*4, ['V']*3], [['M']*4, ['X']*4]):
            with self.subTest(types=types), self.assertRaises(ValueError):
                patch_check_types(TWO_SQUARES, types)
        for parity in ([1], [0, 1], [True, -1]):
            with self.subTest(parity=parity), self.assertRaises(ValueError):
                patch_check_parity(TWO_SQUARES, parity)
        with self.assertRaises(ValueError):
            twist_patch_options(TWO_SQUARES, [['M']*4, ['V']*4], .2,
                                offset=.1, parity=[1])


if __name__ == '__main__':
    unittest.main()
