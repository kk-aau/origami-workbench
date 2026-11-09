import itertools
import math
import unittest

from tessellate import dispatch_request, generate, validate_request


SAMPLE = {
    'family': 'circular-twist',
    'polygon': [[0, 0], [1, 0], [.5, .4]],
    'angle': 30, 'radius': 2, 'circleDivisions': 16,
    'centralTypes': ['M', 'M', 'V'], 'stationaryFace': 'auto',
}


class CircularIntegrationTests(unittest.TestCase):
    def test_original_triangle_is_standard_workspace_result(self):
        result = generate(SAMPLE)
        self.assertEqual(result['stats']['kind'], 'circular-twist')
        self.assertEqual((result['stats']['vertices'], result['stats']['edges'],
                          result['stats']['faces']), (24, 30, 7))
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['layerOrder']['status'], 'not_checked')
        self.assertEqual(result['source']['foldedFormStationaryFace'], 7)
        self.assertLess(result['source']['closureError'], 1e-9)
        self.assertFalse(result['source']['circularizedFoldedFormIsometric'])

        cp = result['fold']['vertices_coords']
        strict = result['source']['foldedForm']
        display = result['source']['circularizedFoldedForm']
        self.assertEqual(len(strict), len(cp))
        for face in result['fold']['faces_vertices']:
            for a, b in itertools.combinations(face, 2):
                self.assertAlmostEqual(math.dist(cp[a], cp[b]),
                                       math.dist(strict[a], strict[b]), places=8)
        self.assertTrue(any(abs(math.dist(cp[a], cp[b]) -
                                math.dist(display[a], display[b])) > .01
                            for face in result['fold']['faces_vertices']
                            for a, b in itertools.combinations(face, 2)))

    def test_five_sided_sample_and_fixed_face(self):
        polygon = [[.5 + .55 * math.cos(2 * math.pi * i / 5),
                    .4 + .55 * math.sin(2 * math.pi * i / 5)] for i in range(5)]
        result = generate({**SAMPLE, 'polygon': polygon,
                           'centralTypes': ['M'] * 5, 'stationaryFace': 1})
        self.assertEqual(result['stats']['faces'], 11)
        self.assertEqual(result['source']['foldedFormStationaryFace'], 1)
        for index in result['fold']['faces_vertices'][0]:
            self.assertLess(math.dist(result['fold']['vertices_coords'][index],
                                      result['source']['foldedForm'][index]), 1e-8)

    def test_analysis_route_and_direct_generation_match(self):
        query = dispatch_request({**SAMPLE, 'operation': 'circular-twist'})
        direct = generate(SAMPLE)
        self.assertEqual(query['fold']['vertices_coords'], direct['fold']['vertices_coords'])
        self.assertEqual(query['source']['foldedForm'], direct['source']['foldedForm'])

    def test_rejects_unbounded_invalid_and_cross_family_inputs(self):
        cases = [
            {**SAMPLE, 'circleDivisions': 361},
            {**SAMPLE, 'radius': math.inf},
            {**SAMPLE, 'stationaryFace': 8},
            {**SAMPLE, 'centralTypes': ['M', 'V']},
            {**SAMPLE, 'paper': {'shape': 'square', 'margin': .1}},
            {**SAMPLE, 'polygon': [[0, 0], [1001, 0], [.5, .4]]},
        ]
        for data in cases:
            with self.subTest(data=data), self.assertRaises(ValueError):
                validate_request(data)
        with self.assertRaises(ValueError):
            dispatch_request({**SAMPLE, 'family': 'twist',
                              'operation': 'circular-twist'})


if __name__ == '__main__':
    unittest.main()
