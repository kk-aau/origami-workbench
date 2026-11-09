"""Main-route FOLD/spatial contract for Origamica MakeFlasher."""

import math
import unittest

from tessellate import generate, validate_request


class FlasherCandidateTests(unittest.TestCase):
    def test_in4197_hexagonal_saved_input_is_static_isometric_candidate(self):
        params = {'family': 'flasher', 'rings': 2, 'heightOrder': 2,
                  'rotationalOrder': 6, 'radialIncrement': .05,
                  'diagonal': 'Z', 'minimumAngleDeg': 10}
        result = generate(params)
        stats = result['stats']
        self.assertEqual(stats['parameters'], params)
        self.assertEqual((stats['vertices'], stats['edges'], stats['faces']),
                         (90, 234, 145))
        self.assertEqual(stats['checks']['geometry']['status'], 'passed')
        self.assertEqual(stats['checks']['layerOrder']['status'], 'not_checked')
        self.assertEqual(stats['checks']['local']['status'], 'not_applicable')
        self.assertEqual(stats['foldability'], 'static-spatial-state')
        self.assertTrue(result['source']['staticGlobalIsometryChecked'])
        self.assertFalse(result['source']['deployedPatternChecked'])
        self.assertLess(result['source']['maximumFaceDistanceError'], 1e-10)
        self.assertLess(result['source']['maximumFacePlaneError'], 1e-10)

    def test_both_saved_examples_have_same_index_developed_and_3d_faces(self):
        cases = ({'family': 'flasher'},
                 {'family': 'flasher', 'rings': 2, 'heightOrder': 2,
                  'rotationalOrder': 5, 'radialIncrement': .1,
                  'diagonal': 'Z', 'minimumAngleDeg': 10})
        for params, expected in zip(cases, ((60, 156, 97), (75, 195, 121))):
            with self.subTest(params=params):
                result = generate(params)
                fold = result['fold']
                source = result['source']
                flat = fold['vertices_coords']
                spatial = source['foldedForm3D']
                edges = fold['edges_vertices']
                faces = fold['faces_vertices']
                self.assertEqual(tuple(result['stats'][key] for key in
                                       ('vertices', 'edges', 'faces')), expected)
                self.assertEqual((len(flat), len(spatial), len(edges), len(faces)),
                                 (expected[0], expected[0], expected[1], expected[2]))
                self.assertEqual(len(fold['edges_assignment']), len(edges))
                self.assertEqual(len(fold['edges_foldAngle']), len(edges))
                self.assertEqual(len(faces[-1]), result['stats']['parameters']['rotationalOrder'])
                self.assertEqual(source['spatialKind'], 'origamica-planar-flasher')
                self.assertTrue(source['staticGlobalIsometryChecked'])
                self.assertFalse(source['deployedPatternChecked'])
                self.assertFalse(source['selfCollisionChecked'])
                self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
                self.assertLess(source['maximumFaceDistanceError'], 1e-10)
                self.assertLess(source['maximumFacePlaneError'], 1e-10)
                for face in faces:
                    for position, a in enumerate(face):
                        for b in face[position+1:]:
                            self.assertAlmostEqual(math.dist(flat[a], flat[b]),
                                                   math.dist(spatial[a], spatial[b]), places=9)

    def test_main_route_rejects_bool_oversized_and_foreign_parameters(self):
        for bad in ({'family': 'flasher', 'rings': True},
                    {'family': 'flasher', 'heightOrder': False},
                    {'family': 'flasher', 'rotationalOrder': 150},
                    {'family': 'flasher', 'rings': 5},
                    {'family': 'flasher', 'heightOrder': 5},
                    {'family': 'flasher', 'rings': 9, 'heightOrder': 1, 'rotationalOrder': 4},
                    {'family': 'flasher', 'radialIncrement': -.001},
                    {'family': 'flasher', 'paper': {'shape': 'square', 'margin': .1}},
                    {'family': 'flasher', 'diagonal': 'W'}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                validate_request(bad)

    def test_extended_height4_and_m9_keep_radial_and_actual_face_budgets(self):
        for patch, expected_faces in (({'heightOrder': 4}, 193),
                                      ({'rotationalOrder': 9}, 217)):
            with self.subTest(patch=patch):
                params = validate_request({'family': 'flasher', **patch})
                self.assertLessEqual(params['rings'] * params['heightOrder'], 9)
                result = generate(params)
                self.assertEqual(result['stats']['faces'], expected_faces)
                self.assertLessEqual(expected_faces, 600)
                self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')

    def test_original_higher_order_and_zero_radial_increment_are_real_candidates(self):
        for rings, height, increment, expected in (
                (3, 3, .05, (160, 448, 289)),
                (2, 2, 0., (60, 156, 97))):
            with self.subTest(rings=rings, height=height, increment=increment):
                params = validate_request({
                    'family': 'flasher', 'rings': rings,
                    'heightOrder': height, 'rotationalOrder': 4,
                    'radialIncrement': increment, 'diagonal': 'Y',
                    'minimumAngleDeg': 10,
                })
                result = generate(params)
                self.assertEqual(tuple(result['stats'][key] for key in
                                       ('vertices', 'edges', 'faces')), expected)
                self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
                self.assertLess(result['source']['maximumFaceDistanceError'], 1e-10)
                self.assertLess(result['source']['maximumFacePlaneError'], 1e-10)
                self.assertEqual(len(result['source']['foldedForm3D']), expected[0])


if __name__ == '__main__':
    unittest.main()
