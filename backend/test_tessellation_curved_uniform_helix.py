"""Origamica section 45, In[3945]/In[3951] smooth curved-fold checks."""

import math
import unittest

from tessellation_curved_uniform_helix import (
    FAMILY,
    uniform_helix_curved_fold_frame,
    uniform_helix_curved_fold_geometry,
    validate_uniform_helix_curved_fold,
)


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _surface(frame, side, distance, space):
    stem = 'flat' if space == 2 else 'folded'
    return [x + distance * d for x, d in zip(
        frame[f'{stem}Crease'], frame[f'{stem}{side}Ruling'])]


class UniformHelixCurvedFoldTests(unittest.TestCase):
    def test_saved_in_3947_and_3953_exact_start_and_end_anchors(self):
        # Both notebook graphics examples specify r=1, theta=30°, gamma=90°,
        # u in [0, pi].  These radicals follow independently from the source
        # formulas; ShowExample does not retain a numeric Wolfram output table.
        f0 = uniform_helix_curved_fold_frame(1, math.pi / 6, math.pi / 2, 0)
        self.assertEqual(f0['flatCrease'], [1, 0])
        self.assertEqual(f0['foldedCrease'], [1, 0, 0])
        expected = {
            'flatLeftRuling': [-math.sqrt(3 / 5), math.sqrt(2 / 5)],
            'flatRightRuling': [math.sqrt(3 / 5), math.sqrt(2 / 5)],
            'foldedLeftRuling': [-math.sqrt(3 / 10), math.sqrt(3 / 40),
                                 math.sqrt(5 / 8)],
            'foldedRightRuling': [math.sqrt(3 / 10), math.sqrt(3 / 40),
                                  math.sqrt(5 / 8)],
        }
        for key, values in expected.items():
            for actual, wanted in zip(f0[key], values):
                self.assertAlmostEqual(actual, wanted, 13)
        f_end = uniform_helix_curved_fold_frame(1, math.pi / 6, math.pi / 2,
                                                math.pi)
        self.assertAlmostEqual(f_end['foldedCrease'][0], -1, 13)
        self.assertAlmostEqual(f_end['foldedCrease'][1], 0, 13)
        self.assertAlmostEqual(f_end['foldedCrease'][2], math.pi / math.sqrt(3), 13)

        geometry = uniform_helix_curved_fold_geometry({'family': FAMILY})
        self.assertEqual(len(geometry['flatVertices']), 873)
        self.assertEqual(len(geometry['foldedVertices']), 873)
        self.assertEqual(len(geometry['faces']), 1536)
        self.assertEqual(geometry['creaseVertexIndices'], list(range(97)))
        self.assertAlmostEqual(geometry['parameters']['unfoldedCreaseRadius'],
                               4 * math.sqrt(2) / 3, 13)
        self.assertEqual(geometry['flatVertices'][0], [1, 0])
        self.assertEqual(geometry['foldedVertices'][0], [1, 0, 0])
        radius = 4 * math.sqrt(2) / 3
        for u in (0, .7, math.pi):
            flat = uniform_helix_curved_fold_frame(1, math.pi / 6,
                                                    math.pi / 2, u)['flatCrease']
            self.assertAlmostEqual(math.dist(flat, [1 - radius, 0]), radius, 12)
        # The notebook fixes the planar x-origin at one, even for r != 1.
        self.assertEqual(uniform_helix_curved_fold_frame(
            1.7, math.pi / 6, math.pi / 2, 0)['flatCrease'], [1, 0])

    def test_smooth_surfaces_are_developable_and_isometric(self):
        # Derivatives are measured from surface positions, rather than
        # reproducing the notebook's analytic derivatives in the test.
        examples = [(1, 30, 90), (1.7, -25, 60), (.8, 55, 120)]
        step = 1e-5
        for radius, theta_deg, gamma_deg in examples:
            theta, gamma = math.radians(theta_deg), math.radians(gamma_deg)
            with self.subTest(radius=radius, theta=theta_deg, gamma=gamma_deg):
                for u in (.15, 1.2, 2.8):
                    frame = uniform_helix_curved_fold_frame(radius, theta, gamma, u)
                    for side in ('Left', 'Right'):
                        for distance in (.1, .4, .8):
                            forms = []
                            for space in (2, 3):
                                plus = _surface(uniform_helix_curved_fold_frame(
                                    radius, theta, gamma, u + step), side,
                                    distance, space)
                                minus = _surface(uniform_helix_curved_fold_frame(
                                    radius, theta, gamma, u - step), side,
                                    distance, space)
                                du = [(a - b) / (2 * step)
                                      for a, b in zip(plus, minus)]
                                dv = frame[f'{"flat" if space == 2 else "folded"}{side}Ruling']
                                forms.append((_dot(du, du), _dot(du, dv), _dot(dv, dv)))
                            for flat_form, folded_form in zip(*forms):
                                self.assertAlmostEqual(flat_form, folded_form, 8)
                        self.assertAlmostEqual(_dot(frame[f'flat{side}Ruling'],
                                                    frame[f'flat{side}Ruling']), 1, 12)
                        self.assertAlmostEqual(_dot(frame[f'folded{side}Ruling'],
                                                    frame[f'folded{side}Ruling']), 1, 12)
                        before = uniform_helix_curved_fold_frame(
                            radius, theta, gamma, u - step)
                        after = uniform_helix_curved_fold_frame(
                            radius, theta, gamma, u + step)
                        tangent = [(a - b) / (2 * step) for a, b in zip(
                            after['foldedCrease'], before['foldedCrease'])]
                        ruling = frame[f'folded{side}Ruling']
                        ruling_derivative = [(a - b) / (2 * step)
                                             for a, b in zip(after[f'folded{side}Ruling'],
                                                             before[f'folded{side}Ruling'])]
                        self.assertAlmostEqual(_dot(tangent, _cross(
                            ruling, ruling_derivative)), 0, 8)

                    plus = uniform_helix_curved_fold_frame(radius, theta, gamma,
                                                             u + step)
                    minus = uniform_helix_curved_fold_frame(radius, theta, gamma,
                                                              u - step)
                    tangent = [(a - b) / (2 * step) for a, b in zip(
                        plus['foldedCrease'], minus['foldedCrease'])]
                    left = _cross(tangent, frame['foldedLeftRuling'])
                    right = _cross(tangent, frame['foldedRightRuling'])
                    # Right-side face winding is reversed to match the flat
                    # paper orientation, so its oriented normal is -right.
                    normal_cosine = -_dot(left, right) / math.sqrt(
                        _dot(left, left) * _dot(right, right))
                    self.assertAlmostEqual(normal_cosine, math.cos(gamma), 10)

    def test_sampled_surfaces_have_one_seam_and_convergent_chord_lengths(self):
        errors = []
        for segments in (48, 96):
            mesh = uniform_helix_curved_fold_geometry({
                'family': FAMILY, 'curveSegments': segments, 'rulingSegments': 4})
            edges = {tuple(sorted((a, b))) for face in mesh['faces']
                     for a, b in zip(face, face[1:] + face[:1])}
            maximum_error = max(abs(math.dist(mesh['flatVertices'][a],
                                              mesh['flatVertices'][b]) -
                                    math.dist(mesh['foldedVertices'][a],
                                              mesh['foldedVertices'][b]))
                                for a, b in edges)
            errors.append(maximum_error)
            self.assertEqual(len(mesh['creaseVertexIndices']), segments + 1)
            self.assertEqual(len(mesh['faces']), 16 * segments)
            self.assertEqual(set(mesh['faceSides']), {'left', 'right'})
            self.assertTrue(all(math.isfinite(c) for point in mesh['foldedVertices']
                                for c in point))
            for a, b, c in mesh['faces']:
                p, q, r = (mesh['flatVertices'][index] for index in (a, b, c))
                twice_area = ((q[0] - p[0]) * (r[1] - p[1]) -
                              (q[1] - p[1]) * (r[0] - p[0]))
                self.assertGreater(twice_area, 0)
        self.assertLess(errors[1], errors[0] / 6)
        self.assertLess(errors[1], 2e-6)

    def test_rejects_singular_or_overwide_surface(self):
        for bad in (
            {'radius': 0}, {'helicityAngleDeg': 90}, {'foldAngleDeg': 0},
            {'foldAngleDeg': 180}, {'rulingLength': 1.5},
            {'curveSegments': True}, {'rulingSegments': 0},
            {'parameterEnd': 0}, {'unknown': 1},
        ):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                validate_uniform_helix_curved_fold({'family': FAMILY, **bad})
        for gamma in (0, -0.2, math.pi):
            with self.assertRaises(ValueError):
                uniform_helix_curved_fold_frame(1, 0.2, gamma, 0)


if __name__ == '__main__':
    unittest.main()
