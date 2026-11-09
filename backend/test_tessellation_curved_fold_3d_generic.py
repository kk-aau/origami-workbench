"""Six-source source-derived regressions, moved after parent batch approval."""
import copy
import math
from pathlib import Path
import sys
import unittest

import numpy as np

ROOT = Path(__file__).resolve().parents[1] if Path(__file__).parent.name == 'backend' else Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'backend'))
from tessellation_curved_fold_3d_generic import PRESET, query_fold_3d_generic


def compact(**changes): return {**copy.deepcopy(PRESET), 'segments': 8, 'rulingSegments': 3, **changes}
def closed(s):
    v = math.sqrt(1+s*s/4); k = (1+s/10)*v/(5+s*s)
    return (np.array([math.sin(s), s*s/4, 1-math.cos(s)]), np.array([0, 2+s/10, 0]),
            k*np.array([4*math.sin(s), 3+s*s, -4*math.cos(s)]))
def frenet(s):
    bp = np.array([math.cos(s), s/2, math.sin(s)])
    bpp = np.array([-math.sin(s), .5, math.cos(s)])
    t = bp/np.linalg.norm(bp); b = np.cross(bp, bpp); b /= np.linalg.norm(b)
    return t, np.cross(b, t), b


class GenericFold3DTests(unittest.TestCase):
    def test_true_noncircular_six_sources_match_independent_spatial_closed_form(self):
        r = query_fold_3d_generic(compact())
        self.assertEqual(r['source']['functions'], ['FoldCurvedFold3D', 'NFoldCurvedFold3D'])
        self.assertEqual(r['source']['initialArgumentOrder'], ['ui', 'gammai', 'ffi', 'tti', 'bbti'])
        self.assertTrue(r['certification']['formalIsometryCertified'])
        self.assertTrue(r['certification']['finiteDevelopabilityVerified'])
        for row in r['sample']['rows']:
            s = row['s']; b, l, rr = closed(s); t, n, bn = frenet(s)
            for key, expected in [('targetBase', b), ('targetLeftDirector', l), ('targetRightDirector', rr),
                                  ('targetTangent', t), ('targetNormal', n), ('targetBinormal', bn)]:
                np.testing.assert_allclose(row[key], expected, rtol=0, atol=3e-12)
            self.assertAlmostEqual(row['foldAngleRad'], -2*math.acos(1/math.sqrt(5+s*s)), 12)
            self.assertAlmostEqual(row['coefficients']['curvature'], .5*math.sqrt(5+s*s)/(1+s*s/4)**1.5, 12)
            self.assertAlmostEqual(row['coefficients']['torsion'], -2*s/(5+s*s), 12)
            self.assertAlmostEqual(np.linalg.norm(row['targetLeftDirector']), 2+s/10, 12)
        self.assertFalse(r['certification']['integrationErrorIntervalCertified'])
        self.assertFalse(r['certification']['exactStraightCreaseFOLD'])

    def test_original_circle_gamma_signed_and_raw_nonunit_directors(self):
        for gamma in (2*math.pi/3, -2*math.pi/3):
            r = query_fold_3d_generic(compact(foldCurve=['2*cos(s/2)-1', '2*sin(s/2)'],
                leftDirector=['-2*cos(s/2)', '-2*sin(s/2)'], rightDirector=['3*cos(s/2)', '3*sin(s/2)'],
                initialFoldAngleRad=gamma, initialPoint=[1, 0, 0], initialTangent=[0, 1, 0],
                initialTopBinormal=[0, 0, 1], parameterEnd=math.pi, transverseEnd=.15))
            for row in r['sample']['rows']:
                s = row['s']; sign = 1 if gamma > 0 else -1
                np.testing.assert_allclose(row['targetBase'], [math.cos(s), math.sin(s), 0], atol=4e-12)
                np.testing.assert_allclose(row['targetLeftDirector'], [-math.cos(s), -math.sin(s), sign*math.sqrt(3)], atol=4e-12)
                np.testing.assert_allclose(row['targetRightDirector'], [1.5*math.cos(s), 1.5*math.sin(s), sign*1.5*math.sqrt(3)], atol=4e-12)
                self.assertAlmostEqual(row['foldAngleRad'], gamma, 12)
            self.assertTrue(r['certification']['formalIsometryCertified'])

    def test_domain_interior_ui_and_arbitrary_rigid_pose_bilateral(self):
        ui = .37; t, n, b = frenet(ui)
        rotation = np.array([[0, -1, 0], [1, 0, 0], [0, 0, 1]])
        point = np.array([3, -4, .7])
        r = query_fold_3d_generic(compact(initialParameter=ui, initialPoint=point.tolist(),
            initialTangent=(rotation@t).tolist(), initialTopBinormal=(rotation@b).tolist(),
            initialFoldAngleRad=-2*math.acos(1/math.sqrt(5+ui*ui))))
        self.assertGreater(r['diagnostics']['integration']['backwardEvaluations'], 0)
        self.assertGreater(r['diagnostics']['integration']['forwardEvaluations'], 0)
        for row in r['sample']['rows']:
            base, left, right = closed(row['s'])
            for key, expected in [('targetBase', point+rotation@(base-closed(ui)[0])),
                                  ('targetLeftDirector', rotation@left), ('targetRightDirector', rotation@right)]:
                np.testing.assert_allclose(row[key], expected, rtol=0, atol=5e-12)
        self.assertTrue(r['certification']['angleBranchCertified'])

    def test_negative_curvature_keeps_source_sign_initial_binormal(self):
        q = compact(foldCurve=['s', '-s**2/4'], leftDirector=['0', '-2-.1*s'],
            rightDirector=[PRESET['rightDirector'][0], '-('+PRESET['rightDirector'][1]+')'])
        r = query_fold_3d_generic(q); rotation = np.diag([1, -1, -1])
        self.assertEqual(r['initial']['sourceOrientation'], -1)
        np.testing.assert_equal(r['initial']['binormal'], -np.array(q['initialTopBinormal']))
        for row in r['sample']['rows']:
            base, left, right = closed(row['s'])
            for key, expected in [('targetBase', rotation@base), ('targetLeftDirector', rotation@left), ('targetRightDirector', rotation@right)]:
                np.testing.assert_allclose(row[key], expected, rtol=0, atol=4e-12)
        self.assertTrue(r['certification']['finiteRightMetricVerified'])

    def test_common_parameter_reversal_does_not_inherit_positive_speed_map_gate(self):
        q = compact(foldCurve=['-s', 's**2/4'], leftDirector=['0', '2-.1*s'],
             rightDirector=['-4*s*(1-.1*s)*sqrt(1+s**2/4)/(5+s**2)', '(s**2-5)*(1-.1*s)*sqrt(1+s**2/4)/(5+s**2)'],
             initialTangent=[-1, 0, 0], initialFoldAngleRad=-PRESET['initialFoldAngleRad'])
        r = query_fold_3d_generic(q)
        for row in r['sample']['rows']:
            b, left, right = closed(-row['s'])
            for key, expected in [('targetBase', b), ('targetLeftDirector', left), ('targetRightDirector', right)]:
                np.testing.assert_allclose(row[key], expected, atol=4e-12)
        self.assertTrue(r['certification']['formalIsometryCertified'])

    def test_original_half_angle_cosine_branch_outside_principal_range_preserved(self):
        r = query_fold_3d_generic(compact(initialFoldAngleRad=2*math.pi+PRESET['initialFoldAngleRad']))
        self.assertEqual(r['domain']['angleBranch']['cosineHalfAngleSign'], -1)
        self.assertTrue(r['certification']['formalIsometryCertified'])
        self.assertTrue(r['certification']['finiteRightMetricVerified'])
        for row in r['sample']['rows']: self.assertGreater(row['foldAngleRad'], math.pi)

    def test_tiny_similarity_and_large_translation_keep_physical_jets(self):
        original = query_fold_3d_generic(compact())
        for factor in (1e-6, 1e-8):
            q = compact(foldCurve=[f'1e9+{factor}*({x})' for x in PRESET['foldCurve']],
                        leftDirector=[f'{factor}*({x})' for x in PRESET['leftDirector']],
                        rightDirector=[f'{factor}*({x})' for x in PRESET['rightDirector']], initialPoint=[1e9, 1e9, 1e9])
            r = query_fold_3d_generic(q)
            self.assertTrue(r['certification']['formalIsometryCertified'])
            for a, b in zip(original['sample']['rows'], r['sample']['rows']):
                for key in ('normalizedSourceBase', 'normalizedTargetBase', 'normalizedTargetRightDirectorDerivative'):
                    np.testing.assert_allclose(b[key], a[key], rtol=3e-11, atol=4e-12)
                for key in ('sourceLeftDirector', 'targetRightDirector', 'targetBaseDerivative', 'targetRightDirectorDerivative'):
                    np.testing.assert_allclose(np.array(b[key])/factor, a[key], rtol=3e-11, atol=4e-12)
                self.assertAlmostEqual(b['coefficients']['curvature']*factor, a['coefficients']['curvature'], 11)

    def test_tiny_directors_are_preserved_with_relative_metric_verification(self):
        r = query_fold_3d_generic(compact(leftDirector=['0', '1e-10*(2+.1*s)'],
            rightDirector=[f'1e-8*({x})' for x in PRESET['rightDirector']], transverseEnd=1e6))
        self.assertTrue(r['certification']['formalIsometryCertified'])
        self.assertTrue(r['certification']['finiteLeftMetricVerified'])
        self.assertTrue(r['certification']['finiteRightMetricVerified'])
        for row in r['sample']['rows']:
            _, left, right = closed(row['s'])
            np.testing.assert_allclose(np.array(row['targetLeftDirector'])/1e-10, left, rtol=0, atol=4e-12)
            np.testing.assert_allclose(np.array(row['targetRightDirector'])/1e-8, right, rtol=0, atol=4e-12)

    def test_raw_near_unit_initial_frame_remains_numerical_without_formal_certificates(self):
        tangent = [1, 9e-11, 0]
        r = query_fold_3d_generic(compact(initialTangent=tangent))
        self.assertEqual(r['query']['initialTangent'], tangent)
        self.assertEqual(r['initial']['tangent'], tangent)
        self.assertGreater(r['initial']['frameGramResidual'], r['initial']['frameCompatibilityTolerance'])
        self.assertEqual(r['initial']['frameCompatibilityTolerance'], 64*np.finfo(float).eps)
        self.assertFalse(r['initial']['frameCompatible'])
        self.assertFalse(r['certification']['initialFrameCompatible'])
        self.assertTrue(r['certification']['finiteLeftMetricVerified'])
        self.assertTrue(r['certification']['finiteRightMetricVerified'])
        self.assertFalse(r['certification']['formalIsometryCertified'])
        for side in ('left', 'right'):
            self.assertEqual(r['domain']['sourceStripRegularity'][side]['status'], 'verified')
            formal = r['domain']['formalStripRegularity'][side]
            self.assertEqual(formal['status'], 'unknown')
            self.assertIsNone(formal['orientation'])
            self.assertIsNone(formal['minimumAbsoluteJacobianLowerBound'])
        np.testing.assert_equal(r['sample']['rows'][0]['targetTangent'], tangent)

    def test_finite_focus_is_separate_from_formal_isometry_and_preserves_width(self):
        r = query_fold_3d_generic(compact(foldCurve=['2*cos(s/2)-1', '2*sin(s/2)'],
            leftDirector=['-2*cos(s/2)', '-2*sin(s/2)'], rightDirector=['2*cos(s/2)', '2*sin(s/2)'],
            initialFoldAngleRad=2*math.pi/3, initialPoint=[1, 0, 0], initialTangent=[0, 1, 0], initialTopBinormal=[0, 0, 1], transverseEnd=1.1))
        self.assertTrue(r['certification']['formalIsometryCertified'])
        self.assertEqual(r['domain']['sourceStripRegularity']['left']['status'], 'degenerate')
        self.assertEqual(r['domain']['formalStripRegularity']['left']['status'], 'degenerate')
        self.assertEqual(r['domain']['sourceStripRegularity']['right']['status'], 'verified')
        self.assertEqual(r['query']['transverseEnd'], 1.1)

    def test_actual_interval_budget_unknown_does_not_discard_valid_real_original_source(self):
        factor = '(1+sin(5000*s)**2)/(1+sin(5000*s)**2)'
        r = query_fold_3d_generic(compact(leftDirector=['0', f'(2+.1*s)*({factor})']))
        self.assertFalse(r['domain']['certified'])
        self.assertFalse(r['certification']['formalIsometryCertified'])
        self.assertTrue(r['certification']['finiteLeftMetricVerified'])
        self.assertTrue(r['certification']['finiteRightMetricVerified'])
        self.assertEqual(r['domain']['evaluations'], 1024)
        self.assertEqual(len(r['sample']['rows']), 9)
        self.assertEqual(r['sample']['rows'][-1]['s'], 1)
        cover = sorted([(c['start'], c['end']) for c in r['domain']['cells']]+[tuple(x) for x in r['domain']['unresolved']])
        self.assertEqual(cover[0][0], 0); self.assertEqual(cover[-1][1], 1)
        for a, b in zip(cover, cover[1:]): self.assertEqual(a[1], b[0])

    def test_literal_poles_curvature_zero_and_bad_initials_rejected(self):
        for changes in [{'foldCurve': ['s', '0']}, {'foldCurve': ['s', 's**3'], 'parameterStart': -.5},
            {'leftDirector': ['1', 's/2']}, {'rightDirector': ['0', '0']}, {'initialFoldAngleRad': 0},
            {'initialFoldAngleRad': math.pi}, {'initialFoldAngleRad': 2*math.pi}, {'initialParameter': -1},
            {'initialTangent': [2, 0, 0]}, {'initialTopBinormal': [1, 0, 0]}, {'rulingSegments': 65},
            {'foldCurve': ['s+0/(s-.5)', 's**2/4']}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError): query_fold_3d_generic(compact(**changes))

    def test_malicious_free_names_and_unbudgeted_sources_rejected(self):
        for changes in [{'foldCurve': ['__import__("os")', 's**2/4']}, {'foldCurve': ['s.__class__', 's']},
                        {'leftDirector': ['a', '1']}, {'leftDirector': ['0', 's**9']}, {'sigma': 1}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError): query_fold_3d_generic(compact(**changes))


if __name__ == '__main__': unittest.main(verbosity=2)
