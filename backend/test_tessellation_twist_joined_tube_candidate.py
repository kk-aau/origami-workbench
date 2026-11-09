"""Studio dispatch and adoption metadata for Origamica TwistJoinedTubes."""

import math
import unittest

from tessellate import generate, validate_request


class TwistJoinedTubeCandidateTests(unittest.TestCase):
    def setUp(self):
        bottom = [[1, 1], [-1, 1], [-1, -1], [1, -1]]
        angle = math.pi / 6
        self.params = {
            'family': 'twist-joined-tube',
            'bottomPoints': bottom,
            'topPoints': [[math.cos(angle)*x-math.sin(angle)*y,
                           math.sin(angle)*x+math.cos(angle)*y] for x, y in bottom],
            'verticalOffset': 1,
            'twistDirection': 'CCW',
            'panelOverlap': True,
        }

    def test_generates_developed_cp_and_static_spatial_result(self):
        response = generate(self.params)
        fold, source, stats = response['fold'], response['source'], response['stats']
        self.assertEqual((stats['vertices'], stats['edges'], stats['faces']), (24, 43, 20))
        self.assertEqual(stats['checks']['geometry']['status'], 'passed')
        self.assertEqual(stats['checks']['local']['status'], 'not_applicable')
        self.assertEqual(source['spatialKind'], 'origamica-twist-joined-tube')
        self.assertTrue(source['staticGlobalIsometryChecked'])
        self.assertLess(source['maximumFaceDistanceError'], 1e-10)
        self.assertEqual(len(fold['vertices_coords']), len(source['foldedForm3D']))

    def test_rejects_an_extra_paper_or_mismatched_perimeter(self):
        with self.assertRaises(ValueError):
            validate_request({**self.params, 'paper': {'shape': 'square', 'margin': .1}})
        with self.assertRaisesRegex(ValueError, '周长'):
            generate({**self.params, 'topPoints': [[2*x, 2*y]
                                                    for x, y in self.params['topPoints']]})

    def test_double_joined_original_input_reaches_the_same_candidate_contract(self):
        from tessellation_double_joined_tubes import pleat_reduce_polygon

        bottom = [[1, 0], [0, 1], [-1, 0], [0, -1]]
        angle = math.pi / 4
        top = [[math.cos(angle)*x-math.sin(angle)*y,
                math.sin(angle)*x+math.cos(angle)*y]
               for x, y in pleat_reduce_polygon(bottom, .5)]
        result = generate({'family': 'double-joined-tube', 'bottomPoints': bottom,
                           'topPoints': top, 'verticalOffset': .5})
        self.assertEqual((result['stats']['vertices'], result['stats']['edges'],
                          result['stats']['faces']), (28, 51, 24))
        self.assertEqual(result['source']['spatialKind'], 'origamica-double-joined-tube')
        self.assertEqual(result['stats']['checks']['local']['status'], 'not_applicable')

    def test_closed_topped_original_input_reaches_the_same_candidate_contract(self):
        result = generate({'family': 'closed-twist-topped-tube',
                           'points': [[1,1],[-1,1],[-1,-1],[1,-1]],
                           'convergencePoint': [0,0,.5], 'twistNormal': [0,0,1],
                           'twistExtension': .5, 'panelOverlap': True})
        self.assertEqual((result['stats']['vertices'], result['stats']['edges'],
                          result['stats']['faces']), (23, 37, 15))
        self.assertEqual(result['source']['spatialKind'],
                         'origamica-closed-twist-topped-tube')
        self.assertTrue(result['source']['staticGlobalIsometryChecked'])


if __name__ == '__main__':
    unittest.main()
