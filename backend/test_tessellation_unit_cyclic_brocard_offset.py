import itertools
import math
import unittest

from tessellation_flat_embedding import flat_face_embedding
from tessellation_unit_cyclic_brocard_offset import (
    SAVED_SHAPE, TILE_TYPE, original_cyclic_brocard_offset_pair,
    unit_cyclic_brocard_offset_tile,
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


class UnitCyclicBrocardOffsetTests(unittest.TestCase):
    def test_source_one_based_shape_and_brocard_direction_centers(self):
        # In[3047] (227393–227449): Sign[w]==Sign[d] chooses InfoCCW.
        # Source InfoCCW (24855–24872): |B-V1|=sin(alpha)/sin(theta1),
        # bearing theta1-alpha.  InfoCW (25271–25290) uses bearing pi-alpha.
        cases = ((.15, 'UnitCyclicBrocardPolygonInfoCCW',
                  [0.451860651593753, 0.7118918881720933], 52.40460830322612),
                 (-.15, 'UnitCyclicBrocardPolygonInfoCW',
                  [0.37219936101767664, 0.4833911425292254],
                  127.59539169677387))
        infos = []
        for offset, source_fn, expected_center, expected_angle in cases:
            with self.subTest(offset=offset):
                fold, mother, info = unit_cyclic_brocard_offset_tile(
                    SAVED_SHAPE, .2, offset, ['M']*5)
                infos.append(info)
                self.assertEqual(info['tileType'], TILE_TYPE)
                self.assertEqual(info['shape'], SAVED_SHAPE)
                self.assertEqual(info['sourceCornerIndices'], [1, 2])
                self.assertEqual(info['sourceInfoFunction'], source_fn)
                self.assertAlmostEqual(info['cornerAngles'][0], 110, places=9)
                self.assertAlmostEqual(info['cornerAngles'][1], 90, places=9)
                self.assertAlmostEqual(info['sourceBrocardAngle'], expected_angle, places=8)
                self.assertLess(math.dist(info['brocardCenter'], expected_center), 1e-9)
                self.assertEqual(info['pleatAngle'], 90.)
                self.assertEqual(info['layerOrder'], 'not_checked')
                self.assertFalse(info['adoptable'])
                self.assertEqual(len(mother['faces_vertices']), 1)
                self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']),
                                  len(fold['faces_vertices'])), (20, 30, 11))
                self.assertEqual(check_geometry(fold)['status'], 'passed')
                self.assertEqual(check_local_conditions(fold)['status'], 'passed')
                outer, inner = info['vertices'], info['centralVertices']
                self.assertLess(math.dist(outer[0], [0., 0.]), 1e-12)
                self.assertLess(math.dist(outer[1], [1., 0.]), 1e-12)
                for index, (a, b) in enumerate(zip(outer, outer[1:]+outer[:1])):
                    self.assertEqual(edge_assignment(fold, inner[index],
                                                     inner[(index+1)%5]), 'M')
                    edge = [b[axis]-a[axis] for axis in (0, 1)]
                    for fraction, target in (((1-.2)/2+offset, inner[index]),
                                             ((1+.2)/2+offset, inner[(index+1)%5])):
                        endpoint = [a[axis]+fraction*edge[axis] for axis in (0, 1)]
                        self.assertLess(min(math.dist(endpoint, point)
                                            for point in fold['vertices_coords']), 1e-8)
                        ray = [target[axis]-endpoint[axis] for axis in (0, 1)]
                        self.assertAlmostEqual(sum(edge[k]*ray[k] for k in (0, 1)),
                                               0., places=8)
                circle_center = info['circumcenter']
                self.assertLess(max(abs(math.dist(point, circle_center)-info['circumradius'])
                                    for point in outer), 1e-8)
                for index, point in enumerate(outer):
                    incoming = [outer[(index-1)%5][axis]-point[axis]
                                for axis in (0, 1)]
                    outgoing = [outer[(index+1)%5][axis]-point[axis]
                                for axis in (0, 1)]
                    def angle_between(a, b):
                        ratio = sum(a[k]*b[k] for k in (0, 1)) / (
                            math.hypot(*a)*math.hypot(*b))
                        return math.degrees(math.acos(max(-1., min(1., ratio))))
                    self.assertAlmostEqual(angle_between(incoming, outgoing),
                                           info['cornerAngles'][index], places=6)
                    brocard_ray = [info['brocardCenter'][axis]-point[axis]
                                   for axis in (0, 1)]
                    source_edge = incoming if offset > 0 else outgoing
                    source_acute = (info['sourceBrocardAngle'] if offset > 0
                                    else 180-info['sourceBrocardAngle'])
                    self.assertAlmostEqual(angle_between(source_edge, brocard_ray),
                                           source_acute, places=6)
                if offset > 0:
                    omega = math.radians(info['sourceBrocardAngle'])
                    radius = math.sin(omega)/math.sin(math.radians(110))
                    bearing = math.radians(110)-omega
                else:
                    alpha = math.radians(info['sourceBrocardAngle'])
                    omega = math.pi-alpha
                    radius = math.sin(math.radians(90)-omega)/math.sin(math.radians(90))
                    bearing = omega
                predicted = [radius*math.cos(bearing), radius*math.sin(bearing)]
                self.assertLess(math.dist(predicted, info['brocardCenter']), 1e-8)
        self.assertLess(max(math.dist(a, b) for a, b in zip(
            infos[0]['vertices'], infos[1]['vertices'])), 1e-10)
        self.assertGreater(math.dist(infos[0]['brocardCenter'],
                                     infos[1]['brocardCenter']), .2)

    def test_saved_in3048_joined_cp_and_isometric_ff(self):
        result = original_cyclic_brocard_offset_pair()
        fold = result['fold']
        first, second = result['sourceTiles']
        self.assertEqual([source['sourceIndex'] for source in (first, second)], [0, 1])
        self.assertEqual([source['tileType'] for source in (first, second)],
                         [TILE_TYPE]*2)
        self.assertEqual([source['shape'] for source in (first, second)],
                         [SAVED_SHAPE, SAVED_SHAPE])
        self.assertEqual([source['offset'] for source in (first, second)], [.15, -.15])
        self.assertEqual([source['centralTypes'] for source in (first, second)],
                         [['M']*5, ['M']*5])
        self.assertEqual([source['twistDirection'] for source in (first, second)],
                         ['CCW', 'CW'])
        self.assertLess(math.dist(first['vertices'][1], second['vertices'][2]), 1e-10)
        self.assertLess(math.dist(first['vertices'][2], second['vertices'][1]), 1e-10)
        self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']),
                          len(fold['faces_vertices'])), (34, 52, 19))
        self.assertEqual(fold['zhezhi_merged_edge_mode'], 'delete')
        self.assertNotIn('U', fold['edges_assignment'])
        self.assertEqual(result['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['checks']['local']['status'], 'passed')
        self.assertEqual(result['checks']['layerOrder']['status'], 'not_checked')
        self.assertFalse(result['adoptable'])
        for index, source in enumerate((first, second)):
            _, _, local = unit_cyclic_brocard_offset_tile(
                SAVED_SHAPE, .2, source['offset'], ['M']*5)
            center = local['centralVertices']
            if index == 1:
                center = [[first['vertices'][1][axis]+first['vertices'][2][axis]-point[axis]
                           for axis in (0, 1)] for point in center]
                predicted_brocard = [first['vertices'][1][axis]+first['vertices'][2][axis]-
                                     local['brocardCenter'][axis] for axis in (0, 1)]
                self.assertLess(math.dist(source['brocardCenter'], predicted_brocard), 1e-10)
            self.assertEqual([edge_assignment(fold, a, b)
                              for a, b in zip(center, center[1:]+center[:1])], ['M']*5)
            self.assertLess(max(abs(math.dist(point, source['circumcenter'])-
                                    source['circumradius'])
                                for point in source['vertices']), 1e-8)
        flat, closure = flat_face_embedding(fold)
        self.assertEqual(flat, result['foldedForm'])
        self.assertAlmostEqual(closure, result['closureError'], places=14)
        self.assertLess(closure, 1e-8)
        for face in fold['faces_vertices']:
            for a, b in itertools.combinations(face, 2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],
                                                 fold['vertices_coords'][b]),
                                       math.dist(flat[a], flat[b]), places=7)

    def test_reject_wrong_corner_indices_and_invalid_pleats(self):
        for args in (([5, 110, 90, 0, 2], .2, .15, ['M']*5),
                     ([5, 110, 90, 1, 1], .2, .15, ['M']*5),
                     ([5, 110, 90, 1, 2], .9, .15, ['M']*5),
                     ([5, 110, 90, 1, 2], .2, .41, ['M']*5),
                     ([5, 110, 90, 1, 2], .2, math.nan, ['M']*5),
                     ([5, 110, 90, 1, 2], .2, .15, ['M']*4)):
            with self.subTest(args=args), self.assertRaises(ValueError):
                unit_cyclic_brocard_offset_tile(*args)


if __name__ == '__main__':
    unittest.main()
