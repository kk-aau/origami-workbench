import json
import math
import unittest

from tessellate import generate, validate_request, check_geometry


class TessellationTests(unittest.TestCase):
    def assert_candidate(self, result):
        f = result['fold']
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
        self.assertNotIn('U', f['edges_assignment'])
        self.assertTrue(all(math.isfinite(x) for p in f['vertices_coords'] for x in p))
        # A connected disk has V-E+F=1 (excluding the exterior face).
        self.assertEqual(len(f['vertices_coords']) - len(f['edges_vertices']) + len(f['faces_vertices']), 1)
        used = {tuple(sorted((a, b))): 0 for a, b in f['edges_vertices']}
        for face in f['faces_vertices']:
            for a, b in zip(face, face[1:] + face[:1]):
                used[tuple(sorted((a, b)))] += 1
        for edge, assignment in zip(f['edges_vertices'], f['edges_assignment']):
            self.assertEqual(used[tuple(sorted(edge))], 1 if assignment == 'B' else 2)
        json.dumps(result, allow_nan=False)

    def test_twist_all_supported_polygons_and_handedness(self):
        for n in range(3, 13):
            for angle in (-36, 36):
                with self.subTest(n=n, angle=angle):
                    r = generate({'family': 'twist', 'sides': n, 'angle': angle})
                    self.assert_candidate(r)
                    self.assertEqual(r['stats']['tiles'], 1)
                    self.assertEqual(r['stats']['valleyEdges'], 6 if n == 4 else n)
                    self.assertEqual(r['source']['algorithm'], 'regular-polygon-twist')

    def test_periodic_shared_topology_and_bounded_sizes(self):
        for tiling in ('square', 'triangle', 'hexagon'):
            for rows, cols in ((2, 2), (2, 5), (6, 6)):
                with self.subTest(tiling=tiling, rows=rows, cols=cols):
                    r = generate({'family': 'periodic', 'tiling': tiling, 'rows': rows, 'columns': cols})
                    self.assert_candidate(r)
                    self.assertEqual(r['stats']['tiles'], rows * cols * (2 if tiling == 'triangle' else 1))
                    self.assertEqual(check_geometry(r['mother'])['status'], 'passed')
                    self.assertIn('U', r['mother']['edges_assignment'])

    def test_known_crossing_parameters_are_flagged(self):
        r = generate({'family': 'periodic', 'tiling': 'triangle', 'scale': .5, 'angle': 60})
        self.assertEqual(r['stats']['checks']['geometry']['status'], 'failed')

    def test_legacy_request_unchanged(self):
        r = generate({'tiling': 'hexagon', 'rings': 2, 'angle': 36, 'scale': .5})
        self.assert_candidate(r)
        self.assertEqual((r['stats']['vertices'], r['stats']['edges']), (96, 180))
        self.assertNotIn('family', r['stats']['parameters'])

    def test_reproducible(self):
        for params in ({'family': 'twist'}, {'family': 'periodic'}):
            self.assertEqual(generate(params)['fold'], generate(params)['fold'])

    def test_invalid_inputs_rejected(self):
        for params in (None, {'family': []}, {'family': 'bad'}, {'family': 'twist', 'sides': True},
                       {'family': 'twist', 'sides': 13}, {'family': 'twist', 'sides': 3, 'angle': 30},
                       {'family': 'twist', 'angle': 0}, {'family': 'twist', 'rings': 2},
                       {'family': 'periodic', 'rows': 1}, {'family': 'periodic', 'columns': 7},
                       {'family': 'periodic', 'rows': 2.5}, {'family': 'periodic', 'scale': float('nan')},
                       {'family': 'periodic', 'tiling': 'bad'}, {'family': 'primal-dual', 'rings': 4}):
            with self.subTest(params=params), self.assertRaises(ValueError):
                validate_request(params)


if __name__ == '__main__':
    unittest.main()
