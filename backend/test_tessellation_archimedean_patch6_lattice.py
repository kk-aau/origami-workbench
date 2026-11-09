"""Source-formula audit for Origamica ArchimedeanPatch[6], In[3124–3126]."""
import itertools
import math
import unittest
from collections import Counter

from tessellation_flat_embedding import flat_face_embedding
from tessellation_lattice_patch import (
    make_lattice_tiling, patch_check_parity, patch_check_types,
    patch_vectors, twist_patch_options,
)
from tessellate import generate


H = math.sqrt(3) / 2
SOURCE_TYPES = [['M'] * 3, ['V'] * 3, ['M'] * 4]


def unit_regular(n):
    """UnitRegularPolygonVertex In[433]: first vertex 0, first edge 0→1."""
    vertices = [0j]
    for k in range(n - 1):
        vertices.append(vertices[-1] + complex(
            math.cos(2 * math.pi * k / n),
            math.sin(2 * math.pi * k / n)))
    return vertices


def join(new, old, old_vertex, new_vertex):
    """Reverse-match old edge starting at j to new edge ending at k."""
    old_start = old[old_vertex - 1]
    old_end = old[old_vertex % len(old)]
    new_end_index = new_vertex - 1
    new_start = new[(new_end_index - 1) % len(new)]
    new_end = new[new_end_index]
    rotation = (old_start - old_end) / (new_end - new_start)
    if abs(abs(rotation) - 1) > 1e-12:
        raise AssertionError('source edge join must be rigid')
    return [old_end + rotation * (vertex - new_start) for vertex in new]


def source_patch6():
    first = unit_regular(3)
    second = join(unit_regular(3), first, 2, 1)
    third = join(unit_regular(4), second, 2, 2)
    return [[[point.real, point.imag] for point in tile]
            for tile in (first, second, third)]


def custom_request(patch, lattice=None, range1=None, range2=None,
                   output='tiling', twists=None):
    points = []
    lookup = {}
    faces = []
    for polygon in patch:
        face = []
        for point in polygon:
            key = tuple(round(value, 10) for value in point)
            if key not in lookup:
                lookup[key] = len(points)
                points.append(point)
            face.append(lookup[key])
        faces.append(face)
    request = {'family': 'custom', 'vertices': points, 'faces': faces,
               'repeatX': 1, 'repeatY': 1, 'customOutput': output,
               'angle': 36, 'scale': .3}
    if lattice is not None:
        request.update(lattice=lattice, range1=range1, range2=range2)
    if twists is not None:
        request['tileTwists'] = twists
    return request


class ArchimedeanPatch6LatticeTests(unittest.TestCase):
    def test_original_join_indices_and_patch_vector_formula(self):
        patch = source_patch6()
        expected = (
            [[0., 0.], [1., 0.], [.5, H]],
            [[1., 0.], [1.5, H], [.5, H]],
            [[.5, H], [1.5, H], [1.5, 1+H], [.5, 1+H]],
        )
        for actual, target in zip(patch, expected):
            for vertex, point in zip(actual, target):
                self.assertLess(math.dist(vertex, point), 1e-12)
        lattice = patch_vectors(patch, [1, 1], [1, 2], [3, 4])
        for actual, target in zip(lattice, ([1., 0.], [.5, 1+H])):
            self.assertLess(math.dist(actual, target), 1e-12)
        self.assertEqual([len(polygon) for polygon in patch], [3, 3, 4])
        self.assertAlmostEqual(lattice[0][0] * lattice[1][1]
                               - lattice[0][1] * lattice[1][0], 1 + H)
        polygon_area = lambda vertices: abs(sum(
            x0*y1 - x1*y0 for (x0, y0), (x1, y1) in
            zip(vertices, vertices[1:] + vertices[:1]))) / 2
        self.assertAlmostEqual(sum(map(polygon_area, patch)), 1 + H)

    def test_saved_two_by_two_lattice_through_generic_generation(self):
        patch = source_patch6()
        lattice = patch_vectors(patch, [1, 1], [1, 2], [3, 4])
        instances = make_lattice_tiling(patch, lattice, [0, 1], [0, 1])
        expected = [([j1, j2], source) for j2 in (0, 1) for j1 in (0, 1)
                    for source in range(3)]
        self.assertEqual([(item['cell'], item['sourceFace']) for item in instances],
                         expected)
        self.assertEqual(len(instances), 12)
        for item in instances:
            j1, j2 = item['cell']
            displacement = [j1*lattice[0][axis] + j2*lattice[1][axis]
                            for axis in (0, 1)]
            for point, source in zip(item['polygon'], patch[item['sourceFace']]):
                self.assertLess(math.dist(point,
                    [source[axis]+displacement[axis] for axis in (0, 1)]), 1e-12)
        result = generate(custom_request(patch, lattice, [0, 1], [0, 1]))
        mesh = result['mother']
        self.assertEqual(result['stats']['tiles'], 12)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual((len(mesh['vertices_coords']), len(mesh['edges_vertices']),
                          len(mesh['faces_vertices'])), (15, 26, 12))
        self.assertEqual(mesh['zhezhi_lattice_cells'], [cell for cell, _ in expected])
        self.assertEqual(mesh['zhezhi_custom_face_index'],
                         [source for _, source in expected])
        self.assertEqual([len(face) for face in mesh['faces_vertices']], [3, 3, 4]*4)
        self.assertEqual(Counter(mesh['zhezhi_custom_face_index']), {0: 4, 1: 4, 2: 4})
        self.assertEqual(len(mesh['vertices_coords']) - len(mesh['edges_vertices'])
                         + len(mesh['faces_vertices']), 1)
        for points, item in zip(mesh['zhezhi_custom_polygons'], instances):
            for point, expected_point in zip(points, item['polygon']):
                self.assertLess(math.dist(point, expected_point), 1e-12)

    def test_negative_cells_keep_same_formula_and_source_order(self):
        patch = source_patch6()
        lattice = patch_vectors(patch, [1, 1], [1, 2], [3, 4])
        result = generate(custom_request(patch, lattice, [-1, 0], [-1, 1]))
        mesh = result['mother']
        expected = [([j1, j2], source) for j2 in (-1, 0, 1)
                    for j1 in (-1, 0) for source in range(3)]
        self.assertEqual(result['stats']['tiles'], 18)
        self.assertEqual((len(mesh['vertices_coords']), len(mesh['edges_vertices']),
                          len(mesh['faces_vertices'])), (21, 38, 18))
        self.assertEqual(list(zip(mesh['zhezhi_lattice_cells'],
                                  mesh['zhezhi_custom_face_index'])), expected)
        self.assertEqual(Counter(mesh['zhezhi_custom_face_index']), {0: 6, 1: 6, 2: 6})
        first = mesh['zhezhi_custom_polygons'][0][0]
        self.assertLess(math.dist(first, [-1.5, -1-H]), 1e-12)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')

    def test_saved_alt_types_and_bounded_parity_contract(self):
        patch = source_patch6()
        self.assertEqual(patch_check_types(patch, SOURCE_TYPES), SOURCE_TYPES)
        with self.assertRaises(ValueError):
            patch_check_types(patch, [SOURCE_TYPES[0], SOURCE_TYPES[1], ['M']*3])
        # The notebook's parity helper checks only length; this backend
        # intentionally restricts the offset adapter to signed directions.
        self.assertEqual(patch_check_parity(patch, [1, -1, 1]), [1, -1, 1])
        with self.assertRaises(ValueError):
            patch_check_parity(patch, [1, -1])
        options = twist_patch_options(patch, SOURCE_TYPES, .2,
                                      variant='centered-angle', angle=25)
        expected_tilt = math.degrees(math.atan(math.tan(math.radians(25))/.2))
        self.assertEqual([option['centralTypes'] for option in options], SOURCE_TYPES)
        for option in options:
            self.assertAlmostEqual(option['tilt'], expected_tilt)
            self.assertEqual(option['offset'], 0)
        result = generate(custom_request(patch, output='tile-twists', twists=options))
        self.assertEqual(result['stats']['tiles'], 3)
        self.assertEqual((result['stats']['vertices'], result['stats']['edges'],
                          result['stats']['faces']), (32, 48, 17))
        self.assertEqual(result['mother']['zhezhi_custom_face_index'], [0, 1, 2])
        self.assertTrue({0, 1, 2}.issubset(
            set(result['fold']['zhezhi_face_tile_source'])))
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['layerOrder']['status'],
                         'not_checked')
        folded, closure = flat_face_embedding(result['fold'])
        self.assertLess(closure, 1e-8)
        for face in result['fold']['faces_vertices']:
            for a, b in itertools.combinations(face, 2):
                self.assertAlmostEqual(math.dist(
                    result['fold']['vertices_coords'][a],
                    result['fold']['vertices_coords'][b]),
                    math.dist(folded[a], folded[b]), places=7)


if __name__ == '__main__':
    unittest.main()
