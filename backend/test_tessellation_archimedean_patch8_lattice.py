"""Source-formula audit of Origamica ArchimedeanPatch[8], In[3132–3134]."""
import itertools
import math
import unittest
from collections import Counter, defaultdict

from tessellation_flat_embedding import flat_face_embedding
from tessellation_lattice_patch import (
    make_lattice_tiling, patch_check_parity, patch_check_types,
    patch_vector, twist_patch_options,
)
from tessellate import generate


H = math.sqrt(3) / 2
SOURCE_TYPES = [['M']*4, ['V']*3, ['M']*4, ['V']*3, ['M']*4, ['V']*6]
SOURCE_PARITY = [1, -1, 1, -1, 1, -1]
MONOLITHIC = {'mergedEdges': 'delete', 'samePtTolerance': 1e-8,
              'collinearCleanup': True, 'collinearTolerance': 1e-8}
JOINS = [(4, None), (3, (1, 1, 3)), (4, (2, 1, 1)),
         (3, (3, 2, 1)), (4, (4, 2, 1)), (6, (1, 2, 1))]


def unit_regular(n):
    """Notebook UnitRegularPolygonVertex: first point 0, first edge unit x."""
    vertices = [0j]
    for k in range(n - 1):
        vertices.append(vertices[-1] + complex(
            math.cos(2*math.pi*k/n), math.sin(2*math.pi*k/n)))
    return vertices


def join(new, old, old_vertex, new_vertex):
    """JoinTiling reverse-matches an old edge to an edge of the new tile."""
    old_start, old_end = old[old_vertex-1], old[old_vertex % len(old)]
    new_end = new[new_vertex-1]
    new_start = new[(new_vertex-2) % len(new)]
    rotation = (old_start-old_end)/(new_end-new_start)
    if abs(abs(rotation)-1) > 1e-12:
        raise AssertionError('joined source edges must have equal unit length')
    return [old_end+rotation*(point-new_start) for point in new]


def source_patch8():
    raw = []
    for sides, link in JOINS:
        polygon = unit_regular(sides)
        if link is not None:
            source, old_edge, new_edge = link
            polygon = join(polygon, raw[source-1], old_edge, new_edge)
        raw.append(polygon)
    return [[[point.real, point.imag] for point in polygon] for polygon in raw]


def lattice8(patch):
    """In[3133] uses two PatchVector calls with different start vertices."""
    return [patch_vector(patch, [1, 4], [6, 4]),
            patch_vector(patch, [4, 1], [6, 4])]


def custom_request(patch, *, lattice=None, range1=None, range2=None,
                   output='tiling', twists=None):
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
               'repeatX': 1, 'repeatY': 1, 'customOutput': output,
               'angle': 36, 'scale': .3}
    if lattice is not None:
        request.update(lattice=lattice, range1=range1, range2=range2)
    if twists is not None:
        request.update(tileTwists=twists, monolithicOptions=MONOLITHIC)
    return request


def polygon_area(polygon):
    return abs(sum(a[0]*b[1]-a[1]*b[0]
                   for a, b in zip(polygon, polygon[1:]+polygon[:1])))/2


class ArchimedeanPatch8LatticeTests(unittest.TestCase):
    def test_saved_joins_independent_coordinates_adjacency_and_periods(self):
        patch = source_patch8()
        self.assertEqual([len(tile) for tile in patch], [4, 3, 4, 3, 4, 6])
        expected = [
            [[0, 0], [1, 0], [1, 1], [0, 1]],
            [[.5, -H], [1, 0], [0, 0]],
            [[.5, -H], [.5+H, -H-.5], [1+H, -.5], [1, 0]],
            [[.5+H, -H-.5], [1.5+H, -H-.5], [1+H, -.5]],
            [[1.5+H, -H-.5], [1.5+2*H, -H], [1+2*H, 0],
             [1+H, -.5]],
            [[1, 0], [1+H, -.5], [1+2*H, 0], [1+2*H, 1],
             [1+H, 1.5], [1, 1]],
        ]
        for actual, source in zip(patch, expected):
            for point, target in zip(actual, source):
                self.assertLess(math.dist(point, target), 1e-12)
        edges = defaultdict(list)
        for tile, polygon in enumerate(patch, 1):
            for a, b in zip(polygon, polygon[1:]+polygon[:1]):
                key = tuple(sorted((tuple(round(value, 9) for value in a),
                                    tuple(round(value, 9) for value in b))))
                edges[key].append(tile)
        self.assertEqual(sorted(tuple(owners) for owners in edges.values()
                                if len(owners) == 2),
                         [(1, 2), (1, 6), (2, 3), (3, 4), (3, 6), (4, 5), (5, 6)])
        self.assertEqual(sum(len(owners) == 1 for owners in edges.values()), 10)
        lattice = lattice8(patch)
        for actual, target in zip(lattice,
                                  ([1+2*H, 0], [.5+H, 1.5+H])):
            self.assertLess(math.dist(actual, target), 1e-12)
        area = sum(map(polygon_area, patch))
        determinant = lattice[0][0]*lattice[1][1]-lattice[0][1]*lattice[1][0]
        self.assertAlmostEqual(area, 3+4*H)
        self.assertAlmostEqual(determinant, area)

    def test_saved_two_by_two_tiling_preserves_source_order_and_coordinates(self):
        patch = source_patch8()
        lattice = lattice8(patch)
        instances = make_lattice_tiling(patch, lattice, [0, 1], [0, 1])
        expected = [([j1, j2], source) for j2 in (0, 1) for j1 in (0, 1)
                    for source in range(6)]
        self.assertEqual([(item['cell'], item['sourceFace']) for item in instances],
                         expected)
        result = generate(custom_request(patch, lattice=lattice,
                                         range1=[0, 1], range2=[0, 1]))
        mother = result['mother']
        self.assertEqual(result['stats']['tiles'], 24)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual((len(mother['vertices_coords']), len(mother['edges_vertices']),
                          len(mother['faces_vertices'])), (37, 60, 24))
        self.assertEqual(mother['zhezhi_lattice_cells'], [cell for cell, _ in expected])
        self.assertEqual(mother['zhezhi_custom_face_index'],
                         [source for _, source in expected])
        self.assertEqual([len(face) for face in mother['faces_vertices']],
                         [4, 3, 4, 3, 4, 6]*4)
        for actual, instance in zip(mother['zhezhi_custom_polygons'], instances):
            for point, target in zip(actual, instance['polygon']):
                self.assertLess(math.dist(point, target), 1e-12)
        self.assertEqual(len(mother['vertices_coords'])-len(mother['edges_vertices'])
                         +len(mother['faces_vertices']), 1)

    def test_saved_negative_index_extent_for_outline_only(self):
        patch = source_patch8()
        lattice = lattice8(patch)
        result = generate(custom_request(patch, lattice=lattice,
                                         range1=[-2, 2], range2=[-1, 2]))
        mother = result['mother']
        expected = [([j1, j2], source) for j2 in (-1, 0, 1, 2)
                    for j1 in (-2, -1, 0, 1, 2) for source in range(6)]
        self.assertEqual(result['stats']['tiles'], 120)
        self.assertEqual((len(mother['vertices_coords']), len(mother['edges_vertices']),
                          len(mother['faces_vertices'])), (150, 269, 120))
        self.assertEqual(list(zip(mother['zhezhi_lattice_cells'],
                                  mother['zhezhi_custom_face_index'])), expected)
        self.assertEqual(Counter(mother['zhezhi_custom_face_index']),
                         {source: 20 for source in range(6)})
        for polygon, (cell, source) in zip(mother['zhezhi_custom_polygons'], expected):
            translation = [cell[0]*lattice[0][axis]+cell[1]*lattice[1][axis]
                           for axis in (0, 1)]
            for point, original in zip(polygon, patch[source]):
                self.assertLess(math.dist(point,
                    [original[axis]+translation[axis] for axis in (0, 1)]), 1e-12)
        first = mother['zhezhi_custom_polygons'][0][0]
        self.assertLess(math.dist(first,
            [-2*lattice[0][0]-lattice[1][0], -2*lattice[0][1]-lattice[1][1]]), 1e-12)
        self.assertEqual(len(mother['vertices_coords'])-len(mother['edges_vertices'])
                         +len(mother['faces_vertices']), 1)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')

    def test_saved_types_parity_and_bounded_twist_cp(self):
        patch = source_patch8()
        self.assertEqual(patch_check_types(patch, SOURCE_TYPES), SOURCE_TYPES)
        self.assertEqual(patch_check_parity(patch, SOURCE_PARITY), SOURCE_PARITY)
        with self.assertRaises(ValueError):
            patch_check_types(patch, SOURCE_TYPES[:-1])
        with self.assertRaises(ValueError):
            patch_check_parity(patch, SOURCE_PARITY[:-1])
        options = twist_patch_options(patch, SOURCE_TYPES, .12,
                                      variant='centered-angle', angle=29)
        expected_tilt = math.degrees(math.atan(math.tan(math.radians(29))/.12))
        for option, types in zip(options, SOURCE_TYPES):
            self.assertEqual(option['centralTypes'], types)
            self.assertAlmostEqual(option['tilt'], expected_tilt)
            self.assertEqual(option['offset'], 0)
        result = generate(custom_request(patch, output='tile-twists', twists=options))
        self.assertEqual(result['stats']['tiles'], 6)
        self.assertEqual((result['stats']['vertices'], result['stats']['edges'],
                          result['stats']['faces']), (54, 88, 35))
        self.assertEqual(result['mother']['zhezhi_custom_face_index'], list(range(6)))
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['layerOrder']['status'], 'not_checked')
        folded, closure = flat_face_embedding(result['fold'])
        self.assertLess(closure, 1e-8)
        for face in result['fold']['faces_vertices']:
            for a, b in itertools.combinations(face, 2):
                self.assertAlmostEqual(math.dist(result['fold']['vertices_coords'][a],
                                                 result['fold']['vertices_coords'][b]),
                                       math.dist(folded[a], folded[b]), places=7)
        # In[3186] expands 120 twist tiles before clipping; this adapter's
        # bounded monolithic CP intentionally refuses that full expansion.
        with self.assertRaisesRegex(ValueError, '36'):
            generate(custom_request(patch, lattice=lattice8(patch),
                                    range1=[-2, 2], range2=[-1, 2],
                                    output='tile-twists', twists=options))


if __name__ == '__main__':
    unittest.main()
