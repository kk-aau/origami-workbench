"""Focused checks against Origamica 15.0 section 46, In[4097–4195]."""

import math
import unittest

from tessellation_flasher import (
    flasher_default_cp_point,
    flasher_ideal_cp_seed,
    flasher_sector_quads,
    flasher_sector_triangles,
)


class FlasherIdealCPSeedTests(unittest.TestCase):
    def assert_point(self, actual, expected):
        for got, want in zip(actual, expected):
            self.assertAlmostEqual(got, want, places=10)

    def test_default_cp_rule_has_original_unit_incircle_and_sector_wrap(self):
        # In[4099] and In[4102]: regular central polygon with inradius 1/2.
        for m in (4, 5, 6):
            center = [flasher_default_cp_point(0, 0, k, m) for k in range(m)]
            for a, b in zip(center, center[1:] + center[:1]):
                self.assertAlmostEqual(abs(a[0] * b[1] - a[1] * b[0]) / math.dist(a, b), .5)
            for j in range(5):
                for k in range(m):
                    self.assert_point(flasher_default_cp_point(-1, j, k, m),
                                      flasher_default_cp_point(j, 0, k - 1, m))
        self.assert_point(flasher_default_cp_point(0, 0, 0, 4), [-.5, .5])
        self.assert_point(flasher_default_cp_point(1, 0, 0, 4), [-1.5, .5])

    def test_sector_quads_follow_original_major_then_minor_index_order(self):
        # In[4116] with the MakeFlasher In[4194] r=2,h=2,m=4 parameters.
        quads = flasher_sector_quads(2, 2, 4)
        self.assertEqual(len(quads), 10)
        self.assertEqual(quads[0], ((1, 0, 0), (0, 0, 0), (0, 1, 0), (1, 2, 0)))
        self.assertEqual(quads[1], ((2, 0, 0), (1, 0, 0), (1, 2, 0), (2, 2, 0)))
        self.assertTrue(all(len(set(quad)) == 4 for quad in quads))
        self.assertEqual(len(flasher_sector_quads(2, 2, 5)), 10)

    def test_make_flasher_saved_examples_seed_topology_and_diagonal_choice(self):
        # In[4194] uses m=4/default Y; In[4195] uses m=5/Z. Their MakeFlasher
        # outputs additionally require FindRoot and are not asserted here.
        for m, diagonal in ((4, 'Y'), (5, 'Z')):
            seed = flasher_ideal_cp_seed(2, 2, m, diagonal)
            self.assertEqual(len(seed['quads_vertices']), 10 * m)
            self.assertEqual(len(seed['faces_vertices']), 24 * m)
            self.assertEqual(len(seed['source_triangles_vertices']), 4 * m)
            self.assertEqual(len(seed['vertices_coords']), 15 * m)
            self.assertEqual(len(seed['light_diagonals_vertices']), 10 * m)
            self.assertEqual(len(seed['center_vertices']), m)
            self.assertEqual(seed['radialOrder'], 4)
            self.assertFalse(any(seed[key] for key in ('deployedPattern', 'solvedCreasePattern',
                                                       'mountainValleyAssigned', 'foldedForm',
                                                       'isometryVerified')))
            for quad, line, faces in zip(seed['quads_vertices'],
                                         seed['light_diagonals_vertices'],
                                         (seed['faces_vertices'][i:i + 2]
                                          for i in range(0, 20 * m, 2))):
                self.assertEqual(line, [quad[0], quad[2]] if diagonal == 'Y'
                                 else [quad[1], quad[3]])
                self.assertEqual(set(faces[0] + faces[1]), set(quad))
            labels = [tuple(label) for label in seed['vertex_ijk']]
            self.assertEqual(len(labels), len(set(labels)))
            for point, (i, j, k) in zip(seed['vertices_coords'], labels):
                self.assert_point(point, flasher_default_cp_point(i, j, k, m))

    def test_source_triangles_close_quad_limits(self):
        # In[4118]: the original graph has two major and two minor triangles
        # in each r=2 sector, in addition to the triangulated quads.
        self.assertEqual(flasher_sector_triangles(2, 2, 4), [
            ((0, 0, 0), (0, 0, 3), (0, 1, 0)),
            ((2, 2, 0), (1, 2, 0), (2, 3, 0)),
            ((1, 0, 3), (0, 0, 3), (0, 1, 0)),
            ((1, 3, 0), (1, 2, 0), (2, 3, 0)),
        ])

    def test_reference_rejects_unbounded_or_ambiguous_inputs(self):
        with self.assertRaises(ValueError):
            flasher_ideal_cp_seed(2, 2, 4, 'unknown')
        for args in ((0, 2, 4), (2, 0, 4), (2, 2, 2), (20, 5, 16), (True, 2, 4)):
            with self.subTest(args=args), self.assertRaises(ValueError):
                flasher_ideal_cp_seed(*args)


if __name__ == '__main__':
    unittest.main()
