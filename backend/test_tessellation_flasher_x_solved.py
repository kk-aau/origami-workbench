"""Fixed In[4123] X topology passed through the separate MakeFlasher solver."""

import math
import unittest

from tessellation_flasher_solver import solve_flasher
from tessellation_flasher_x_topology import saved_flasher_x_first_sector
from tessellate import generate, validate_request


class FlasherXSolvedTests(unittest.TestCase):
    params = {'family': 'flasher', 'rings': 3, 'heightOrder': 2,
              'rotationalOrder': 5, 'radialIncrement': 0,
              'diagonal': 'X', 'minimumAngleDeg': 10}

    def test_source_21_x_diagonals_are_solver_isometry_edges(self):
        solved = solve_flasher(3, 2, 5, 0, 'X', minimum_angle_deg=10)
        self.assertEqual(len(solved['vertex_ij']), 28)
        self.assertEqual(len(solved['edge_references']), 76)
        self.assertEqual(len(solved['vertices_coords']), 140)
        self.assertEqual(len(solved['edges_vertices']), 380)
        self.assertEqual(len(solved['faces_vertices']) + 1, 241)
        self.assertLess(solved['isometryResidualSum'], 1e-8)
        self.assertLess(solved['maxFaceEdgeError'], 1e-8)
        edges = {frozenset(tuple(point) for point in pair)
                 for pair in solved['edge_references']}
        for diagonal in saved_flasher_x_first_sector()['diagonals']:
            endpoints = frozenset(tuple(point) for point in diagonal['endpointLabels'])
            self.assertIn(endpoints, edges)

    def test_main_route_guards_geometry_and_static_isometry_without_layer_claim(self):
        parsed = validate_request(self.params)
        self.assertEqual(parsed, self.params)
        result = generate(parsed)
        fold, source = result['fold'], result['source']
        checks = result['stats']['checks']
        self.assertEqual(tuple(result['stats'][key] for key in
                               ('vertices', 'edges', 'faces')), (140, 380, 241))
        self.assertEqual(checks['geometry']['status'], 'passed')
        self.assertEqual(checks['local']['status'], 'not_applicable')
        self.assertEqual(checks['layerOrder']['status'], 'not_checked')
        self.assertEqual(result['stats']['foldability'], 'static-spatial-state')
        self.assertTrue(any('In[4123]' in warning and '本地输入' in warning
                            for warning in result['warnings']))
        self.assertTrue(source['staticGlobalIsometryChecked'])
        self.assertFalse(source['continuousRigidPathChecked'])
        self.assertFalse(source['selfCollisionChecked'])
        self.assertLess(source['maximumFaceDistanceError'], 1e-8)
        self.assertLess(source['maximumFacePlaneError'], 1e-8)
        self.assertEqual(len(fold['faces_vertices']), 241)
        self.assertEqual(len(fold['edges_vertices']), 380)
        for face in fold['faces_vertices']:
            for pos, a in enumerate(face):
                for b in face[pos + 1:]:
                    self.assertLess(abs(math.dist(fold['vertices_coords'][a],
                                                  fold['vertices_coords'][b]) -
                                        math.dist(source['foldedForm3D'][a],
                                                  source['foldedForm3D'][b])), 1e-8)


if __name__ == '__main__':
    unittest.main()
