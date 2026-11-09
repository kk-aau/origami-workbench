"""Origamica 15.0 planar MakeFlasher CP/FF and fold-assignment anchors."""

from collections import Counter
import math
import unittest

from tessellation_flasher import flasher_default_cp_point, flasher_sector_quads
from tessellation_flasher_solver import flasher_default_ff_point, solve_flasher


class FlasherSolverTests(unittest.TestCase):
    def test_default_folded_form_rule_has_original_radial_and_height_factors(self):
        # In[4147]-In[4153]: Tan[π/m] multiplies *both* the radial vector and
        # the height term, hence height=t^2 for i=0,j=1,h=2,m=5.
        t = math.tan(math.pi / 5)
        center = flasher_default_ff_point(0, 0, 0, 2, 5, 0)
        raised = flasher_default_ff_point(0, 1, 0, 2, 5, 0)
        self.assertAlmostEqual(center[0], raised[0], places=12)
        self.assertAlmostEqual(center[1], raised[1], places=12)
        self.assertAlmostEqual(center[2], 0., places=12)
        self.assertAlmostEqual(raised[2], t * t, places=12)
        self.assertAlmostEqual(flasher_default_ff_point(0, 0, 0, 2, 4, 0)[0], -.5)

    def test_saved_make_flasher_inputs_solve_global_isometric_facets(self):
        # In[4194] and In[4195] use TypeMinimumAngle→10°.
        for m, dr, diagonal in ((4, .05, 'Y'), (5, .1, 'Z')):
            with self.subTest(m=m, diagonal=diagonal):
                result = solve_flasher(2, 2, m, dr, diagonal,
                                       minimum_angle_deg=10)
                self.assertEqual(len(result['vertex_ij']), 15)
                self.assertEqual(len(result['edge_references']), 39)
                self.assertEqual(len(result['vertex_ijk']), 15 * m)
                self.assertEqual(len(result['quads_vertices']), 10 * m)
                self.assertEqual(len(result['source_triangles_vertices']), 4 * m)
                self.assertEqual(len(result['faces_vertices']), 24 * m)
                self.assertEqual(len(result['edges_vertices']), 39 * m)
                self.assertLess(result['isometryResidualSum'], 1e-6)
                self.assertLess(result['maxFaceEdgeError'], 1e-10)
                self.assertGreater(result['minimumCPFaceArea'], .1)
                self.assertGreater(result['minimumFFFaceArea'], .1)
                self.assertEqual(Counter(result['edge_types']),
                                 Counter({'V': 12 * m, 'M': 12 * m,
                                          'U': 10 * m, 'B': 5 * m}))

                labels = {tuple(v): i for i, v in enumerate(result['vertex_ij'])}
                for ij, cp, ff in zip(result['vertex_ij'],
                                      result['cp_first_sector'],
                                      result['ff_first_sector']):
                    desired_xy = flasher_default_ff_point(*ij, 0, 2, m, dr)
                    self.assertAlmostEqual(ff[0], desired_xy[0], places=11)
                    self.assertAlmostEqual(ff[1], desired_xy[1], places=11)
                    self.assertTrue(all(math.isfinite(v) for v in (*cp, *ff)))
                center = labels[(0, 0)]
                original_center = flasher_default_cp_point(0, 0, 0, m)
                for got, want in zip(result['cp_first_sector'][center], original_center):
                    self.assertAlmostEqual(got, want, places=10)
                self.assertAlmostEqual(result['ff_first_sector'][center][2], 0., places=11)

                cp = result['vertices_coords']
                ff = result['folded_vertices_coords']
                for face in result['faces_vertices']:
                    for a, b in zip(face, face[1:] + face[:1]):
                        self.assertAlmostEqual(math.dist(cp[a], cp[b]),
                                               math.dist(ff[a], ff[b]), places=9)
                center_face = result['center_vertices']
                for a, b in zip(center_face, center_face[1:] + center_face[:1]):
                    self.assertAlmostEqual(math.dist(cp[a], cp[b]),
                                           math.dist(ff[a], ff[b]), places=9)

    def test_fold_types_follow_notebook_sharp_medium_light_and_border_examples(self):
        # In[4108]-[4110], [4120], [1445], [1809] and [1825]. The first
        # quad's Y/Z light diagonal stays U at the saved 10° threshold.
        for m, dr, diagonal in ((4, .05, 'Y'), (5, .1, 'Z')):
            with self.subTest(m=m, diagonal=diagonal):
                result = solve_flasher(2, 2, m, dr, diagonal,
                                       minimum_angle_deg=10)
                labels = {tuple(v): i for i, v in enumerate(result['vertex_ijk'])}
                types = {frozenset(edge): kind for edge, kind in
                         zip(result['edges_vertices'], result['edge_types'])}

                def edge_type(a, b):
                    return types[frozenset((labels[a], labels[b]))]

                self.assertEqual(edge_type((1, 0, 0), (0, 0, 0)), 'V')
                self.assertEqual(edge_type((2, 2, 0), (1, 2, 0)), 'M')
                self.assertEqual(edge_type((0, 0, m - 1), (0, 1, 0)), 'M')
                self.assertEqual(edge_type((1, 2, 0), (2, 3, 0)), 'V')
                self.assertEqual(edge_type((4, 4, 0), (3, 4, 0)), 'B')
                quad = flasher_sector_quads(2, 2, m)[0]
                light = (quad[0], quad[2]) if diagonal == 'Y' else (quad[1], quad[3])
                self.assertEqual(edge_type(*light), 'U')

    def test_solver_rejects_nonconverged_or_invalid_inputs(self):
        with self.assertRaises(ValueError):
            solve_flasher(2, 2, 4, .05, 'W')
        with self.assertRaises(ValueError):
            solve_flasher(2, 2, 4, .05, minimum_angle_deg=180)
        with self.assertRaises(ValueError):
            solve_flasher(2, 2, 4, .05, max_nfev=1)


if __name__ == '__main__':
    unittest.main()
