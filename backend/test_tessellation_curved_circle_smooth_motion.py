import math
import unittest

import tessellation_curved_circle_smooth_motion as m


def dot(x, y):
    return sum(a*b for a, b in zip(x, y))


def cross(x, y):
    return (x[1]*y[2]-x[2]*y[1], x[2]*y[0]-x[0]*y[2],
            x[0]*y[1]-x[1]*y[0])


class CircleSmoothMotionTests(unittest.TestCase):
    def test_source_target_in3992(self):
        c, h = .5, math.sqrt(3)/2
        for s in (0, math.pi/6, math.pi/2, math.pi):
            frame = m.crease_frame(1, s)
            er = (math.cos(s), math.sin(s), 0)
            self.assertLess(math.dist(frame['point'], er), 1e-14)
            self.assertLess(math.dist(frame['leftRuling'],
                                      (-c*er[0], -c*er[1], h)), 1e-14)
            self.assertLess(math.dist(frame['rightRuling'],
                                      (c*er[0], c*er[1], h)), 1e-14)
            self.assertLess(math.dist(m.motion_point(1, s, -1),
                                      ((1-c)*er[0], (1-c)*er[1], h)), 1e-14)
            self.assertLess(math.dist(m.motion_point(1, s, 1),
                                      ((1+c)*er[0], (1+c)*er[1], h)), 1e-14)
        self.assertLess(m.saved_endpoint_residual()['maximum'], 1e-15)

    def test_exact_flat_initial_paper(self):
        for s in (0, .4, 1.2, 2.5, math.pi):
            for w in (-1, -.7, 0, .3, 1):
                p = m.paper_point(s, w)
                self.assertLess(math.dist(m.motion_point(0, s, w), (*p, 0)), 1e-14)

    def test_metric_and_one_sided_normals_at_every_motion_stage(self):
        step = 1e-5
        for progress in (0, .15, .4, .75, 1):
            for s in (.3, 1, 2.2):
                frame = m.crease_frame(progress, s)
                self.assertAlmostEqual(dot(frame['leftNormal'],
                                           frame['rightNormal']),
                                       math.cos(m.TARGET_ANGLE*progress))
                for w in (-.95, -.4, 0, .3, .95):
                    side = -1 if w < 0 else 1
                    ds, dw = m.partials(progress, s, w, side).values()
                    form = m.first_fundamental_form(w)
                    self.assertAlmostEqual(dot(ds, ds), form['E'])
                    self.assertAlmostEqual(dot(ds, dw), form['F'])
                    self.assertAlmostEqual(dot(dw, dw), form['G'])
                    self.assertAlmostEqual(math.sqrt(dot(cross(ds, dw),
                                                         cross(ds, dw))),
                                           form['jacobian'])
                    plus, minus = m.motion_point(progress, s+step, w), m.motion_point(
                        progress, s-step, w)
                    d_numeric = tuple((a-b)/(2*step) for a, b in zip(plus, minus))
                    self.assertLess(math.dist(d_numeric, ds), 2e-10)
        with self.assertRaises(ValueError):
            m.partials(.5, .5, -.2, 1)

    def test_analytic_global_motion_certificate_domain(self):
        for p in (m.DEFAULT,
                  {'arcEnd': math.pi/2, 'leftWidth': .25, 'rightWidth': 2},
                  {'arcEnd': math.pi, 'leftWidth': 1.5, 'rightWidth': .1}):
            cert = m.certify(p)
            self.assertTrue(cert['metricIndependentOfProgress'])
            self.assertTrue(cert['focusFree'])
            self.assertTrue(cert['globalInjectiveEveryFrame'])
            self.assertTrue(cert['selfCollisionFreeEveryFrame'])
            self.assertFalse(cert['polyhedralRigidPathChecked'])
            self.assertFalse(cert['exactStraightCreaseFOLD'])
            self.assertTrue(cert['completeClosedMaterialDomain'])
            self.assertTrue(cert['includesFlatFrame'])
            self.assertTrue(cert['analyticMaterialInverse'])
            self.assertEqual(cert['paperThickness'], 0)
            self.assertGreater(cert['minimumRadialRadius'], 0)
            self.assertGreater(cert['minimumJacobian'], 0)
            self.assertLessEqual(cert['maximumAzimuthSweep'], math.pi+1e-15)
        cert = m.certify()
        self.assertAlmostEqual(cert['minimumRadialRadius'], .5)
        self.assertAlmostEqual(cert['minimumJacobian'], .5)
        self.assertAlmostEqual(cert['maximumAzimuthSweep'], math.pi)
        self.assertAlmostEqual(cert['minimumProjectedJacobian'], .25)
        with self.assertRaises(ValueError):
            m.validate({'arcEnd': math.pi, 'leftWidth': 2, 'rightWidth': 1})
        with self.assertRaises(ValueError):
            m.motion_point(1.01, .5, 0)
        with self.assertRaises(ValueError):
            m.motion_point(.5, .5, -1.01)

    def test_closed_domain_material_inverse_and_global_envelope(self):
        for p in (m.DEFAULT,
                  {'arcEnd': math.pi, 'leftWidth': 1.5, 'rightWidth': 2},
                  {'arcEnd': math.pi/8, 'leftWidth': .1, 'rightWidth': .1}):
            envelope = m.motion_envelope(p)
            for progress in (0, 1e-9, .1, .5, .9, 1):
                for s in (0, p['arcEnd']*.1, p['arcEnd']*.5, p['arcEnd']):
                    for w in (-p['leftWidth'], -p['leftWidth']*.5, 0,
                              p['rightWidth']*.5, p['rightWidth']):
                        point = m.motion_point(progress, s, w, p)
                        inverse = m.inverse_motion_point(progress, point, p)
                        self.assertAlmostEqual(inverse['s'], s)
                        self.assertAlmostEqual(inverse['w'], w)
                        self.assertLessEqual(math.hypot(*point[:2]),
                                             envelope['radialRadius']+1e-14)
                        self.assertGreaterEqual(point[2], envelope['minimumHeight']-1e-14)
                        self.assertLessEqual(point[2], envelope['maximumHeight']+1e-14)
        # The original analytic endpoint, supplied independently of motion_point.
        inverse = m.inverse_motion_point(1, (1.5*math.cos(.7),
                                            1.5*math.sin(.7), math.sqrt(3)/2))
        self.assertAlmostEqual(inverse['s'], .7)
        self.assertAlmostEqual(inverse['w'], 1)
        self.assertAlmostEqual(m.inverse_motion_point(0, (2.5, 0, 0))['w'], .5)
        for progress, point in ((0, (2.5, 0, .01)), (.5, (0, 0, 0)),
                                (.5, (2, -1, 0)), (1, (1, 0, .01)),
                                (.5, (math.nan, 1, 0)), (2, (1, 0, 0))):
            with self.assertRaises(ValueError):
                m.inverse_motion_point(progress, point)

    def test_certificate_trim_is_independent_of_caller_mutation(self):
        p = dict(m.DEFAULT)
        cert = m.certify(p)
        p['leftWidth'] = 2
        self.assertEqual(cert['finiteTrim']['leftWidth'], 1)
        self.assertEqual(cert['minimumJacobian'], .5)


if __name__ == '__main__':
    unittest.main()
