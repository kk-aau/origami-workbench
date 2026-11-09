import itertools
import math
import unittest

from tessellation_flat_embedding import flat_face_embedding
from tessellation_unit_quadrilateral_centered_split import (
    ALT_TYPE, CENTERED_TYPE, SAVED_ANGLES,
    original_quad_centered_split_pair,
    unit_quadrilateral_centered_split_twist_alt_tile,
    unit_quadrilateral_centered_split_twist_tile,
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


class UnitQuadrilateralCenteredSplitTests(unittest.TestCase):
    def test_named_conversion_and_saved_unit_shape(self):
        cases = ((unit_quadrilateral_centered_split_twist_tile, 80., CENTERED_TYPE),
                 (unit_quadrilateral_centered_split_twist_alt_tile, 30., ALT_TYPE))
        centers = []
        for build, angle, tile_type in cases:
            with self.subTest(tile_type=tile_type):
                kinds = ['M', 'V', 'M', 'V']
                fold, mother, info = build(SAVED_ANGLES, 1.2, 2, .1, angle, 2, 'M', kinds)
                self.assertEqual(info['tileType'], tile_type)
                self.assertEqual(info['angles'], SAVED_ANGLES)
                self.assertEqual(info['resolvedAngles'], SAVED_ANGLES)
                self.assertEqual(info['sideIndex'], 2)
                self.assertEqual(info['preservedVertex'], 2)
                self.assertEqual(info['connection'], 'M')
                self.assertEqual(info['centralTypes'], kinds)
                self.assertTrue(info['split'])
                self.assertEqual(info['layerOrder'], 'not_checked')
                self.assertFalse(info['adoptable'])
                self.assertEqual(check_geometry(fold)['status'], 'passed')
                self.assertEqual(check_local_conditions(fold)['status'], 'passed')
                self.assertEqual(len(mother['faces_vertices']), 1)
                p = info['vertices']
                self.assertEqual(p[:2], [[0., 0.], [1., 0.]])
                self.assertAlmostEqual(math.dist(p[1], p[2]), 1.2)
                self.assertAlmostEqual(p[2][1], p[3][1])
                self.assertAlmostEqual(p[2][0], .8954131087028104)
                self.assertAlmostEqual(p[3][0], .32031547782941905)
                centers.append(info['centralVertices'])
                # The split creates five central vertices; base ip=2 rolls
                # four source assignments before inserting the crossing fold.
                path = ((0, 1), (1, 2), (2, 4), (4, 3), (3, 0))
                expected = (kinds[1], kinds[2], 'M', kinds[3], kinds[0])
                self.assertEqual(
                    [edge_assignment(fold, info['centralVertices'][a],
                                     info['centralVertices'][b]) for a, b in path],
                    list(expected),
                )
                if tile_type == ALT_TYPE:
                    self.assertAlmostEqual(info['twistAngle'], 30.)
                    self.assertAlmostEqual(info['pleatAngle'], 80.17357018416773)
                    tau, alpha = map(math.radians, (info['pleatAngle'], 30.))
                    self.assertAlmostEqual(math.sin(alpha)*math.cos(tau)
                                           - .1*math.cos(alpha)*math.sin(tau), 0., places=12)
                else:
                    self.assertEqual(info['pleatAngle'], 80.)
        self.assertGreater(math.dist(centers[0][0], centers[1][0]), 1e-4)

    def test_invalid_named_inputs_rejected(self):
        cases = (([75, 85, 95, 104], 1.2, 2, .1, 80, 2, 'M', ['M']*4),
                 ([75, 85, 95, 105], 1.2, 2, .1, 80, 5, 'M', ['M']*4),
                 ([75, 85, 95, 105], 1.2, 2, .1, 80, 2, 'X', ['M']*4),
                 ([75, 85, 95, 105], 1.2, 2, .1, 80, 2, 'M', ['M']*3),
                 ([75, 85, 95, 105], 1.2, 2, .1, 90, 2, 'M', ['M']*4),
                 ([75, 85, 95, 105], 1.2, 2, .9, 80, 2, 'M', ['M']*4),
                 ([75, 85, 95, 105], 1.2, 2, '0.1', 80, 2, 'M', ['M']*4))
        for values in cases:
            with self.subTest(values=values), self.assertRaises(ValueError):
                unit_quadrilateral_centered_split_twist_tile(*values)
        with self.assertRaises(ValueError):
            unit_quadrilateral_centered_split_twist_alt_tile(
                SAVED_ANGLES, 1.2, 2, .1, 120, 2, 'M', ['M']*4)

    def test_saved_pairs_cp_local_and_per_face_isometry(self):
        for alternate, tile_type, angle in ((False, CENTERED_TYPE, 80.),
                                            (True, ALT_TYPE, 30.)):
            with self.subTest(tile_type=tile_type):
                result = original_quad_centered_split_pair(alternate)
                fold = result['fold']
                self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']),
                                  len(fold['faces_vertices'])), (26, 44, 19))
                self.assertEqual(fold['zhezhi_merged_edge_mode'], 'delete')
                self.assertEqual(result['checks']['geometry']['status'], 'passed')
                self.assertEqual(result['checks']['local']['status'], 'passed')
                self.assertLess(result['closureError'], 1e-8)
                self.assertEqual(result['checks']['layerOrder']['status'], 'not_checked')
                self.assertFalse(result['adoptable'])
                sources = result['sourceTiles']
                self.assertEqual([source['sourceIndex'] for source in sources], [0, 1])
                self.assertEqual([source['tileType'] for source in sources], [tile_type]*2)
                self.assertEqual([source['connection'] for source in sources], ['M', 'V'])
                self.assertEqual([source['centralTypes'] for source in sources],
                                 [['M']*4, ['V']*4])
                self.assertLess(math.dist(sources[0]['vertices'][1], sources[1]['vertices'][2]), 1e-12)
                self.assertLess(math.dist(sources[0]['vertices'][2], sources[1]['vertices'][1]), 1e-12)
                for source, assignment in zip(sources, ('M', 'V')):
                    self.assertEqual(source['angles'], SAVED_ANGLES)
                    self.assertEqual(source['side'], 1.2)
                    self.assertEqual(source['sideIndex'], 2)
                    self.assertEqual(source['preservedVertex'], 2)
                    self.assertAlmostEqual(source['pleatAngle'],
                                           80.17357018416773 if alternate else 80.)
                    if alternate:
                        self.assertEqual(source['twistAngle'], angle)
                    _, _, local = (unit_quadrilateral_centered_split_twist_alt_tile(
                        SAVED_ANGLES, 1.2, 2, .1, angle, 2, assignment, [assignment]*4)
                        if alternate else unit_quadrilateral_centered_split_twist_tile(
                            SAVED_ANGLES, 1.2, 2, .1, angle, 2, assignment, [assignment]*4))
                    center = local['centralVertices']
                    if source['sourceIndex'] == 1:
                        first = sources[0]['vertices']
                        center = [[first[1][axis]+first[2][axis]-point[axis]
                                   for axis in (0, 1)] for point in center]
                    for a, b in ((0, 1), (1, 2), (2, 4), (4, 3), (3, 0)):
                        self.assertEqual(edge_assignment(fold, center[a], center[b]),
                                         assignment)
                flat, closure = flat_face_embedding(fold)
                self.assertEqual(flat, result['foldedForm'])
                self.assertLess(closure, 1e-8)
                for face in fold['faces_vertices']:
                    for a, b in itertools.combinations(face, 2):
                        self.assertAlmostEqual(
                            math.dist(fold['vertices_coords'][a], fold['vertices_coords'][b]),
                            math.dist(flat[a], flat[b]), places=7)


if __name__ == '__main__':
    unittest.main()
