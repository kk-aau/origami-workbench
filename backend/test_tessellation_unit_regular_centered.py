import itertools
import math
import unittest

from tessellation_tile_patch import construct_tile_patch
from tessellation_unit_regular_centered import (
    ALT_TILE_TYPE, TILE_TYPE, original_regular_centered_alt_pair,
    original_regular_centered_pair, unit_regular_centered_twist_alt_tile,
    unit_regular_centered_twist_tile, unit_regular_polygon_vertices,
)


class UnitRegularCenteredTests(unittest.TestCase):
    def test_original_unit_polygon_formula_and_input_range(self):
        for sides in (3, 4, 5, 6, 12, 13, 16, 24):
            with self.subTest(sides=sides):
                vertices = unit_regular_polygon_vertices(sides)
                self.assertEqual(vertices[:2], [[0., 0.], [1., 0.]])
                for a, b in zip(vertices, vertices[1:]+vertices[:1]):
                    self.assertAlmostEqual(math.dist(a, b), 1, places=10)
                center = [.5, .5/math.tan(math.pi/sides)]
                radii = [math.dist(center, point) for point in vertices]
                self.assertLess(max(radii)-min(radii), 1e-10)
        self.assertEqual(unit_regular_polygon_vertices(4),
                         [[0., 0.], [1., 0.], [1., 1.], [0., 1.]])
        for sides in (2, 25, True, 4.0, '4'):
            with self.subTest(bad=sides), self.assertRaises(ValueError):
                unit_regular_polygon_vertices(sides)

    def test_stable_saved_type_has_exact_ordered_center_and_mv(self):
        # In[3005] stores n=4,w=.2,tau=70°,types={M,M,V,V}.
        types = ['M', 'M', 'V', 'V']
        fold, mother, info = unit_regular_centered_twist_tile(4, .2, 70, types)
        self.assertEqual(info['tileType'], TILE_TYPE)
        self.assertEqual(info['centralTypes'], types)
        self.assertEqual(info['vertices'], [[0., 0.], [1., 0.], [1., 1.], [0., 1.]])
        self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']),
                          len(fold['faces_vertices'])), (16, 24, 9))
        self.assertEqual(len(mother['faces_vertices']), 1)
        expected = [[.4817664105611035, .22465136668648772],
                    [.7753486333135122, .4817664105611035],
                    [.5182335894388965, .7753486333135122],
                    [.22465136668648772, .5182335894388965]]
        for got, wanted in zip(info['centralVertices'], expected):
            self.assertLess(math.dist(got, wanted), 1e-11)
        self.assertEqual(info['layerOrder'], 'not_checked')
        self.assertFalse(info['adoptable'])
        for args in ((4, .2, 70, ['M']*3), (4, .2, 70, ['M', 'V', 'M', 'U']),
                     (4, .81, 70, types), (4, .2, float('nan'), types)):
            with self.subTest(args=args), self.assertRaises(ValueError):
                unit_regular_centered_twist_tile(*args)

    def test_original_saved_pair_preserves_source_and_checks_whole_cp_ff(self):
        result = original_regular_centered_pair()
        fold = result['fold']
        self.assertEqual([tile['sourceIndex'] for tile in result['sourceTiles']], [0, 1])
        self.assertEqual([tile['tileType'] for tile in result['sourceTiles']], [TILE_TYPE]*2)
        self.assertEqual([tile['centralTypes'] for tile in result['sourceTiles']],
                         [['M', 'M', 'V', 'V']]*2)
        self.assertLess(math.dist(result['sourceTiles'][0]['vertices'][3],
                                  result['sourceTiles'][1]['vertices'][0]), 1e-12)
        self.assertLess(math.dist(result['sourceTiles'][0]['vertices'][2],
                                  result['sourceTiles'][1]['vertices'][1]), 1e-12)
        self.assertEqual(fold['zhezhi_merged_edge_mode'], 'delete')
        self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']),
                          len(fold['faces_vertices'])), (24, 38, 15))
        self.assertNotIn('U', fold['edges_assignment'])
        self.assertIn(0, fold['zhezhi_face_tile_instance'])
        self.assertIn(1, fold['zhezhi_face_tile_instance'])
        self.assertEqual(fold['zhezhi_face_tile_instance'],
                         fold['zhezhi_face_tile_source'])
        self.assertEqual(result['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['checks']['local']['status'], 'passed')
        self.assertLess(result['closureError'], 1e-8)
        flat = result['foldedForm']
        for face in fold['faces_vertices']:
            for a, b in itertools.combinations(face, 2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],
                                                 fold['vertices_coords'][b]),
                                       math.dist(flat[a], flat[b]), places=7)
        self.assertEqual(result['checks']['layerOrder']['status'], 'not_checked')
        self.assertFalse(result['adoptable'])
        vertices = result['mother']['vertices_coords']
        first = dict(width=.2, offset=0., tilt=70, centralTypes=['M', 'M', 'V', 'V'])
        second = {**first, 'width': .25}
        with self.assertRaises(ValueError):
            construct_tile_patch(result['mother'], [first, second], vertices,
                                 [[0, 1, 2, 3], [3, 2, 4, 5]])

    def test_saved_alt_tile_preserves_twist_angle_and_derived_pleat(self):
        types = ['M', 'M', 'V', 'V']
        fold, mother, info = unit_regular_centered_twist_alt_tile(4, .2, 30., types)
        expected_tau = math.degrees(math.atan2(math.sin(math.radians(30)),
                                               .2*math.cos(math.radians(30))))
        self.assertEqual(info['tileType'], ALT_TILE_TYPE)
        self.assertEqual(info['twistAngle'], 30.)
        self.assertAlmostEqual(info['pleatAngle'], expected_tau, places=11)
        self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']),
                          len(fold['faces_vertices'])), (16, 24, 9))
        self.assertEqual(len(mother['faces_vertices']), 1)
        self.assertEqual(info['centralTypes'], types)
        self.assertFalse(info['adoptable'])
        for angle in (0, 90, 95, float('nan'), True):
            with self.subTest(angle=angle), self.assertRaises(ValueError):
                unit_regular_centered_twist_alt_tile(4, .2, angle, types)
        for width in (0, .81, float('nan'), True, '0.2'):
            with self.subTest(width=width), self.assertRaises(ValueError):
                unit_regular_centered_twist_alt_tile(4, width, 30., types)

    def test_original_alt_pair_checks_assembled_geometry_and_flat_faces(self):
        result = original_regular_centered_alt_pair()
        fold = result['fold']
        self.assertEqual([item['tileType'] for item in result['sourceTiles']],
                         [ALT_TILE_TYPE, ALT_TILE_TYPE])
        self.assertEqual([item['twistAngle'] for item in result['sourceTiles']],
                         [30., 30.])
        self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']),
                          len(fold['faces_vertices'])), (24, 38, 15))
        self.assertEqual(result['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['checks']['local']['status'], 'passed')
        self.assertLess(result['closureError'], 1e-8)
        for face in fold['faces_vertices']:
            for a, b in itertools.combinations(face, 2):
                self.assertAlmostEqual(math.dist(fold['vertices_coords'][a],
                                                 fold['vertices_coords'][b]),
                                       math.dist(result['foldedForm'][a],
                                                 result['foldedForm'][b]), places=7)
        self.assertEqual(result['checks']['layerOrder']['status'], 'not_checked')
        self.assertFalse(result['adoptable'])

    def test_high_sided_custom_source_keeps_flat_reflection_precision(self):
        from tessellation_flat_embedding import flat_face_embedding
        from tessellation_meshes import custom_mesh
        from tessellate import check_geometry, check_local_conditions

        for sides in (13, 16, 24):
            polygon = unit_regular_polygon_vertices(sides)
            mother = custom_mesh(polygon, [list(range(sides))])
            self.assertLess(max(math.dist(a, b) for a, b in zip(
                mother['vertices_coords'], polygon)), 1e-11)
            options = (
                dict(width=.2, offset=0., tilt=70, centralTypes=['M']*sides),
                dict(width=.2, offset=0., angleMode='twist', twistAngle=30,
                     centralTypes=['M']*sides),
                dict(width=.2, offset=.15, tilt=90, centralTypes=['M']*sides),
            )
            for option in options:
                with self.subTest(sides=sides, mode=option):
                    fold = construct_tile_patch(
                        mother, [option], polygon, [list(range(sides))],
                        {'mergedEdges': 'delete', 'samePtTolerance': 1e-8,
                         'collinearCleanup': True, 'collinearTolerance': 1e-8})
                    self.assertEqual(check_geometry(fold)['status'], 'passed')
                    self.assertEqual(check_local_conditions(fold)['status'], 'passed')
                    flat, closure = flat_face_embedding(fold)
                    self.assertLess(closure, 1e-8)
                    self.assertEqual(len(flat), 4*sides)


if __name__ == '__main__':
    unittest.main()
