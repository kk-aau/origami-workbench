import itertools
import math
import unittest

from tessellation_flat_embedding import flat_face_embedding
from tessellation_unit_regular_offset import (
    TILE_TYPE, geometric_offset_twist_angle, original_regular_offset_pair,
    unit_regular_offset_twist_tile,
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


class UnitRegularOffsetTests(unittest.TestCase):
    def test_in3012_angle_order_conflicts_with_in3013_and_constructed_cp(self):
        # Source In[3012] (224441–224457): Mod[ArcTan[w/(2d),Cot[pi/n]],pi].
        # Source In[3013] (224482–224493): d=w Cot[pi/n] Cot[alpha]/2.
        sides, width, offset = 4, .2, .15
        cot = 1/math.tan(math.pi/sides)
        printed = math.degrees(math.atan2(cot, width/(2*offset)))
        geometric = geometric_offset_twist_angle(sides, width, offset)
        self.assertAlmostEqual(printed, 56.30993247402022, places=10)
        self.assertAlmostEqual(geometric, 33.69006752597979, places=10)
        self.assertAlmostEqual(width*cot/(2*math.tan(math.radians(geometric))),
                               offset, places=12)
        self.assertAlmostEqual(geometric_offset_twist_angle(4, .2, -.15),
                               146.30993247402023, places=10)
        # The mismatch is not an n=4 complement coincidence.
        self.assertGreater(abs(math.degrees(math.atan2(
            1/math.tan(math.pi/5), width/(2*offset))) -
            geometric_offset_twist_angle(5, width, offset)), 20)

    def test_named_perpendicular_pleats_mv_and_center_similarity(self):
        for sides, offset in ((4, .15), (4, -.15), (5, .15)):
            with self.subTest(sides=sides, offset=offset):
                types = ['V']*sides
                fold, mother, info = unit_regular_offset_twist_tile(
                    sides, .2, offset, types)
                self.assertEqual(info['tileType'], TILE_TYPE)
                self.assertEqual(info['sides'], sides)
                self.assertEqual(info['width'], .2)
                self.assertEqual(info['offset'], offset)
                self.assertEqual(info['centralTypes'], types)
                self.assertEqual(info['pleatAngle'], 90.)
                self.assertEqual(info['twistDirection'], 'CCW' if offset > 0 else 'CW')
                self.assertEqual(info['layerOrder'], 'not_checked')
                self.assertFalse(info['adoptable'])
                self.assertEqual(len(mother['faces_vertices']), 1)
                self.assertEqual(check_geometry(fold)['status'], 'passed')
                self.assertEqual(check_local_conditions(fold)['status'], 'passed')
                self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']),
                                  len(fold['faces_vertices'])),
                                 (4*sides, 6*sides, 2*sides+1))
                outer, center = info['vertices'], info['centralVertices']
                self.assertEqual(outer[:2], [[0., 0.], [1., 0.]])
                for index, (a, b) in enumerate(zip(outer, outer[1:]+outer[:1])):
                    self.assertEqual(edge_assignment(fold, center[index],
                                                     center[(index+1)%sides]), 'V')
                    outer_edge = [b[axis]-a[axis] for axis in (0, 1)]
                    center_edge = [center[(index+1)%sides][axis]-center[index][axis]
                                   for axis in (0, 1)]
                    for fraction, target in (((1-.2)/2+offset, center[index]),
                                             ((1+.2)/2+offset, center[(index+1)%sides])):
                        endpoint = [a[axis]+fraction*outer_edge[axis]
                                    for axis in (0, 1)]
                        self.assertLess(min(math.dist(endpoint, point)
                                            for point in fold['vertices_coords']), 1e-9)
                        ray = [target[axis]-endpoint[axis] for axis in (0, 1)]
                        self.assertAlmostEqual(sum(outer_edge[k]*ray[k] for k in (0, 1)),
                                               0., places=10)
                    self.assertAlmostEqual(math.dist(center[index],
                                                     center[(index+1)%sides]) /
                                           math.dist(a, b), info['centerScale'], places=9)
                    rotation = math.degrees(math.atan2(
                        outer_edge[0]*center_edge[1]-outer_edge[1]*center_edge[0],
                        sum(outer_edge[k]*center_edge[k] for k in (0, 1))))
                    self.assertAlmostEqual(rotation, info['centerRotation'], places=9)

    def test_saved_in3019_pair_cp_and_isometric_ff(self):
        result = original_regular_offset_pair()
        fold = result['fold']
        first, second = result['sourceTiles']
        self.assertEqual([source['sourceIndex'] for source in (first, second)], [0, 1])
        self.assertEqual([source['tileType'] for source in (first, second)],
                         [TILE_TYPE]*2)
        self.assertEqual([source['sides'] for source in (first, second)], [4, 4])
        self.assertEqual([source['width'] for source in (first, second)], [.2, .2])
        self.assertEqual([source['offset'] for source in (first, second)], [.15, -.15])
        self.assertEqual([source['centralTypes'] for source in (first, second)],
                         [['V']*4, ['V']*4])
        self.assertEqual([source['twistDirection'] for source in (first, second)],
                         ['CCW', 'CW'])
        self.assertEqual(first['vertices'],
                         [[0., 0.], [1., 0.], [1., 1.], [0., 1.]])
        self.assertEqual(second['vertices'],
                         [[0., 1.], [1., 1.], [1., 2.], [0., 2.]])
        self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']),
                          len(fold['faces_vertices'])), (24, 38, 15))
        self.assertEqual(fold['zhezhi_merged_edge_mode'], 'delete')
        self.assertNotIn('U', fold['edges_assignment'])
        self.assertIn(0, fold['zhezhi_face_tile_instance'])
        self.assertIn(1, fold['zhezhi_face_tile_instance'])
        self.assertEqual(result['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['checks']['local']['status'], 'passed')
        self.assertEqual(result['checks']['layerOrder']['status'], 'not_checked')
        self.assertFalse(result['adoptable'])
        for source in (first, second):
            _, _, local = unit_regular_offset_twist_tile(
                4, .2, source['offset'], ['V']*4)
            center = [[point[0], point[1]+source['sourceIndex']]
                      for point in local['centralVertices']]
            self.assertEqual([edge_assignment(fold, a, b)
                              for a, b in zip(center, center[1:]+center[:1])], ['V']*4)
        flat, closure = flat_face_embedding(fold)
        self.assertEqual(flat, result['foldedForm'])
        self.assertAlmostEqual(closure, result['closureError'], places=14)
        self.assertLess(closure, 1e-8)
        for face in fold['faces_vertices']:
            for a, b in itertools.combinations(face, 2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],
                                                 fold['vertices_coords'][b]),
                                       math.dist(flat[a], flat[b]), places=9)

    def test_reject_invalid_named_parameters(self):
        for args in ((25, .2, .15, ['V']*25), (4, .9, .15, ['V']*4),
                     (4, .2, .41, ['V']*4), (4, .2, math.nan, ['V']*4),
                     (4, .2, .15, ['V']*3), (4, .2, .15, ['V', 'V', 'V', 'U'])):
            with self.subTest(args=args), self.assertRaises(ValueError):
                unit_regular_offset_twist_tile(*args)


if __name__ == '__main__':
    unittest.main()
