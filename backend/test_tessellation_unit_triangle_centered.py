import itertools
import math
import unittest

from tessellation_flat_embedding import flat_face_embedding
from tessellation_unit_triangle_centered import (
    ALT_TYPE, CENTERED_TYPE, original_triangle_centered_pair,
    unit_triangle_centered_twist_alt_tile, unit_triangle_centered_twist_tile,
    unit_triangle_vertices,
)
from tessellate import check_geometry, check_local_conditions


def edge_assignment(fold, a, b):
    coords = fold['vertices_coords']
    indices = [min(range(len(coords)), key=lambda index: math.dist(point, coords[index]))
               for point in (a, b)]
    for edge, kind in zip(fold['edges_vertices'], fold['edges_assignment']):
        if set(edge) == set(indices):
            return kind
    raise AssertionError(f'central edge missing: {a}, {b}')


class UnitTriangleCenteredTests(unittest.TestCase):
    def test_original_unit_triangle_angle_convention_and_input_boundary(self):
        # In[366]: only A and B enter the sine-rule coordinate formula.
        vertices = unit_triangle_vertices([50, 60, 70])
        self.assertEqual(vertices[:2], [[0., 0.], [1., 0.]])
        self.assertAlmostEqual(vertices[2][0], .5923962654520477)
        self.assertAlmostEqual(vertices[2][1], .7059903775918711)
        self.assertEqual(vertices, unit_triangle_vertices([50, 60]))
        edges = [math.dist(a, b) for a, b in zip(vertices, vertices[1:]+vertices[:1])]
        self.assertAlmostEqual(edges[0], 1)
        self.assertAlmostEqual(edges[1]/math.sin(math.radians(50)),
                               edges[0]/math.sin(math.radians(70)))
        self.assertAlmostEqual(edges[2]/math.sin(math.radians(60)),
                               edges[0]/math.sin(math.radians(70)))
        for invalid in ([50, 60, 69], [50, 60, 70, 0], [0, 60, 120],
                        [100, 80], [50, math.nan, 70], [True, 60, 70], '50,60,70'):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                unit_triangle_vertices(invalid)

    def test_saved_centered_and_alt_angles_preserve_per_edge_mv_and_cp(self):
        cases = ((unit_triangle_centered_twist_tile, 80, CENTERED_TYPE),
                 (unit_triangle_centered_twist_alt_tile, 25, ALT_TYPE))
        central_polygons = []
        for build, angle, tile_type in cases:
            with self.subTest(tile_type=tile_type):
                types = ['M', 'V', 'M']
                fold, mother, info = build([50, 60, 70], .1, angle, types)
                self.assertEqual(info['tileType'], tile_type)
                self.assertEqual(info['centralTypes'], types)
                self.assertEqual(info['resolvedAngles'], [50, 60, 70])
                self.assertEqual(len(mother['faces_vertices']), 1)
                self.assertEqual(check_geometry(fold)['status'], 'passed')
                self.assertEqual(check_local_conditions(fold)['status'], 'passed')
                self.assertEqual(info['layerOrder'], 'not_checked')
                self.assertFalse(info['adoptable'])
                outer, center = info['vertices'], info['centralVertices']
                central_polygons.append(center)
                for index, (a, b) in enumerate(zip(outer, outer[1:]+outer[:1])):
                    self.assertEqual(edge_assignment(fold, center[index],
                                                     center[(index+1)%3]), types[index])
                    direction = [b[axis]-a[axis] for axis in (0, 1)]
                    for fraction, target in ((.45, center[index]),
                                             (.55, center[(index+1)%3])):
                        endpoint = [a[axis]+fraction*direction[axis] for axis in (0, 1)]
                        self.assertLess(min(math.dist(endpoint, point)
                                            for point in fold['vertices_coords']), 1e-9)
                        ray = [target[axis]-endpoint[axis] for axis in (0, 1)]
                        measured = math.degrees(math.atan2(
                            direction[0]*ray[1]-direction[1]*ray[0],
                            direction[0]*ray[0]+direction[1]*ray[1]))
                        self.assertAlmostEqual(measured, info['pleatAngle'], places=7)
                if tile_type == ALT_TYPE:
                    self.assertEqual(info['twistAngle'], 25)
                    tau, alpha = map(math.radians, (info['pleatAngle'], 25))
                    self.assertAlmostEqual(math.sin(alpha)*math.cos(tau) -
                                           .1*math.cos(alpha)*math.sin(tau), 0, places=12)
                else:
                    self.assertEqual(info['pleatAngle'], 80)
        self.assertGreater(math.dist(central_polygons[0][0], central_polygons[1][0]), 1e-3)
        for invalid in (([50, 60, 69], .1, 80, ['M']*3),
                        ([50, 60, 70], .9, 80, ['M']*3),
                        ([50, 60, 70], .1, math.nan, ['M']*3),
                        ([50, 60, 70], .1, 80, ['M', 'V'])):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                unit_triangle_centered_twist_tile(*invalid)
        with self.assertRaises(ValueError):
            unit_triangle_centered_twist_alt_tile([50, 60, 70], .1, 120, ['M']*3)

    def test_saved_two_tile_cp_and_ff_with_distinct_center_assignments(self):
        for alternate, tile_type, angle in ((False, CENTERED_TYPE, 80),
                                            (True, ALT_TYPE, 25)):
            with self.subTest(tile_type=tile_type):
                result = original_triangle_centered_pair(alternate)
                fold = result['fold']
                self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']),
                                  len(fold['faces_vertices'])), (18, 28, 11))
                self.assertEqual(fold['zhezhi_merged_edge_mode'], 'delete')
                self.assertNotIn('U', fold['edges_assignment'])
                self.assertEqual([tile['sourceIndex'] for tile in result['sourceTiles']], [0, 1])
                self.assertEqual([tile['tileType'] for tile in result['sourceTiles']], [tile_type]*2)
                self.assertEqual([tile['centralTypes'] for tile in result['sourceTiles']],
                                 [['M']*3, ['V']*3])
                self.assertLess(math.dist(result['sourceTiles'][0]['vertices'][1],
                                          result['sourceTiles'][1]['vertices'][2]), 1e-12)
                self.assertLess(math.dist(result['sourceTiles'][0]['vertices'][2],
                                          result['sourceTiles'][1]['vertices'][1]), 1e-12)
                for source in result['sourceTiles']:
                    self.assertEqual(source['width'], .1)
                    self.assertEqual(source['angles'], [50., 60., 70.])
                    if alternate:
                        self.assertEqual(source['twistAngle'], angle)
                    else:
                        self.assertEqual(source['pleatAngle'], angle)
                # Both central loops retain their independent source M/V after merging.
                for source, assignment in zip(result['sourceTiles'], ('M', 'V')):
                    _, _, local = (unit_triangle_centered_twist_alt_tile(
                        [50, 60, 70], .1, angle, [assignment]*3) if alternate else
                        unit_triangle_centered_twist_tile(
                        [50, 60, 70], .1, angle, [assignment]*3))
                    center = local['centralVertices']
                    if source['sourceIndex'] == 1:
                        first = result['sourceTiles'][0]['vertices']
                        center = [[first[1][axis]+first[2][axis]-point[axis]
                                   for axis in (0, 1)] for point in center]
                    self.assertEqual([edge_assignment(fold, a, b)
                                      for a, b in zip(center, center[1:]+center[:1])],
                                     [assignment]*3)
                self.assertEqual(result['checks']['geometry']['status'], 'passed')
                self.assertEqual(result['checks']['local']['status'], 'passed')
                self.assertLess(result['closureError'], 1e-8)
                self.assertEqual(result['checks']['layerOrder']['status'], 'not_checked')
                self.assertFalse(result['adoptable'])
                flat, _ = flat_face_embedding(fold)
                self.assertEqual(flat, result['foldedForm'])
                for face in fold['faces_vertices']:
                    for a, b in itertools.combinations(face, 2):
                        self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],
                                                         fold['vertices_coords'][b]),
                                               math.dist(flat[a], flat[b]), places=7)


if __name__ == '__main__':
    unittest.main()
