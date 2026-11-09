"""Checks of the notebook's saved radius-four circle construction only."""

import math
import unittest

import numpy as np

from tessellation_huffman_column import (
    Circle4Audit, Circle4Parameters, HALF_PI, THIRD_RULING_OFFSET,
    solve_saved_circle4_closure,
)


class HuffmanCircle4Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = solve_saved_circle4_closure()

    def test_saved_four_condition_root_and_flat_anchors(self):
        model = self.model
        self.assertLess(np.linalg.norm(model.closure_residuals(), ord=np.inf), 2e-6)
        first, last = model.frame(0.0), model.frame(HALF_PI)
        np.testing.assert_allclose(first['f0'], (0, 0), atol=1e-12)
        np.testing.assert_allclose(first['f1'], (1, 0), atol=1e-12)
        np.testing.assert_allclose(first['f2'], (2, 0), atol=1e-12)
        np.testing.assert_allclose(last['f1'], (0, 1), atol=1e-12)
        self.assertAlmostEqual(last['q'], math.pi / 3, places=8)
        np.testing.assert_allclose(last['f2'], (0, 2 * math.sqrt(3)), atol=2e-8)
        self.assertAlmostEqual(last['f3'][0], 2.0)

    def test_middle_ruling_is_continuously_isometric(self):
        # Compare first fundamental forms via an independent finite difference
        # on the actual 2D/3D surface coordinates, away from switching times.
        model = self.model
        t = (model.parameters.first_cone_end + model.parameters.second_cone_start) / 2
        h = 2e-5

        def surface(u, width, folded):
            frame = model.frame(u)
            a, b = ('ff1', 'ff2') if folded else ('f1', 'f2')
            return (1 - width) * frame[a] + width * frame[b]

        for width in (0.0, 0.4, 1.0):
            flat_t = (surface(t + h, width, False) - surface(t - h, width, False)) / (2 * h)
            folded_t = (surface(t + h, width, True) - surface(t - h, width, True)) / (2 * h)
            flat_r = surface(t, 1, False) - surface(t, 0, False)
            folded_r = surface(t, 1, True) - surface(t, 0, True)
            for a, b in ((flat_t, folded_t), (flat_r, folded_r)):
                self.assertLess(abs(np.dot(a, a) - np.dot(b, b)), 3e-7)
            self.assertLess(abs(np.dot(flat_t, flat_r) - np.dot(folded_t, folded_r)), 3e-7)

    def test_first_cone_and_cylinder_director(self):
        model = self.model
        for t in np.linspace(0, HALF_PI, 9):
            frame = model.frame(float(t))
            self.assertLess(abs(np.linalg.norm(frame['ff1']) - 1), 2e-8)
            self.assertLess(abs(np.linalg.norm(frame['ff2'] - frame['ff1'])
                                - np.linalg.norm(frame['f2'] - frame['f1'])), 2e-8)
        start = model.parameters.first_cone_end + .05
        end = model.parameters.second_cone_start - .05
        for t in np.linspace(start, end, 7):
            self.assertLess(np.linalg.norm(model._instant_third_ruling(float(t)) - model._axis), 2e-8)

    def test_literal_third_ruling_offset_disproves_complete_isometry(self):
        model = self.model
        for t in (0.0, .8, HALF_PI):
            frame = model.frame(t)
            flat = np.linalg.norm(frame['f3'] - frame['f2'])
            folded = np.linalg.norm(frame['ff3'] - frame['ff2'])
            self.assertAlmostEqual(folded - flat, THIRD_RULING_OFFSET, places=9)
        self.assertIn('read-only', model.adoption_status)

    def test_saved_pair_display_transform_is_rigid(self):
        for item in self.model.paired_sample(8):
            base = item['base']
            flat = item['flatMirror']
            folded = item['foldedMirror']
            for a, b in ((0, 1), (1, 2), (2, 3)):
                self.assertAlmostEqual(
                    np.linalg.norm(base[f'f{a}'] - base[f'f{b}']),
                    np.linalg.norm(flat[f'f{a}'] - flat[f'f{b}']), places=9,
                )
                self.assertAlmostEqual(
                    np.linalg.norm(base[f'ff{a}'] - base[f'ff{b}']),
                    np.linalg.norm(folded[f'ff{a}'] - folded[f'ff{b}']), places=9,
                )

    def test_bad_domains_rejected(self):
        for values in ((0, 1, 1, -1), (.5, .4, 1, -1),
                       (.5, 1.2, 0, -1), (.5, 1.2, 1, 0)):
            with self.subTest(values=values), self.assertRaises(ValueError):
                Circle4Parameters(*values)
        with self.assertRaises(ValueError):
            Circle4Audit(Circle4Parameters(.5, 1.2, 1, -1)).frame(HALF_PI + .1)


if __name__ == '__main__':
    unittest.main()
