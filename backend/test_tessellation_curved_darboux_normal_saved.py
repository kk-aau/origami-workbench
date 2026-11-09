import math
import unittest

import tessellation_curved_darboux_normal_saved as m


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1],
            a[2]*b[0]-a[0]*b[2],
            a[0]*b[1]-a[1]*b[0])


class DarbouxNormalSavedTests(unittest.TestCase):
    def test_saved_source_contract(self):
        self.assertEqual(m.saved_input('3812')['sourceFunction'],
                         'RecoverDarboux3D')
        self.assertEqual(m.saved_input('3816')['sourceFunction'],
                         'NRecoverDarboux3D')
        self.assertEqual(m.saved_input('3818')['sourceFunction'],
                         'RuledSurfaceNormal')
        self.assertEqual(m.saved_input('3818')['orientations'], (1, -1))
        for cell in ('3812', '3816', '3818'):
            self.assertFalse(m.saved_input(cell)['wolframNumericOutAvailable'])
            self.assertFalse(m.saved_input(cell)['exactFOLD'])
        with self.assertRaises(ValueError):
            m.saved_input('3819')

    def test_analytic_frame_and_source_ode(self):
        self.assertEqual(m.analytic_darboux(0)['c'], (0, 0, 0))
        self.assertEqual(m.analytic_darboux(0)['t'], (1, 0, 0))
        self.assertEqual(m.analytic_darboux(0)['l'], (0, 1, 0))
        self.assertEqual(m.analytic_darboux(0)['n'], (0, 0, 1))
        for u in (.2, .7, 1.2, 2.6):
            f = m.analytic_darboux(u)
            for key in ('t', 'l', 'n'):
                self.assertAlmostEqual(dot(f[key], f[key]), 1)
            h = 1e-5
            for key, expected in (('c', f['t']), ('t', f['n']),
                                  ('n', tuple(-x for x in f['t']))):
                plus, minus = m.analytic_darboux(u+h)[key], m.analytic_darboux(u-h)[key]
                diff = [(a-b)/(2*h) for a, b in zip(plus, minus)]
                self.assertLess(math.dist(diff, expected), 2e-10)

    def test_local_rk4_replay(self):
        for i in range(9):
            u = math.pi*i/8
            exact, numeric = m.analytic_darboux(u), m.numeric_darboux(u)
            for key in ('c', 't', 'l', 'n'):
                self.assertLess(math.dist(exact[key], numeric[key]), 1e-10)
        self.assertFalse(m.saved_input('3816')['numericInterpolationReproduced'])
        with self.assertRaises(ValueError):
            m.numeric_darboux(.5, 8)

    def test_opposite_normals_and_regular_patch(self):
        for u in (-1.2, 0, .8, 2.5, 4):
            for v in (-1, -.4, 0, .6, 1):
                du, dv = m.hyperboloid_partials(u, v)
                up, down = m.hyperboloid_normal(u, v, 1), m.hyperboloid_normal(u, v, -1)
                area = m.hyperboloid_area(u, v)
                self.assertAlmostEqual(area, math.dist(cross(du, dv), (0, 0, 0)))
                self.assertGreaterEqual(area, math.sqrt(.5)-1e-15)
                self.assertAlmostEqual(dot(up, up), 1)
                self.assertAlmostEqual(dot(up, du), 0)
                self.assertAlmostEqual(dot(up, dv), 0)
                self.assertLess(math.dist(up, tuple(-x for x in down)), 1e-14)
                self.assertAlmostEqual(dot(up, cross(du, dv))/area, 1)

    def test_hyperboloid_not_developable(self):
        u, h = .8, 1e-5
        bp, bm = m.hyperboloid_base(u+h), m.hyperboloid_base(u-h)
        dp, dm = m.hyperboloid_director(u+h), m.hyperboloid_director(u-h)
        bu = [(a-b)/(2*h) for a, b in zip(bp, bm)]
        du = [(a-b)/(2*h) for a, b in zip(dp, dm)]
        self.assertAlmostEqual(dot(bu, cross(m.hyperboloid_director(u), du)), -.5)

    def test_in3795_saved_surface_and_curve(self):
        saved = m.sinusoid_saved_input()
        self.assertEqual(saved['surfaceXRange'], (-1, .5))
        self.assertEqual(saved['surfaceYRange'], (-1, 1))
        self.assertEqual(saved['curveRange'], (-1, 1))
        self.assertEqual(saved['frameAt'], .5)
        self.assertEqual(saved['vectorLength'], .3)
        self.assertFalse(saved['numericWolframOutAvailable'])
        self.assertFalse(saved['exactFOLD'])
        h = 1e-5
        for t in (-1, -.5, 0, .5, 1):
            point = m.sinusoid_curve(t)
            self.assertLess(math.dist(point, m.sinusoid_surface(math.cos(t)-1, t)), 1e-14)
            self.assertAlmostEqual(point[0]+point[2], 0)
            derivative = tuple((a-b)/(2*h) for a, b in zip(
                m.sinusoid_curve(t+h), m.sinusoid_curve(t-h))) if abs(t) < 1 else None
            if derivative is not None:
                self.assertLess(math.dist(derivative, (-math.sin(t), 1, math.sin(t))), 2e-10)
        with self.assertRaises(ValueError):
            m.sinusoid_curve(1.01)
        with self.assertRaises(ValueError):
            m.sinusoid_surface(.51, 0)

    def test_in3795_frenet_darboux_source_definitions(self):
        h = 1e-5
        for t in (-.8, -.35, 0, .5, .8):
            frame = m.sinusoid_frame(t)
            tangent, normal, binormal = [frame[key] for key in
                                         ('tangent', 'normal', 'binormal')]
            lateral, up = frame['tangentNormal'], frame['surfaceNormal']
            self.assertGreaterEqual(frame['speed'], 1)
            self.assertGreater(frame['curvature'], 0)
            for vector in (tangent, normal, binormal, lateral, up):
                self.assertAlmostEqual(dot(vector, vector), 1)
            for a, b in ((tangent, normal), (tangent, binormal), (normal, binormal),
                         (tangent, lateral), (tangent, up), (lateral, up)):
                self.assertAlmostEqual(dot(a, b), 0)
            self.assertLess(math.dist(cross(tangent, normal), binormal), 1e-14)
            self.assertLess(math.dist(cross(up, tangent), lateral), 1e-14)
            plus, minus = m.sinusoid_frame(t+h), m.sinusoid_frame(t-h)
            derivative = lambda key: tuple((a-b)/(2*h) for a, b in
                                           zip(plus[key], minus[key]))
            dt, du = derivative('tangent'), derivative('surfaceNormal')
            speed = frame['speed']
            self.assertAlmostEqual(dot(dt, normal)/speed, frame['curvature'], places=9)
            self.assertAlmostEqual(dot(dt, lateral)/speed,
                                   frame['geodesicCurvature'], places=9)
            self.assertAlmostEqual(dot(dt, up)/speed,
                                   frame['normalCurvature'], places=9)
            self.assertAlmostEqual(-dot(lateral, du)/speed,
                                   frame['geodesicTorsion'], places=9)
            self.assertAlmostEqual(frame['curvature']**2,
                                   frame['geodesicCurvature']**2+frame['normalCurvature']**2)
            self.assertAlmostEqual(frame['point'][0]+frame['point'][2], 0)
            self.assertEqual(frame['torsion'], 0)
        at = m.sinusoid_frame(.5)
        self.assertAlmostEqual(at['geodesicCurvature'], .44871205032424505)
        self.assertAlmostEqual(at['normalCurvature'], .5421246987313315)
        self.assertAlmostEqual(at['geodesicTorsion'], -.234365936118935)


if __name__ == '__main__':
    unittest.main()
