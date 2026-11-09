import itertools
import math
import unittest

from tessellation_flat_embedding import flat_face_embedding
from tessellation_unit_triangle_offset import (
    TILE_TYPE, original_triangle_offset_pair, unit_triangle_offset_twist_angle,
    unit_triangle_offset_twist_tile,
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


class UnitTriangleOffsetTests(unittest.TestCase):
    def test_in3030_printed_arctan_conflicts_with_saved_out3031_and_inverse(self):
        # In[3030], notebook lines 225983–226011, prints ArcTan[w/(2d), F].
        # In[3031]/Out[3031], lines 226030–226048, save 22.843204806°.
        # In[3032]/Out[3033], lines 226071–226134, support d=w F cot(alpha)/2.
        angles, width, offset = [50, 60, 70], .09, .06
        a, b, c = [math.radians(angle) for angle in angles]
        factor = math.sin(a)*math.sin(b)*math.sin(c)/(1+math.cos(a)*math.cos(b)*math.cos(c))
        printed = math.degrees(math.atan2(factor, width/(2*offset)))
        corrected = unit_triangle_offset_twist_angle(angles, width, offset)
        self.assertAlmostEqual(printed, 36.829059608027045, places=10)
        self.assertAlmostEqual(corrected, 22.843204806313516, places=10)
        self.assertGreater(abs(printed-corrected), 13.9)
        saved_inverse = width*factor/(2*math.tan(math.radians(22.8432)))
        self.assertAlmostEqual(saved_inverse, .060000014068401, places=12)

    def test_named_tiles_preserve_offset_pleats_and_central_mv(self):
        for offset, direction in ((.05, 'CCW'), (-.05, 'CW')):
            with self.subTest(offset=offset):
                types = ['M', 'V', 'M']
                fold, mother, info = unit_triangle_offset_twist_tile(
                    [50, 60, 70], .1, offset, types)
                self.assertEqual(info['tileType'], TILE_TYPE)
                self.assertEqual(info['resolvedAngles'], [50, 60, 70])
                self.assertEqual(info['offset'], offset)
                self.assertEqual(info['centralTypes'], types)
                self.assertEqual(info['twistDirection'], direction)
                self.assertEqual(info['pleatAngle'], 90.)
                self.assertEqual(info['layerOrder'], 'not_checked')
                self.assertFalse(info['adoptable'])
                self.assertEqual(len(mother['faces_vertices']), 1)
                self.assertEqual(check_geometry(fold)['status'], 'passed')
                self.assertEqual(check_local_conditions(fold)['status'], 'passed')
                self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']),
                                  len(fold['faces_vertices'])), (12, 18, 7))
                outer, center = info['vertices'], info['centralVertices']
                lengths = [math.dist(a, b) for a, b in zip(outer, outer[1:]+outer[:1])]
                center_lengths = [math.dist(a, b) for a, b in zip(center, center[1:]+center[:1])]
                for index, (a, b) in enumerate(zip(outer, outer[1:]+outer[:1])):
                    self.assertEqual(edge_assignment(fold, center[index],
                                                     center[(index+1)%3]), types[index])
                    direction_vector = [b[axis]-a[axis] for axis in (0, 1)]
                    for fraction, target in (((1-.1)/2+offset, center[index]),
                                             ((1+.1)/2+offset, center[(index+1)%3])):
                        endpoint = [a[axis]+fraction*direction_vector[axis]
                                    for axis in (0, 1)]
                        self.assertLess(min(math.dist(endpoint, point)
                                            for point in fold['vertices_coords']), 1e-9)
                        ray = [target[axis]-endpoint[axis] for axis in (0, 1)]
                        dot = sum(direction_vector[k]*ray[k] for k in (0, 1))
                        self.assertAlmostEqual(dot, 0., places=10)
                    self.assertAlmostEqual(center_lengths[index]/lengths[index],
                                           info['shrinkage'], places=9)
                    central_vector = [center[(index+1)%3][axis]-center[index][axis]
                                      for axis in (0, 1)]
                    measured_rotation = math.degrees(math.atan2(
                        direction_vector[0]*central_vector[1]-
                        direction_vector[1]*central_vector[0],
                        sum(direction_vector[k]*central_vector[k] for k in (0, 1))))
                    self.assertAlmostEqual(measured_rotation, info['twistRotation'], places=9)
                self.assertAlmostEqual(info['twistAngle'],
                                       29.32140566277096 if offset > 0 else
                                       150.67859433722904, places=9)
                self.assertAlmostEqual(info['twistRotation'], 90-info['twistAngle'])

    def test_saved_in3039_joined_cp_and_face_reflection_ff(self):
        result = original_triangle_offset_pair()
        fold = result['fold']
        first, second = result['sourceTiles']
        self.assertEqual([source['tileType'] for source in (first, second)],
                         [TILE_TYPE]*2)
        self.assertEqual([source['sourceIndex'] for source in (first, second)], [0, 1])
        self.assertEqual([source['offset'] for source in (first, second)], [.05, -.05])
        self.assertEqual([source['centralTypes'] for source in (first, second)],
                         [['M']*3, ['M']*3])
        self.assertEqual([source['twistDirection'] for source in (first, second)],
                         ['CCW', 'CW'])
        self.assertEqual(first['angles'], [50., 60., 70.])
        self.assertEqual([source['width'] for source in (first, second)], [.1, .1])
        self.assertEqual([source['pleatAngle'] for source in (first, second)],
                         [90., 90.])
        self.assertLess(math.dist(first['vertices'][1], second['vertices'][2]), 1e-12)
        self.assertLess(math.dist(first['vertices'][2], second['vertices'][1]), 1e-12)
        self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']),
                          len(fold['faces_vertices'])), (18, 28, 11))
        self.assertEqual(fold['zhezhi_merged_edge_mode'], 'delete')
        self.assertNotIn('U', fold['edges_assignment'])
        self.assertEqual(result['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['checks']['local']['status'], 'passed')
        self.assertEqual(result['checks']['layerOrder']['status'], 'not_checked')
        self.assertFalse(result['adoptable'])
        for index, source in enumerate((first, second)):
            _, _, local = unit_triangle_offset_twist_tile(
                [50, 60, 70], .1, source['offset'], ['M']*3)
            center = local['centralVertices']
            if index == 1:
                center = [[first['vertices'][1][axis]+first['vertices'][2][axis]-p[axis]
                           for axis in (0, 1)] for p in center]
            self.assertEqual([edge_assignment(fold, a, b)
                              for a, b in zip(center, center[1:]+center[:1])], ['M']*3)
        flat, closure = flat_face_embedding(fold)
        self.assertEqual(flat, result['foldedForm'])
        self.assertAlmostEqual(closure, result['closureError'], places=14)
        self.assertLess(closure, 1e-8)
        for face in fold['faces_vertices']:
            for a, b in itertools.combinations(face, 2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],
                                                 fold['vertices_coords'][b]),
                                       math.dist(flat[a], flat[b]), places=7)

    def test_input_validation_excludes_inconsistent_or_degenerate_tiles(self):
        for args in (([50, 60, 69], .1, .05, ['M']*3),
                     ([50, 60, 70], .9, .05, ['M']*3),
                     ([50, 60, 70], .1, .46, ['M']*3),
                     ([50, 60, 70], .1, math.nan, ['M']*3),
                     ([50, 60, 70], .1, .05, ['M', 'M']),
                     ([50, 60, 70], .1, .05, ['M', 'M', 'B'])):
            with self.subTest(args=args), self.assertRaises(ValueError):
                unit_triangle_offset_twist_tile(*args)


if __name__ == '__main__':
    unittest.main()
