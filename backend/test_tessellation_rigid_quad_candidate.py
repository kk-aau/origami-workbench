import math
import unittest

from tessellate import generate


def miura_candidate():
    small = math.degrees(2 * math.atan(1 / math.sqrt(2)))
    large = math.degrees(2 * math.atan(math.sqrt(2)))
    return {
        'family': 'rigid-quad',
        'bottomDirectionsDeg': [90, 90],
        'bottomFoldAnglesDeg': [-small, small],
        'leftDirectionsDeg': [30, 30],
        'leftFoldAnglesDeg': [large, -large],
        'minimumEdgeLength': 1,
    }


class RigidQuadCandidateTests(unittest.TestCase):
    def test_miura_is_adoptable_static_3d_candidate(self):
        result = generate(miura_candidate())
        fold, source = result['fold'], result['source']
        self.assertEqual(result['stats']['kind'], 'rigid-quad')
        self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']),
                          len(fold['faces_vertices'])), (16, 24, 9))
        self.assertEqual(len(fold['edges_foldAngle']), 24)
        self.assertEqual(len(source['foldedForm3D']), 16)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
        self.assertTrue(source['staticGlobalIsometryChecked'])
        self.assertFalse(source['continuousRigidPathChecked'])
        self.assertFalse(source['selfCollisionChecked'])

    def test_original_in_2104_backplane_and_triangle_reach_standard_canvas(self):
        result = generate({
            'family': 'rigid-quad',
            'bottomDirectionsDeg': [90] * 5,
            'bottomFoldAnglesDeg': [108, -72, -72, -72, 108],
            'leftDirectionsDeg': [0] * 4,
            'leftFoldAnglesDeg': [132.5, -132.5, -132.5, 132.5],
            'minimumEdgeLength': 1,
            'baseFaces': [[0, 0], [5, 0]],
            'minimumEdgeLengths': [[1, 6, 2, 0]],
        })
        fold, source = result['fold'], result['source']
        self.assertEqual((len(fold['vertices_coords']), len(fold['edges_vertices']),
                          len(fold['faces_vertices'])), (41, 70, 30))
        self.assertEqual(sum(len(face) == 3 for face in fold['faces_vertices']), 1)
        self.assertEqual(source['baseFaces'], [[0, 0], [5, 0]])
        self.assertLess(source['maximumBaseFaceHeightError'], 1e-8)
        self.assertEqual(len(source['foldedForm3D']), 41)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
        self.assertTrue(source['staticGlobalIsometryChecked'])
        self.assertFalse(source['continuousRigidPathChecked'])

    def test_nonrectangular_corner_constraints_reach_standard_3d_canvas(self):
        result = generate({**miura_candidate(), 'rectangular': False,
                           'cornerAnglesDeg': [95, 85, 95, 85]})
        fold, source = result['fold'], result['source']
        self.assertEqual(len(fold['faces_vertices']), 9)
        self.assertEqual(len(source['foldedForm3D']), 16)
        self.assertFalse(source['rectangular'])
        self.assertEqual(source['cornerAnglesDeg'], [95, 85, 95, 85])
        self.assertGreater(abs(source['boundaryDirectionsDeg']['bottom'][0]), 1)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
        self.assertTrue(source['staticGlobalIsometryChecked'])
        self.assertFalse(source['continuousRigidPathChecked'])
        self.assertTrue(any('全局最小边长' in warning for warning in result['warnings']))

    def test_nonrectangular_backplane_reaches_canvas_with_explicit_comparison_limit(self):
        result = generate({
            'family': 'rigid-quad',
            'bottomDirectionsDeg': [90] * 5,
            'bottomFoldAnglesDeg': [108, -72, -72, -72, 108],
            'leftDirectionsDeg': [0] * 4,
            'leftFoldAnglesDeg': [132.5, -132.5, -132.5, 132.5],
            'minimumEdgeLength': 1,
            'rectangular': False,
            'cornerAnglesDeg': [95, 85, 95, 85],
            'baseFaces': [[0, 0], [5, 0]],
        })
        self.assertEqual(len(result['fold']['faces_vertices']), 30)
        self.assertEqual(len(result['source']['foldedForm3D']), 42)
        self.assertLess(result['source']['maximumBaseFaceHeightError'], 1e-8)
        self.assertGreaterEqual(result['source']['minimumOtherVertexHeight'], -1e-8)
        self.assertTrue(result['source']['unverifiedOrigamicaOptions'])
        self.assertTrue(any('没有原版数值输出' in warning
                            for warning in result['warnings']))
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')

    def test_tolerance_persists_but_raw_no_face_graph_is_analysis_only(self):
        candidate = generate({**miura_candidate(), 'samePtTolerance': None})
        self.assertIsNone(candidate['source']['samePtTolerance'])
        self.assertTrue(candidate['source']['planeGraphBuilt'])
        self.assertEqual(len(candidate['fold']['faces_vertices']), 9)
        with self.assertRaisesRegex(ValueError, '不能采用为标准刚性网格候选'):
            generate({**miura_candidate(), 'addPlaneGraph': False})
        with self.assertRaises(ValueError):
            generate({**miura_candidate(), 'samePtTolerance': -1})

    def test_paper_extension_and_bad_boundary_lists_are_rejected(self):
        sample = miura_candidate()
        for wrong in ({**sample, 'paper': {'shape': 'square', 'margin': .1}},
                      {**sample, 'bottomFoldAnglesDeg': [40]},
                      {**sample, 'minimumEdgeLength': 0}):
            with self.subTest(wrong=wrong), self.assertRaises(ValueError):
                generate(wrong)


if __name__ == '__main__':
    unittest.main()
