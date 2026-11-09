import math
import unittest

import tessellation_curved_early_darboux_saved as m


class EarlyDarbouxSavedTests(unittest.TestCase):
    def test_source_metadata(self):
        for cell in m.CELLS:
            saved = m.saved_input(cell)
            self.assertEqual(saved['sourceCell'], f'In[{cell}]')
            self.assertFalse(saved['wolframNumericOutAvailable'])
            self.assertFalse(saved['exactFOLD'])
        self.assertEqual(m.saved_input('3793')['sourceFrameAt'], .15)
        self.assertEqual(m.saved_input('3793')['sourceVectorLength'], .1)
        self.assertEqual(m.saved_input('3794')['curveRange'], (-math.pi/2, math.pi/2))
        for cell in ('3796', '3797'):
            self.assertTrue(m.saved_input(cell)['printedBeforeNumericPlotAssignments'])
            self.assertEqual((m.saved_input(cell)['plotK1'],
                              m.saved_input(cell)['plotK2']), (1, 2))
        with self.assertRaises(ValueError):
            m.saved_input('3800')
        with self.assertRaises(ValueError):
            m.curve('3793', .301)

    def test_both_cylinders_share_saved_intersection(self):
        for t in (-math.pi/2, -1, -.4, 0, .7, math.pi/2):
            point = m.curve('3794', t)
            self.assertLess(math.dist(point, m.surface('3794', point[0], t)), 1e-14)
            self.assertLess(math.dist(point, m.surface('3794', point[2], t, 2)), 1e-14)
            self.assertAlmostEqual(point[0], point[2])
            self.assertAlmostEqual(point[1]**2+(1-point[0])**2, 1)
            normals = m.intersection_tangency(t)
            self.assertAlmostEqual(m.norm(m.cross(normals['surface1Normal'],
                                                  normals['surface2Normal'])),
                                   normals['normalCrossMagnitude'])
        self.assertAlmostEqual(m.intersection_tangency(math.pi/2)
                               ['normalCrossMagnitude'], 0)

    def test_paraboloid_curves_match_saved_parameter_paths(self):
        a, b = math.sqrt(3)/2, .5
        for cell in ('3793', '3796', '3797'):
            for t in (-.2, -.1, 0, .15, .2):
                bent = cell == '3797'
                x = a*t-(b*t*t if bent else 0)
                y = b*t+(a*t*t if bent else 0)
                self.assertLess(math.dist(m.curve(cell, t),m.surface(cell, x, y)), 1e-14)
                self.assertGreaterEqual(m.frame(cell, t)['surfaceArea'], 1)
        with self.assertRaises(ValueError):
            m.surface('3796', .31, 0)

    def test_differential_frames_are_orthonormal_and_satisfy_darboux_ode(self):
        h = 1e-5
        for cell in m.CELLS:
            values = (-1.3, -.7, 0, .8, 1.3) if cell == '3794' else (
                -.22, -.1, 0, .15, .22)
            for t in values:
                f = m.frame(cell, t)
                T, N, B, L, U = [f[key] for key in
                                 ('tangent', 'frenetNormal', 'binormal',
                                  'tangentNormal', 'surfaceNormal')]
                self.assertGreater(f['speed'], 0)
                self.assertGreater(f['curvature'], 0)
                for vector in (T, N, B, L, U):
                    self.assertAlmostEqual(m.dot(vector, vector), 1)
                for x, y in ((T, N), (T, B), (N, B), (T, L), (T, U), (L, U)):
                    self.assertAlmostEqual(m.dot(x, y), 0)
                self.assertLess(math.dist(m.cross(U, T), L), 1e-14)
                p, q = m.frame(cell, t+h), m.frame(cell, t-h)
                derivative = lambda key: tuple((a-b)/(2*h) for a, b in
                                               zip(p[key], q[key]))
                kg, kn, tg, speed = [f[key] for key in
                                     ('geodesicCurvature', 'normalCurvature',
                                      'geodesicTorsion', 'speed')]
                for key, expected in (
                    ('tangent', tuple(speed*(kg*l+kn*u) for l, u in zip(L, U))),
                    ('tangentNormal', tuple(speed*(-kg*tt+tg*u)
                                            for tt, u in zip(T, U))),
                    ('surfaceNormal', tuple(speed*(-kn*tt-tg*l)
                                            for tt, l in zip(T, L)))):
                    self.assertLess(math.dist(derivative(key), expected), 2e-8)
                self.assertAlmostEqual(f['curvature']**2, kg**2+kn**2)

    def test_fixed_plot_values_not_claimed_as_wolfram_print(self):
        expected = {
            '3793': (0, 3, math.sqrt(3)),
            '3794': (-1, 1, 0),
            '3796': (0, 1.25, math.sqrt(3)/4),
            '3797': (2, 1.25, math.sqrt(3)/4),
        }
        for cell, (kg, kn, tg) in expected.items():
            f = m.frame(cell, 0)
            self.assertAlmostEqual(f['geodesicCurvature'], kg)
            self.assertAlmostEqual(f['normalCurvature'], kn)
            self.assertAlmostEqual(f['geodesicTorsion'], tg)


if __name__ == '__main__':
    unittest.main()
