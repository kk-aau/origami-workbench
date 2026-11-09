"""All explicit section-37 ArchimedeanPatch definitions share one join factory."""
import math
import unittest

from tessellation_archimedean_patch_catalog import (
    archimedean_lattice_mesh, archimedean_patch, archimedean_patch_catalog,
)
from tessellation_lattice_patch import patch_vector
from tessellate import check_geometry, generate
from test_tessellation_archimedean_patch6_lattice import source_patch6
from test_tessellation_archimedean_patch8_lattice import source_patch8


H = math.sqrt(3)/2
S2 = math.sqrt(2)
EXPECTED = {
    # n: (source face sides, u, v, 2x2 vertices/edges/faces)
    1: ((3, 3), (1, 0), (.5, H), (9, 16, 8)),
    2: ((4,), (1, 0), (0, 1), (9, 12, 4)),
    3: ((6,), (1.5, H), (0, 2*H), (16, 19, 4)),
    4: ((3,)*8+(6,), (2.5, H), (.5, 3*H), (36, 71, 36)),
    5: ((3,)*8+(6,), (2.5, -H), (-.5, 3*H), (36, 71, 36)),
    6: ((3, 3, 4), (1, 0), (.5, 1+H), (15, 26, 12)),
    7: ((3, 4, 3, 3, 4, 3), (1+H, .5), (-.5, 1+H), (25, 48, 24)),
    8: ((4, 3, 4, 3, 4, 6), (1+2*H, 0), (.5+H, 1.5+H), (37, 60, 24)),
    9: ((3, 6, 3), (2, 0), (1, 2*H), (21, 32, 12)),
    10: ((3, 12, 3), (2+2*H, 0), (1+H, 1.5+2*H), (40, 51, 12)),
    11: ((4, 6, 4, 6, 4, 12), (1.5+3*H, 1.5+H),
         (0, 3+2*H), (70, 93, 24)),
    12: ((4, 8), (2+S2, 0), (1+S2/2, 1+S2/2), (29, 36, 8)),
}


def request_for(patch, lattice):
    vertices, lookup, faces = [], {}, []
    for polygon in patch:
        face = []
        for point in polygon:
            key = tuple(round(value, 10) for value in point)
            if key not in lookup:
                lookup[key] = len(vertices)
                vertices.append(point)
            face.append(lookup[key])
        faces.append(face)
    return {'family': 'custom', 'vertices': vertices, 'faces': faces,
            'repeatX': 1, 'repeatY': 1, 'lattice': lattice,
            'range1': [0, 1], 'range2': [0, 1], 'customOutput': 'tiling',
            'angle': 36, 'scale': .3}


class ArchimedeanPatchCatalogTests(unittest.TestCase):
    def assert_points_equal(self, actual, expected):
        self.assertEqual(len(actual), len(expected))
        for a, b in zip(actual, expected):
            self.assertLess(math.dist(a, b), 1e-12)

    def test_all_twelve_explicit_definitions_and_saved_two_by_two_examples(self):
        catalog = archimedean_patch_catalog()
        self.assertEqual(sorted(catalog), list(range(1, 13)))
        for number, (sides, u, v, counts) in EXPECTED.items():
            with self.subTest(number=number):
                record = catalog[number]
                self.assertEqual([s for s, _ in record['tileSpecs']], list(sides))
                self.assertEqual(record['notebookIn'][:2],
                                 (3104+4*(number-1), 3105+4*(number-1)))
                self.assertEqual(record['sampleRanges'], ((0, 1), (0, 1)))
                source = archimedean_patch(number)
                self.assertEqual([len(tile) for tile in source['sourceTiles']],
                                 list(sides))
                self.assert_points_equal(source['lattice'], [u, v])
                mesh = archimedean_lattice_mesh(number, [0, 1], [0, 1])
                self.assertEqual((len(mesh['vertices_coords']),
                                  len(mesh['edges_vertices']),
                                  len(mesh['faces_vertices'])), counts)
                self.assertEqual(mesh['zhezhi_custom_face_index'],
                                 list(range(len(sides)))*4)
                self.assertEqual(mesh['zhezhi_lattice_cells'],
                                 [[j1, j2] for j2 in (0, 1) for j1 in (0, 1)
                                  for _ in sides])
                self.assertEqual(check_geometry(mesh)['status'], 'passed')
                self.assertEqual(counts[0]-counts[1]+counts[2], 1)

    def test_patch_six_and_eight_agree_pointwise_with_independent_saved_joins(self):
        for number, independent in ((6, source_patch6()), (8, source_patch8())):
            with self.subTest(number=number):
                actual = archimedean_patch(number)
                for source, target in zip(actual['sourceTiles'], independent):
                    self.assert_points_equal(source, target)
                if number == 6:
                    refs = [([1, 1], [1, 2]), ([1, 1], [3, 4])]
                else:
                    refs = [([1, 4], [6, 4]), ([4, 1], [6, 4])]
                self.assert_points_equal(actual['lattice'],
                    [patch_vector(independent, a, b) for a, b in refs])

    def test_new_patch_nine_independent_vertices_periods_and_dispatch(self):
        source = archimedean_patch(9)
        expected = [
            [[0, 0], [1, 0], [.5, H]],
            [[1, 0], [2, 0], [2.5, H], [2, 2*H], [1, 2*H], [.5, H]],
            [[2.5, H], [3, 2*H], [2, 2*H]],
        ]
        for actual, target in zip(source['sourceTiles'], expected):
            self.assert_points_equal(actual, target)
        self.assert_points_equal(source['lattice'], [[2, 0], [1, 2*H]])
        self.assertEqual(source['vertexType'], [3, 6, 3, 6])
        result = generate(request_for(source['sourceTiles'], source['lattice']))
        mesh = result['mother']
        self.assertEqual(result['stats']['tiles'], 12)
        self.assertEqual((len(mesh['vertices_coords']),len(mesh['edges_vertices']),
                          len(mesh['faces_vertices'])), (21, 32, 12))
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        for polygon, source_id, cell in zip(mesh['zhezhi_custom_polygons'],
                                             mesh['zhezhi_custom_face_index'],
                                             mesh['zhezhi_lattice_cells']):
            displacement = [cell[0]*source['lattice'][0][axis]
                            +cell[1]*source['lattice'][1][axis]
                            for axis in (0, 1)]
            for point, original in zip(polygon, expected[source_id]):
                self.assertLess(math.dist(point,
                    [original[axis]+displacement[axis] for axis in (0, 1)]), 1e-12)

    def test_undefined_or_non_integer_entries_are_rejected(self):
        for number in (0, 13, -1, True, 6.0, '8', None):
            for builder in (archimedean_patch,
                            lambda value: archimedean_lattice_mesh(value, [0, 1], [0, 1])):
                with self.subTest(number=number, builder=builder), self.assertRaises(ValueError):
                    builder(number)


if __name__ == '__main__':
    unittest.main()
