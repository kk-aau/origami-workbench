"""Origamica In[3999]/In[4002] cone right-extension regression checks."""

import math
import unittest

import sympy as sp

from tessellation_curved_across_right_cone import (
    FAMILY, ConeAcrossRight, certify_cone_across_right,
)


def _zero(expr):
    return sp.trigsimp(sp.simplify(expr)) == 0


class ConeAcrossRightTests(unittest.TestCase):
    def test_saved_inputs_and_source_derived_anchors(self):
        # In[3999] is theta=30 degrees and u in [-pi/2,pi/2].  The
        # notebook stores graphics input, not a pointwise Wolfram output.
        pair = certify_cone_across_right()
        self.assertEqual(pair.fold_angle_deg, 120)
        f = pair.frame(0)
        self.assertEqual(f['flatCrease'], (0.0, 1.0))
        self.assertEqual(f['flatLeftRuling'], (-0.0, -1.0))
        self.assertEqual(f['flatRightRuling'], (0.0, 1.0))
        for name, wanted in (
            ('foldedCrease', (0, math.sqrt(3) / 2, .5)),
            ('foldedLeftRuling', (0, -math.sqrt(3) / 2, -.5)),
            ('foldedRightRuling', (0, -math.sqrt(3) / 2, .5)),
        ):
            for actual, expected in zip(f[name], wanted):
                self.assertAlmostEqual(actual, expected, 14)
        for u in (pair.parameter_start, pair.parameter_end):
            f = pair.frame(u)
            self.assertAlmostEqual(sum(x * x for x in f['flatCrease']), 1, 14)
            self.assertAlmostEqual(sum(x * x for x in f['foldedCrease']), 1, 14)

    def test_original_three_dimensional_branch_is_unique_on_this_domain(self):
        # The 3D/Both source law has u_R'=-cos(theta) T.  Its sign is
        # negative and magnitude nonzero for 0<theta<pi/2, fixing the
        # source's c_rho_R=0, s_rho_R=1 branch and r_R=-l_R.
        t, u = sp.symbols('t u', real=True)
        a, b = sp.sin(t), sp.cos(t)
        tangent = sp.Matrix([-sp.cos(u), 0, -sp.sin(u)])
        normal = sp.Matrix([sp.sin(u), 0, -sp.cos(u)])
        binormal = sp.Matrix([0, -1, 0])
        crease = sp.Matrix([-a * sp.sin(u), b, a * sp.cos(u)])
        left = -crease
        left_face_normal = tangent.cross(left)
        left_transverse = left_face_normal.cross(tangent)
        eta_cos = sp.trigsimp(left_transverse.dot(normal))
        eta_sin = sp.trigsimp(left_face_normal.dot(normal))
        self.assertTrue(_zero(eta_cos - a))
        self.assertTrue(_zero(eta_sin + b))
        candidate_normal = -eta_sin * normal + eta_cos * binormal
        candidate_transverse = eta_cos * normal + eta_sin * binormal
        self.assertTrue(all(_zero(x) for x in
                            sp.diff(candidate_normal, u) + b * tangent))
        self.assertTrue(_zero(sp.diff(candidate_normal, u).dot(
            candidate_transverse)))
        right = -candidate_transverse
        source_result = sp.Matrix([-a * sp.sin(u), -b, a * sp.cos(u)])
        self.assertTrue(all(_zero(x) for x in right - source_result))
        # Across the shared crease, the right face orientation reverses.
        oriented_right_normal = -tangent.cross(right)
        self.assertTrue(_zero(left_face_normal.dot(oriented_right_normal)
                              - sp.cos(sp.pi - 2 * t)))

    def test_both_sides_have_identical_symbolic_first_forms(self):
        t, u, v = sp.symbols('t u v', real=True)
        a, b = sp.sin(t), sp.cos(t)
        flat_crease = sp.Matrix([-sp.sin(a * u), sp.cos(a * u)])
        folded_crease = sp.Matrix([-a * sp.sin(u), b, a * sp.cos(u)])
        rulings = {
            'left': (-flat_crease, -folded_crease, 1 - v),
            'right': (flat_crease,
                      sp.Matrix([-a * sp.sin(u), -b, a * sp.cos(u)]),
                      1 + v),
        }
        for side, (flat_ruling, folded_ruling, factor) in rulings.items():
            with self.subTest(side=side):
                forms = []
                for crease, ruling in ((flat_crease, flat_ruling),
                                       (folded_crease, folded_ruling)):
                    surface = crease + v * ruling
                    du, dv = sp.diff(surface, u), sp.diff(surface, v)
                    form = (du.dot(du), du.dot(dv), dv.dot(dv))
                    for actual, expected in zip(form, (a * a * factor * factor,
                                                       0, 1)):
                        self.assertTrue(_zero(actual - expected))
                    forms.append(form)
                    if len(crease) == 3:
                        self.assertTrue(_zero(sp.det(sp.Matrix.hstack(
                            sp.diff(crease, u), ruling, sp.diff(ruling, u)))))
                for x, y in zip(*forms):
                    self.assertTrue(_zero(x - y))
        # The sides share the exact same crease at v=0 in each space.
        self.assertEqual(flat_crease + 0 * rulings['left'][0],
                         flat_crease + 0 * rulings['right'][0])
        self.assertEqual(folded_crease + 0 * rulings['left'][1],
                         folded_crease + 0 * rulings['right'][1])

    def test_numeric_evaluation_keeps_one_seam_but_not_exact_chords(self):
        pair = certify_cone_across_right(theta_deg=30, left_width=.7,
                                         right_width=1.5)
        samples = pair.sample(curve_segments=2, ruling_segments=2)
        self.assertEqual(samples['family'], FAMILY)
        self.assertIs(samples['sideRows']['left'][0],
                      samples['sideRows']['right'][0])
        self.assertEqual(samples['creaseIndices'], [0, 1, 2])
        self.assertEqual(len(samples['flatSamples']), 15)
        self.assertEqual(len(samples['foldedSamples']), 15)
        for side in ('left', 'right'):
            for v in samples['rulingDistances'][side]:
                for u in samples['parameterValues']:
                    flat_form = pair.first_form(2, side, u, v)
                    folded_form = pair.first_form(3, side, u, v)
                    for actual, expected in zip(flat_form, folded_form):
                        self.assertAlmostEqual(actual, expected, 13)
                    target_e = .25 * (1 - v if side == 'left' else 1 + v) ** 2
                    self.assertAlmostEqual(flat_form[0], target_e, 13)
                    self.assertAlmostEqual(flat_form[1], 0, 13)
                    self.assertAlmostEqual(flat_form[2], 1, 13)
        # At the two crease endpoints, finite chords differ markedly even
        # though the continuous first fundamental forms coincide.
        flat_chord = math.dist(samples['flatSamples'][0],
                               samples['flatSamples'][2])
        folded_chord = math.dist(samples['foldedSamples'][0],
                                 samples['foldedSamples'][2])
        self.assertAlmostEqual(flat_chord, math.sqrt(2), 13)
        self.assertAlmostEqual(folded_chord, 1, 13)
        self.assertGreater(abs(flat_chord - folded_chord), .4)
        self.assertNotIn('faces', samples)

    def test_width_and_branch_boundary_are_rejected(self):
        for bad in (
            {'theta_deg': 0}, {'theta_deg': 90},
            {'theta_deg': True}, {'parameter_end': -math.pi / 2},
            {'parameter_end': 3 * math.pi / 2},
            {'left_width': 0}, {'left_width': 1},
            {'left_width': 1.2}, {'right_width': 0},
            {'right_width': math.inf},
        ):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                certify_cone_across_right(**bad)
        pair = certify_cone_across_right()
        with self.assertRaises(ValueError):
            ConeAcrossRight(30, -math.pi / 2, math.pi / 2, 1, .5)
        for action in (
            lambda: pair.frame(math.pi),
            lambda: pair.surface(3, 'left', 0, 1),
            lambda: pair.surface(2, 'right', 0, -.1),
            lambda: pair.first_form(4, 'right', 0, .2),
            lambda: pair.sample(curve_segments=True),
        ):
            with self.assertRaises(ValueError):
                action()


if __name__ == '__main__':
    unittest.main()
