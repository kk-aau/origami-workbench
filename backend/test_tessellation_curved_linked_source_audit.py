"""Reproduce two parameter mismatches in Origamica's saved linked-circles input.

This is a source audit, not a linked-fold geometry implementation. The
notebook anchors and the distinction between derived values and Wolfram
output are documented in docs/Origamica第45节关联多曲折保存示例审计-20260924.md.
"""

import math
import unittest
from fractions import Fraction


R0 = 1.0
R1 = 1.1
EPSILON = 0.1
GAMMA0 = 2.0 * math.pi / 3.0


def q1(s):
    return s + EPSILON * math.sin(2.0 * s)


def q1_prime(s):
    return 1.0 + 2.0 * EPSILON * math.cos(2.0 * s)


def tangent(angle):
    return (-math.sin(angle), math.cos(angle))


def left_normal(angle):
    return (-math.cos(angle), -math.sin(angle))


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1]


def gamma1_continuous(s):
    """Analytic counterpart of In[4076]'s first sampled ListInterpolation.

    For a counterclockwise circle, Speed2D * LeftCurvature2D = 1.
    Wolfram's two-argument ArcTan[x, y] is atan2(y, x).
    """
    delta = q1(s) - s
    normal_ratio = (R1 - R0 * math.cos(delta)) / (
        R1 * math.cos(delta) - R0
    )
    curvature_ratio = 1.0 / q1_prime(s)
    return -2.0 * math.atan2(
        normal_ratio * math.tan(GAMMA0 / 2.0), curvature_ratio
    )


def central_derivative(fn, s, step=1.0e-5):
    return (fn(s + step) - fn(s - step)) / (2.0 * step)


class SavedLinkedCirclesSourceAudit(unittest.TestCase):
    def test_saved_fold_angle_breaks_intrinsic_curvature_at_aligned_parameters(self):
        # At s=0 and pi/2, q1(s)=s.  Hence the cached tf1 frame agrees with
        # the true f1 frame at these points, and gamma1'[q1(s)]=gamma1'[s].
        # The remaining failure comes from In[4076]'s reciprocal ratio 1/p,
        # where p=q1'(s).  In[4084] then rotates L_right by the saved angle.
        # First3D gives T1'=p L_left+sqrt(3) N at these aligned points.
        # The exact right geodesic coefficient is
        # p cos(gamma1)-sqrt(3) sin(gamma1)
        # = p(7-3p^2)/(1+3p^2), but the flat circle needs p.
        for s, p, expected in (
            (0., Fraction(6, 5), Fraction(402, 665)),
            (math.pi / 2., Fraction(4, 5), Fraction(508, 365)),
        ):
            with self.subTest(s=s):
                self.assertAlmostEqual(q1(s), s, places=12)
                self.assertAlmostEqual(q1_prime(s), float(p), places=12)
                saved_right = p * (7 - 3 * p * p) / (1 + 3 * p * p)
                self.assertEqual(saved_right, expected)
                self.assertNotEqual(saved_right, p)
                self.assertEqual(p - saved_right,
                                 6 * p * (p * p - 1) / (1 + 3 * p * p))

    def test_saved_second_fold_angle_breaks_geodesic_curvature_at_start(self):
        # In[4076] 338789-338841 uses the reciprocal speed ratio as the
        # first ArcTan component. At s=0, q1'=1.2 and the first lifted band's
        # unit tangent has geodesic coefficient G=1.2 and normal coefficient
        # N=sqrt(3). In[4084] rotates L_right=cos(gamma)L_left-sin(gamma)N.
        # Any isometric second band must retain the planar G=1.2.
        speed = q1_prime(0.)
        geodesic, normal = speed, math.sqrt(3.)
        saved_angle = -2. * math.atan2(normal, 1. / speed)
        saved_right_geodesic = (geodesic * math.cos(saved_angle)
                                - normal * math.sin(saved_angle))
        corrected_angle = -2. * math.atan2(normal, speed)
        corrected_right_geodesic = (geodesic * math.cos(corrected_angle)
                                    - normal * math.sin(corrected_angle))
        self.assertAlmostEqual(math.degrees(saved_angle), -128.6132381910029, places=10)
        self.assertAlmostEqual(saved_right_geodesic, .6045112781954888, places=12)
        self.assertAlmostEqual(speed - saved_right_geodesic, .5954887218045112, places=12)
        self.assertAlmostEqual(math.degrees(corrected_angle), -110.56999209210358, places=10)
        self.assertAlmostEqual(corrected_right_geodesic, speed, places=12)

    def test_next3d_precomputed_tangent_misses_q1_composition(self):
        # Notebook 340075-340109 defines tf[i], f[i] = tf[i] o q[i].
        # 340118-340123 precomputes Curve2DSystem[tf[i]], while
        # 340230-340244 passes f[0], f[1] and those uncomposed systems.
        # Consequently t0(s) = t1(s) in 339925-339990, so cdRho=1 and
        # sdRho=0. The returned tt1 is the input tt0.
        s = math.pi / 4.0
        delta = q1(s) - s
        h = (
            R1 * math.cos(q1(s)) - R0 * math.cos(s),
            R1 * math.sin(q1(s)) - R0 * math.sin(s),
        )
        t0 = tangent(s)
        l0 = left_normal(s)
        t1_from_saved_system = tangent(s)
        l1_from_saved_system = left_normal(s)
        a0, b0 = dot(t0, h), dot(l0, h)
        a1, b1 = dot(t1_from_saved_system, h), dot(l1_from_saved_system, h)
        hh = dot(h, h)
        cos_rho = (a0 * a1 + b0 * b1) / hh
        sin_rho = (b0 * a1 - a0 * b1) / hh
        returned_tangent_in_first_frame = (cos_rho, sin_rho)

        # First3D's geodesic torsion, 339491-339509, cancels the normal
        # component of d/du(ff0 + a0*tt0 + b0*ll0). Thus the true lifted
        # curve tangent is the planar tangent t(q1(s)) in the same frame.
        a = R1 * math.sin(delta)
        b = R0 - R1 * math.cos(delta)
        normal_curvature = math.tan(GAMMA0 / 2.0)
        geodesic_torsion = -normal_curvature * a / b
        self.assertAlmostEqual(a * normal_curvature + b * geodesic_torsion, 0.0, places=12)
        actual_tangent_in_first_frame = (
            dot(tangent(q1(s)), t0),
            dot(tangent(q1(s)), l0),
        )
        angle_error = math.acos(
            max(-1.0, min(1.0, dot(returned_tangent_in_first_frame, actual_tangent_in_first_frame)))
        )
        self.assertAlmostEqual(cos_rho, 1.0, places=12)
        self.assertAlmostEqual(sin_rho, 0.0, places=12)
        self.assertAlmostEqual(q1_prime(s), 1.0, places=12)
        self.assertAlmostEqual(angle_error, 0.1, places=12)

    def test_next2d_uses_gamma_derivative_at_q1_not_common_s(self):
        # In[4076] builds gamma1 from samples at common s, 338789-338841,
        # and documents both returned functions in the common parameter,
        # 338612-338620. The next root evaluates gamma1'[q1[s]] at
        # 338843-338855. These values quantify that discrepancy in the
        # smooth analytic limit; they are not Mathematica interpolation Out.
        s = math.pi / 8.0
        derivative_at_common_s = central_derivative(gamma1_continuous, s)
        derivative_at_q1_s = central_derivative(gamma1_continuous, q1(s))
        self.assertAlmostEqual(q1(s), 0.4634097598173789, places=12)
        self.assertAlmostEqual(derivative_at_common_s, 0.0291020501048581, delta=1.0e-7)
        self.assertAlmostEqual(derivative_at_q1_s, 0.06513950674672244, delta=1.0e-7)
        self.assertGreater(derivative_at_q1_s - derivative_at_common_s, 0.03)


if __name__ == "__main__":
    unittest.main()
