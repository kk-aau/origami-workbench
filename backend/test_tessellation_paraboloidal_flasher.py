"""Origamica In[4204]/In[4209] paraboloidal DP, FF and cut-net anchors."""

from collections import Counter
import math
import unittest

from tessellation_flasher import flasher_default_cp_point
from tessellation_flasher_solver import flasher_default_ff_point
from tessellation_paraboloidal_flasher import (
    cut_paraboloidal_flasher, paraboloidal_default_dp_point,
    solve_paraboloidal_flasher,
)


class ParaboloidalFlasherTests(unittest.TestCase):
    def test_default_dp_is_a_rotated_paraboloid_and_not_a_flat_pattern(self):
        # In[4103]: the ideal DP takes the same XY seed as planar Flasher and
        # applies z=(x²+y²)/(4f) after the rotational copy is constructed.
        for m in (4, 5, 6):
            for i, j in ((0, 0), (1, 0), (1, 2), (3, 4)):
                with self.subTest(m=m, ij=(i, j)):
                    first = paraboloidal_default_dp_point(i, j, 0, m, 6)
                    rotated = paraboloidal_default_dp_point(i, j, 1, m, 6)
                    x, y = flasher_default_cp_point(i, j, 0, m)
                    self.assertAlmostEqual(first[0], x, places=12)
                    self.assertAlmostEqual(first[1], y, places=12)
                    self.assertAlmostEqual(first[2], (x*x + y*y) / 24, places=12)
                    self.assertAlmostEqual(math.hypot(*first[:2]),
                                           math.hypot(*rotated[:2]), places=12)
                    self.assertAlmostEqual(first[2], rotated[2], places=12)

    def test_saved_examples_solve_and_original_cuts_unfold_isometrically(self):
        # The notebook saves these INPUTS, not numeric Out vertex tables:
        # In[4205] Y; In[4206] flat limit; In[4207] Z; In[4208] deep bowl;
        # In[4210] Z with the CutParaboloidalFlasher example.
        cases = (
            ((2, 2, 4, 6, .05, 'Y'), 10, 10, (60, 100, 196, 97, 40)),
            ((2, 2, 4, 1e6, .05, 'Y'), 10, 10, (60, 100, 196, 97, 40)),
            ((2, 2, 5, 6, .1, 'Z'), 10, 10, (75, 125, 245, 121, 50)),
            ((2, 3, 6, 5, .2, 'Y'), 20, 20, (126, 222, 438, 217, 96)),
            ((2, 2, 5, 3, .1, 'Z'), 20, 180, (75, 125, 245, 121, 50)),
        )
        for args, angle, cut_angle, expected in cases:
            with self.subTest(args=args):
                solved = solve_paraboloidal_flasher(*args,
                    minimum_angle_deg=angle)
                cut = cut_paraboloidal_flasher(solved,
                                              minimum_angle_deg=cut_angle)
                source_count, vertex_count, edge_count, face_count, cut_count = expected
                self.assertEqual(len(solved['vertex_ijk']), source_count)
                self.assertEqual(len(solved['edges_vertices']), edge_count - cut_count)
                self.assertEqual(len(solved['faces_vertices']), face_count)
                self.assertEqual(len(solved['faces_vertices'][-1]), args[2])
                self.assertEqual((len(cut['vertices_coords']),
                                  len(cut['edges_vertices']),
                                  len(cut['faces_vertices']),
                                  len(cut['source_cut_edges_vertices'])),
                                 (vertex_count, edge_count, face_count, cut_count))
                self.assertEqual(len(cut['audit_triangles_vertices']),
                                 face_count + args[2] - 3)
                self.assertEqual(len(cut['deployed_vertices_coords']), vertex_count)
                self.assertEqual(len(cut['folded_vertices_coords']), vertex_count)
                self.assertEqual(len(cut['source_vertex_indices']), vertex_count)
                self.assertTrue(cut['hasTruePlanarDevelopment'])
                self.assertFalse(solved['hasTruePlanarDevelopment'])
                self.assertLess(solved['isometryResidualSum'], 1e-6)
                self.assertLess(cut['maxFlatDPFaceEdgeError'], 1e-10)
                self.assertLess(cut['maxFlatFFFaceEdgeError'], 1e-10)
                self.assertGreater(cut['minimumFlatFaceArea'], 1e-8)

                xy = cut['vertices_coords']
                dp = cut['deployed_vertices_coords']
                ff = cut['folded_vertices_coords']
                for face in cut['faces_vertices']:
                    for position, u in enumerate(face):
                        for v in face[position + 1:]:
                            self.assertAlmostEqual(math.dist(xy[u], xy[v]),
                                                   math.dist(dp[u], dp[v]), places=9)
                            self.assertAlmostEqual(math.dist(xy[u], xy[v]),
                                                   math.dist(ff[u], ff[v]), places=9)

                # Cuts duplicate source vertices but retain their exact 3D
                # positions, so all three coordinate arrays share indices.
                for copy, original in enumerate(cut['source_vertex_indices']):
                    self.assertEqual(dp[copy], solved['deployed_vertices_coords'][original])
                    self.assertEqual(ff[copy], solved['folded_vertices_coords'][original])
                source_edges = {tuple(sorted(edge)) for edge in solved['edges_vertices']}
                self.assertTrue({tuple(edge) for edge in cut['source_cut_edges_vertices']}
                                <= source_edges)
                self.assertEqual(Counter(cut['edge_types'])['B'], vertex_count)
                self.assertEqual(vertex_count - edge_count + face_count, 1)
                if cut_angle == angle:
                    source_types = {tuple(sorted(edge)): kind for edge, kind in
                                    zip(solved['edges_vertices'], solved['edge_types'])}
                    for edge, kind in zip(cut['edges_vertices'], cut['edge_types']):
                        if kind != 'B':
                            original = tuple(sorted(cut['source_vertex_indices'][i]
                                                    for i in edge))
                            self.assertEqual(kind, source_types[original])
                if cut_angle == 180:
                    self.assertEqual(Counter(cut['edge_types']),
                                     Counter({'B': vertex_count,
                                              'U': edge_count - vertex_count}))

                # The original fixed FF XY positions survive the solve; its
                # center is z=0 while deployed DP has positive focal sag.
                labels = {tuple(label): pos for pos, label in enumerate(solved['vertex_ijk'])}
                center = labels[0, 0, 0]
                self.assertAlmostEqual(solved['folded_vertices_coords'][center][2],
                                       0., places=10)
                self.assertGreater(solved['deployed_vertices_coords'][center][2], 0.)
                first_ff = solved['folded_vertices_coords'][labels[1, 0, 0]]
                default_ff = flasher_default_ff_point(1, 0, 0,
                                                       args[1], args[2], args[4])
                self.assertAlmostEqual(first_ff[0], default_ff[0], places=11)
                self.assertAlmostEqual(first_ff[1], default_ff[1], places=11)

    def test_vertical_projection_is_not_the_cut_development(self):
        solved = solve_paraboloidal_flasher(2, 2, 5, 3, .1, 'Z')
        cut = cut_paraboloidal_flasher(solved)
        projection = solved['projected_vertices_coords']
        deployed = solved['deployed_vertices_coords']
        projection_error = max(
            abs(math.dist(projection[u], projection[v]) -
                math.dist(deployed[u], deployed[v]))
            for face in solved['faces_vertices']
            for u, v in ((face[0], face[1]), (face[1], face[2]),
                         (face[2], face[0]))
        )
        self.assertGreater(projection_error, .3)
        self.assertLess(cut['maxFlatDPFaceEdgeError'], 1e-10)

    def test_rejects_bad_parameters_and_unconverged_root(self):
        for args in ((2, 2, 5, 0, .1, 'Z'),
                     (2, 2, 5, True, .1, 'Z'),
                     (2, 2, 5, 3, float('nan'), 'Z'),
                     (2, 2, 5, 3, .1, 'Q'),
                     (3, 3, 5, 3, .1, 'Y')):
            with self.subTest(args=args), self.assertRaises(ValueError):
                solve_paraboloidal_flasher(*args)
        with self.assertRaises(ValueError):
            solve_paraboloidal_flasher(2, 2, 5, 3, .1, 'Z', max_nfev=1)
        with self.assertRaises(ValueError):
            cut_paraboloidal_flasher({'kind': 'flasher-ideal-cp-seed'})
        solved = solve_paraboloidal_flasher(1, 1, 4, 6, .05)
        with self.assertRaises(ValueError):
            cut_paraboloidal_flasher(solved, minimum_angle_deg=181)


if __name__ == '__main__':
    unittest.main()
