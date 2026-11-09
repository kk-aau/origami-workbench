"""Source-formula checks for section-37 TwoColorableArchimedeanPatch[1/2/8/9]."""
import itertools
import math
import unittest
from collections import Counter

from tessellation_archimedean_patch_catalog import (
    archimedean_patch, two_colorable_archimedean_lattice_mesh,
    two_colorable_archimedean_patch, two_colorable_archimedean_patch_catalog,
)
from tessellation_flat_embedding import flat_face_embedding
from tessellation_lattice_patch import patch_vectors, twist_patch_options
from tessellate import check_geometry, generate, validate_request
from tessellation_prune import prune_mesh


PARITY = {1: [1, -1], 2: [1, -1],
          8: [1, -1, 1, -1, 1, -1], 9: [1, -1, 1]}
COUNTS = {1: (9, 16, 8), 2: (16, 23, 8),
          8: (37, 60, 24), 9: (21, 32, 12)}


def request_for(patch, *, lattice=None, range1=None, range2=None,
                twists=None):
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
    request = {'family': 'custom', 'vertices': vertices, 'faces': faces,
               'repeatX': 1, 'repeatY': 1,
               'customOutput': 'tile-twists' if twists else 'tiling',
               'angle': 36, 'scale': .3}
    if lattice is not None:
        request.update(lattice=lattice, range1=range1, range2=range2)
    if twists is not None:
        request.update(tileTwists=twists, monolithicOptions={
            'mergedEdges': 'delete', 'samePtTolerance': 1e-8,
            'collinearCleanup': True, 'collinearTolerance': 1e-8})
    return request


class TwoColorableArchimedeanCatalogTests(unittest.TestCase):
    def assert_points_equal(self, actual, expected):
        self.assertEqual(len(actual), len(expected))
        for a, b in zip(actual, expected):
            self.assertLess(math.dist(a, b), 1e-12)

    def test_four_saved_two_colorable_definitions_and_two_by_two_samples(self):
        catalog = two_colorable_archimedean_patch_catalog()
        self.assertEqual(sorted(catalog), [1, 2, 8, 9])
        self.assertEqual([catalog[n]['notebookIn'] for n in (1, 2, 8, 9)],
                         [(3156, 3159), (3160, 3163),
                          (3164, 3167), (3168, 3171)])
        for number in catalog:
            with self.subTest(number=number):
                source = two_colorable_archimedean_patch(number)
                self.assertEqual(source['variant'], 'two-colorable')
                self.assertEqual(source['parity'], PARITY[number])
                self.assertEqual(len(source['parity']), len(source['sourceTiles']))
                self.assertEqual(catalog[number]['sampleRanges'], ((0, 1), (0, 1)))
                mesh = two_colorable_archimedean_lattice_mesh(number, [0, 1], [0, 1])
                self.assertEqual((len(mesh['vertices_coords']),
                                  len(mesh['edges_vertices']),
                                  len(mesh['faces_vertices'])), COUNTS[number])
                self.assertEqual(mesh['zhezhi_archimedean_parity'], PARITY[number])
                self.assertEqual(mesh['zhezhi_archimedean_variant'], 'two-colorable')
                self.assertEqual(mesh['zhezhi_custom_face_index'],
                                 list(range(len(source['sourceTiles'])))*4)
                self.assertEqual(mesh['zhezhi_lattice_cells'],
                                 [[j1, j2] for j2 in (0, 1) for j1 in (0, 1)
                                  for _ in source['sourceTiles']])
                self.assertEqual(check_geometry(mesh)['status'], 'passed')
                self.assertEqual(COUNTS[number][0]-COUNTS[number][1]
                                 +COUNTS[number][2], 1)

    def test_aliases_one_eight_nine_are_pointwise_and_periodically_identical(self):
        for number in (1, 8, 9):
            with self.subTest(number=number):
                ordinary = archimedean_patch(number)
                colored = two_colorable_archimedean_patch(number)
                self.assertEqual(two_colorable_archimedean_patch_catalog()[number]['aliasOf'],
                                 number)
                for a, b in zip(ordinary['sourceTiles'], colored['sourceTiles']):
                    self.assert_points_equal(a, b)
                self.assert_points_equal(ordinary['lattice'], colored['lattice'])

    def test_two_square_new_join_vectors_and_periodic_dispatch(self):
        colored = two_colorable_archimedean_patch(2)
        self.assertIsNone(two_colorable_archimedean_patch_catalog()[2]['aliasOf'])
        self.assertEqual(len(archimedean_patch(2)['sourceTiles']), 1)
        expected = [
            [[0, 0], [1, 0], [1, 1], [0, 1]],
            [[1, 0], [2, 0], [2, 1], [1, 1]],
        ]
        for actual, target in zip(colored['sourceTiles'], expected):
            self.assert_points_equal(actual, target)
        self.assert_points_equal(colored['lattice'], [[2, 0], [1, 1]])
        self.assert_points_equal(colored['lattice'],
            patch_vectors(expected, [1, 1], [2, 2], [1, 3]))
        result = generate(request_for(expected, lattice=colored['lattice'],
                                      range1=[0, 1], range2=[0, 1]))
        mesh = result['mother']
        self.assertEqual(result['stats']['tiles'], 8)
        self.assertEqual((len(mesh['vertices_coords']),len(mesh['edges_vertices']),
                          len(mesh['faces_vertices'])), (16, 23, 8))
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        for polygon, source_id, cell in zip(mesh['zhezhi_custom_polygons'],
                                             mesh['zhezhi_custom_face_index'],
                                             mesh['zhezhi_lattice_cells']):
            displacement = [cell[0]*colored['lattice'][0][axis]
                            +cell[1]*colored['lattice'][1][axis]
                            for axis in (0, 1)]
            for point, original in zip(polygon, expected[source_id]):
                self.assertLess(math.dist(point,
                    [original[axis]+displacement[axis] for axis in (0, 1)]), 1e-12)

    def test_in3184_signed_offsets_and_single_patch_cp(self):
        source = two_colorable_archimedean_patch(2)
        types = [['M']*4, ['M']*4]
        options = twist_patch_options(source['sourceTiles'], types, .2,
                                      variant='offset', offset=.1,
                                      parity=source['parity'])
        self.assertEqual([item['offset'] for item in options], [.1, -.1])
        self.assertEqual([item['tilt'] for item in options], [90, 90])
        self.assertEqual([item['centralTypes'] for item in options], types)
        result = generate(request_for(source['sourceTiles'], twists=options))
        self.assertEqual((result['stats']['vertices'], result['stats']['edges'],
                          result['stats']['faces']), (24, 38, 15))
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['layerOrder']['status'], 'not_checked')
        self.assertEqual(Counter(result['fold']['edges_assignment']),
                         {'B': 16, 'M': 15, 'V': 7})
        flat, closure = flat_face_embedding(result['fold'])
        self.assertLess(closure, 1e-8)
        for face in result['fold']['faces_vertices']:
            for a, b in itertools.combinations(face, 2):
                self.assertAlmostEqual(math.dist(result['fold']['vertices_coords'][a],
                                                 result['fold']['vertices_coords'][b]),
                                       math.dist(flat[a], flat[b]), places=7)

    def test_in3187_and_in3188_prune_forty_tiles_before_twisting(self):
        source = two_colorable_archimedean_patch(2)
        full = two_colorable_archimedean_lattice_mesh(2, [-2, 2], [0, 3])
        boundary = [[.1, .1], [3.9, .1], [3.9, 3.9], [.1, 3.9]]
        pruned = prune_mesh(full, boundary)
        self.assertEqual(len(full['faces_vertices']), 40)
        self.assertEqual((len(pruned['vertices_coords']),
                          len(pruned['edges_vertices']),
                          len(pruned['faces_vertices'])), (25, 40, 16))
        self.assertEqual(Counter(pruned['zhezhi_custom_face_index']), {0: 8, 1: 8})
        examples = (
            (3187, twist_patch_options(source['sourceTiles'],
                [['M']*4, ['V']*4], .2, variant='centered-angle', angle=30)),
            (3188, twist_patch_options(source['sourceTiles'],
                [['M']*4, ['M']*4], .2, variant='offset', offset=.1001,
                parity=source['parity'])),
        )
        for notebook_in, twists in examples:
            with self.subTest(notebook_in=notebook_in):
                request = request_for(source['sourceTiles'],
                    lattice=source['lattice'], range1=[-2, 2], range2=[0, 3],
                    twists=twists)
                with self.assertRaisesRegex(ValueError, '36'):
                    validate_request(request)
                request['pruneBoundary'] = boundary
                self.assertEqual(validate_request(request)['pruneBoundary'], boundary)
                result = generate(request)
                self.assertEqual(result['stats']['tiles'], 16)
                self.assertEqual((result['stats']['vertices'],
                                  result['stats']['edges'],
                                  result['stats']['faces']), (100, 180, 81))
                self.assertEqual(result['mother']['zhezhi_custom_face_index'],
                                 pruned['zhezhi_custom_face_index'])
                self.assertEqual(result['stats']['checks']['geometry']['status'],
                                 'passed')
                self.assertEqual(result['stats']['checks']['local']['status'],
                                 'passed')
                flat, closure = flat_face_embedding(result['fold'])
                self.assertEqual(len(flat), 100)
                self.assertLess(closure, 1e-8)
                request['pruneBoundary'] = [[-1, -1], [9, -1],
                                            [9, 9], [-1, 9]]
                with self.assertRaisesRegex(ValueError, '36'):
                    generate(request)

    def test_undefined_two_colorable_numbers_are_rejected(self):
        for number in (0, 3, 7, 10, 13, True, 2.0, '2', None):
            for builder in (two_colorable_archimedean_patch,
                            lambda value: two_colorable_archimedean_lattice_mesh(
                                value, [0, 1], [0, 1])):
                with self.subTest(number=number, builder=builder), self.assertRaises(ValueError):
                    builder(number)


if __name__ == '__main__':
    unittest.main()
