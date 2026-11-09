import copy
import math
import unittest

from tessellation_line_groups import arrangement, chord_lines, inset_faces
from tessellation_woven import BOX
from tessellation_woven_inset_separation import inset_separation_fn, inset_separation_from_mesh, woven_inset_separation_query


class InsetSeparationTests(unittest.TestCase):
    def test_original_unit_square_example_and_exact_first_collision(self):
        square = [[0, 0], [1, 0], [1, 1], [0, 1]]
        edges = [[0, 1], [1, 2], [2, 3], [3, 0]]
        original = inset_separation_fn(square, edges)
        self.assertEqual(original.face_count, 1)
        self.assertEqual(original.point_count, 4)
        for h, expected in ((0, 1), (.1, .8), (.4, .2), (.5, 0), (.6, .2)):
            with self.subTest(h=h):
                self.assertAlmostEqual(original(h), expected, places=11)
        self.assertAlmostEqual(original.first_positive_collision(), .5, places=11)
        self.assertIsNone(original.first_positive_collision(.49))
        self.assertAlmostEqual(original.first_positive_collision(.5), .5, places=11)

    def test_explicit_clockwise_faces_match_graph_derived_faces(self):
        square = [[0, 0], [2, 0], [2, 1], [0, 1]]
        edges = [[0, 1], [1, 2], [2, 3], [3, 0]]
        from_edges = inset_separation_fn(square, edges)
        from_clockwise = inset_separation_fn(square, edges, [[3, 2, 1, 0]])
        for h in (0, .1, .4, .5):
            self.assertAlmostEqual(from_edges(h), from_clockwise(h), places=11)
        self.assertAlmostEqual(from_edges.first_positive_collision(), .5, places=11)

    def test_four_line_arrangement_matches_existing_per_edge_inset_geometry(self):
        data = arrangement([[0, -.4, .06], [0, .4, .06],
                            [90, -.4, .06], [90, .4, .06]], BOX)
        function = inset_separation_from_mesh(data['mesh'])
        h = .03
        by_edge = copy.deepcopy(data)
        by_edge['edgeWidths'] = [2 * h for _ in by_edge['edgeWidths']]
        actual_points = [point for face in inset_faces(by_edge, border_inset=h) for point in face]
        brute_force = min(math.dist(a, b) for i, a in enumerate(actual_points)
                          for b in actual_points[i + 1:])
        self.assertEqual(function.face_count, len(data['mesh']['faces_vertices']))
        self.assertAlmostEqual(function(h), brute_force, places=10)
        curve = function.plot_samples(0, .1, 5)
        self.assertEqual(len(curve['insets']), 5)
        self.assertEqual(len(curve['separations']), 5)
        self.assertAlmostEqual(curve['separations'][0], 0)
        self.assertGreater(curve['separations'][1], 0)

    def test_seven_chord_star_query_is_rotation_invariant(self):
        lines, boundary = chord_lines([[0, .4, .03]], 7)
        mesh = arrangement(lines, boundary)['mesh']
        original = inset_separation_from_mesh(mesh)
        theta = math.pi / 7
        rotated = [[x * math.cos(theta) - y * math.sin(theta),
                    x * math.sin(theta) + y * math.cos(theta)]
                   for x, y in mesh['vertices_coords']]
        other = inset_separation_fn(rotated, mesh['edges_vertices'], mesh['faces_vertices'])
        self.assertEqual((original.face_count, original.point_count), (22, 84))
        for h in (.01, .015, .04, .08):
            self.assertAlmostEqual(original(h), other(h), places=10)
        self.assertAlmostEqual(original.first_positive_collision(.1),
                               other.first_positive_collision(.1), places=10)

    def test_invalid_graphs_and_queries_rejected(self):
        square = [[0, 0], [1, 0], [1, 1], [0, 1]]
        edges = [[0, 1], [1, 2], [2, 3], [3, 0]]
        for vertices, graph, faces in (
            ([[0, 0], [1, math.inf], [1, 1]], edges, None),
            (square, edges + [[0, 1]], None),
            (square, edges + [[0, 4]], None),
            (square, edges, [[0, 1, 1]]),
            (square, edges, [[0, 1, 3]]),
            ([[0, 0], [.5, 0], [1, 0], [1, 1], [0, 1]],
             [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]],
             [[0, 1, 2, 3, 4]]),
        ):
            with self.subTest(vertices=vertices, graph=graph, faces=faces), self.assertRaises(ValueError):
                inset_separation_fn(vertices, graph, faces)
        function = inset_separation_fn(square, edges)
        for value in (True, -1, math.inf, math.nan, '0.1'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                function(value)
        for start, stop, count in ((0, 0, 2), (-.1, .2, 2), (0, .2, 1), (0, .2, 202), (0, 101, 2)):
            with self.subTest(start=start, stop=stop, count=count), self.assertRaises(ValueError):
                function.plot_samples(start, stop, count)

    def test_worker_query_uses_all_three_current_line_modes(self):
        from tessellate import dispatch_request
        for mode in ('lines', 'chord', 'random'):
            with self.subTest(mode=mode):
                request = {'operation': 'woven-inset-separation',
                           'params': {'family': 'woven-lines', 'mode': mode},
                           'start': 0, 'stop': .2, 'count': 7}
                response = dispatch_request(request)
                self.assertEqual(len(response['insets']), 7)
                self.assertEqual(len(response['separations']), 7)
                self.assertTrue(all(math.isfinite(v) for v in response['separations']))
                self.assertGreater(response['faceCount'], 0)
                self.assertTrue(response['uniformInset'])
                self.assertAlmostEqual(response['firstPositiveVertexCollision'],
                                       woven_inset_separation_query(request)['firstPositiveVertexCollision'])
        for request in ({'params': {}},
                        {'params': {'family': 'woven-lines'}, 'count': 202},
                        {'params': {'family': 'woven-lines'}, 'start': .2, 'stop': .1},
                        {'params': {'family': 'woven-lines'}, 'unexpected': 1}):
            with self.subTest(request=request), self.assertRaises(ValueError):
                woven_inset_separation_query(request)


if __name__ == '__main__':
    unittest.main()
