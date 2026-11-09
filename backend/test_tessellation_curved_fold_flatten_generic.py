"""Focused source-derived tests; staged outside discovery during prior batch."""
import copy
import math
from pathlib import Path
import sys
import unittest

import mpmath as mp
import numpy as np

ROOT = Path(__file__).resolve().parents[1] if Path(__file__).parent.name == 'backend' else Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'backend'))
from tessellation_curved_fold_flatten_generic import PRESET, query_flatten_fold_generic


def compact(**changes): return {**copy.deepcopy(PRESET), 'segments': 8, 'rulingSegments': 3, **changes}


def exact_flat(s):
    v = math.sqrt(1+s*s/4); coefficient = (1+s/10)*v/(5+s*s)
    return np.array([s, s*s/4]), np.array([0, 2+s/10]), np.array([4*s*coefficient, (s*s-5)*coefficient])


class GenericFoldFlattenTests(unittest.TestCase):
    def test_true_noncircular_shared_three_dimensional_source_closed_flat(self):
        r = query_flatten_fold_generic(compact())
        self.assertEqual(r['source']['functions'], ['FlattenFold2D', 'NFlattenFold2D'])
        self.assertEqual(r['source']['definitionCells'], ['In[3932]', 'In[3935]'])
        self.assertTrue(r['certification']['formalCommonFlatteningCertified'])
        self.assertTrue(r['certification']['finiteLeftMetricVerified'])
        self.assertTrue(r['certification']['finiteRightMetricVerified'])
        self.assertFalse(r['certification']['integrationErrorIntervalCertified'])
        for row in r['sample']['rows']:
            s = row['s']; f, left, right = exact_flat(s)
            np.testing.assert_allclose(row['targetBase'], f, rtol=0, atol=3e-12)
            np.testing.assert_allclose(row['targetLeftDirector'], left, rtol=0, atol=3e-12)
            np.testing.assert_allclose(row['targetRightDirector'], right, rtol=0, atol=3e-12)
            self.assertGreater(row['coefficients']['left']['q'], 0)
            self.assertLess(row['coefficients']['right']['q'], 0)
            for side in ('left', 'right'): self.assertAlmostEqual(row['coefficients'][side]['g'], .5/(1+s*s/4), 12)
            self.assertAlmostEqual(np.linalg.norm(row['targetLeftDirector']), 2+s/10, 12)

    def test_original_right_negative_normal_and_two_rotation_negatives(self):
        r = query_flatten_fold_generic(compact(foldCurve=['s', '0', '0'], leftDirector=['0', '2', '0'],
              rightDirector=['0', '-3*cos(.7)', '-3*sin(.7)']))
        self.assertTrue(r['certification']['formalCommonFlatteningCertified'])
        for row in r['sample']['rows']:
            np.testing.assert_allclose(row['targetBase'], [row['s'], 0], atol=1e-13)
            np.testing.assert_allclose(row['targetLeftDirector'], [0, 2], atol=1e-13)
            np.testing.assert_allclose(row['targetRightDirector'], [0, -3], atol=1e-13)
            self.assertEqual(row['coefficients']['right']['q'], -3)

    def test_two_developable_sides_without_common_turning_are_readonly(self):
        r = query_flatten_fold_generic(compact(foldCurve=['cos(s)', 'sin(s)', '0'],
               leftDirector=['-cos(s)', '-sin(s)', '0'], rightDirector=['0', '0', '1']))
        self.assertTrue(r['certification']['leftSourceDevelopabilityAnalytic'])
        self.assertTrue(r['certification']['rightSourceDevelopabilityAnalytic'])
        self.assertFalse(r['certification']['sharedGeodesicCurvatureAnalytic'])
        self.assertFalse(r['certification']['finiteSharedGeodesicCurvatureVerified'])
        self.assertFalse(r['certification']['finiteRightMetricVerified'])
        self.assertFalse(r['certification']['formalCommonFlatteningCertified'])
        self.assertEqual(r['diagnostics']['sharedGeodesicCurvature']['status'], 'incompatible')
        self.assertEqual(len(r['sample']['rows']), 9)
        self.assertEqual(r['query']['parameterEnd'], 1)
        scale = r['normalization']['scale']
        for row, grid in zip(r['sample']['rows'], r['grid']):
            self.assertAlmostEqual(row['coefficients']['left']['g'], 1, 12)
            self.assertAlmostEqual(row['coefficients']['right']['g'], 0, 12)
            for i, (a, b) in enumerate(zip(grid['sourceRightEFG'], grid['targetRightEFG'])):
                w = .15*i/3
                self.assertAlmostEqual(a[0]*scale**2, 1, 12)
                self.assertAlmostEqual(b[0]*scale**2, (1+w)**2, 12)

    def test_development_and_shared_turning_evidence_are_independent(self):
        r = query_flatten_fold_generic(compact(foldCurve=['s', '0', '0'],
                  leftDirector=['0', '2', '0'], rightDirector=['0', '-cos(s)', '-sin(s)']))
        self.assertTrue(r['certification']['leftSourceDevelopabilityAnalytic'])
        self.assertFalse(r['certification']['rightSourceDevelopabilityAnalytic'])
        self.assertTrue(r['certification']['sharedGeodesicCurvatureAnalytic'])
        self.assertFalse(r['certification']['finiteSourceDevelopabilityVerified'])
        self.assertFalse(r['certification']['finiteRightMetricVerified'])
        self.assertTrue(r['certification']['finiteLeftMetricVerified'])
        self.assertFalse(r['certification']['formalCommonFlatteningCertified'])

    def test_interior_initial_conditions_bidirectional_with_rigid_planar_motion(self):
        ui, angle = .37, .8
        r = query_flatten_fold_generic(compact(initialParameter=ui, initialPoint=[3, -4],
                    initialTangent=[math.cos(angle), math.sin(angle)]))
        self.assertGreater(r['diagnostics']['integration']['backwardEvaluations'], 0)
        self.assertGreater(r['diagnostics']['integration']['forwardEvaluations'], 0)
        turn = angle-math.atan(ui/2)
        rotation = np.array([[math.cos(turn), -math.sin(turn)], [math.sin(turn), math.cos(turn)]])
        initial = exact_flat(ui)[0]
        for row in r['sample']['rows']:
            f, left, right = exact_flat(row['s'])
            np.testing.assert_allclose(row['targetBase'], [3, -4]+rotation@(f-initial), rtol=0, atol=4e-12)
            np.testing.assert_allclose(row['targetLeftDirector'], rotation@left, rtol=0, atol=4e-12)
            np.testing.assert_allclose(row['targetRightDirector'], rotation@right, rtol=0, atol=4e-12)

    def test_common_parameter_reversal_is_supported(self):
        q = compact(foldCurve=['-sin(s)', 's**2/4', '1-cos(s)'], leftDirector=['0', '2-.1*s', '0'],
                    rightDirector=['-4*(1-.1*s)*sqrt(1+s**2/4)*sin(s)/(5+s**2)',
                                   '(1-.1*s)*sqrt(1+s**2/4)*(3+s**2)/(5+s**2)',
                                   '-4*(1-.1*s)*sqrt(1+s**2/4)*cos(s)/(5+s**2)'])
        r = query_flatten_fold_generic(q)
        self.assertTrue(r['certification']['formalCommonFlatteningCertified'])
        self.assertTrue(r['certification']['finiteRightMetricVerified'])
        for row in r['sample']['rows']:
            s = row['s']; np.testing.assert_allclose(row['targetBase'], [s, s*s/4], atol=3e-12)
            np.testing.assert_allclose(row['targetLeftDirector'], [0, 2-s/10], atol=3e-12)

    def test_similarity_with_tiny_scale_and_large_translation(self):
        original = query_flatten_fold_generic(compact())
        for factor in (1e-6, 1e-8):
            q = compact(foldCurve=[f'1e9+{factor}*({source})' for source in PRESET['foldCurve']],
                        leftDirector=[f'{factor}*({source})' for source in PRESET['leftDirector']],
                        rightDirector=[f'{factor}*({source})' for source in PRESET['rightDirector']], initialPoint=[1e9, 1e9])
            tiny = query_flatten_fold_generic(q)
            self.assertTrue(tiny['certification']['formalCommonFlatteningCertified'])
            for a, b in zip(original['sample']['rows'], tiny['sample']['rows']):
                for key in ('normalizedSourceBase', 'normalizedTargetBase', 'normalizedSourceRightDirector', 'normalizedTargetLeftDirector', 'normalizedTargetRightDirectorDerivative'):
                    np.testing.assert_allclose(b[key], a[key], rtol=3e-11, atol=3e-12)
                for key in ('sourceLeftDirector', 'sourceRightDirector', 'targetLeftDirector', 'targetRightDirector', 'targetBaseDerivative', 'targetRightDirectorDerivative'):
                    np.testing.assert_allclose(np.asarray(b[key])/factor, a[key], rtol=3e-11, atol=3e-12)

    def test_constant_tiny_directors_keep_original_metric_and_interval_lower_bounds(self):
        mp.mp.dps = 60
        r = query_flatten_fold_generic(compact(foldCurve=['s', '0', '0'], leftDirector=['0', '0', '1e-10'],
                      rightDirector=['0', '0', '-1/3*1e-8'], transverseStart=-1e6, transverseEnd=1e6))
        for row in r['sample']['rows']:
            self.assertAlmostEqual(row['targetLeftDirector'][1]/1e-10, 1, 14)
            self.assertAlmostEqual(row['targetRightDirector'][1]/(1e-8/3), -1, 14)
        for c in r['domain']['cells']:
            self.assertLessEqual(mp.mpf(c['leftDirectorLengthLowerBound']), mp.mpf('1e-10'))
            self.assertLessEqual(mp.mpf(c['rightDirectorLengthLowerBound']), mp.mpf('1e-8')/3)
        self.assertTrue(r['certification']['formalCommonFlatteningCertified'])

    def test_finite_focus_has_separate_left_and_right_proofs_and_preserves_width(self):
        r = query_flatten_fold_generic(compact(foldCurve=['cos(s)', 'sin(s)', '0'], leftDirector=['-2*cos(s)', '-2*sin(s)', '0'],
                   rightDirector=['2*cos(s)', '2*sin(s)', '0'], transverseEnd=.7))
        for field in ('sourceStripRegularity', 'formalStripRegularity'):
            self.assertEqual(r['domain'][field]['left']['status'], 'degenerate')
            self.assertEqual(r['domain'][field]['right']['status'], 'verified')
        self.assertTrue(r['certification']['formalCommonFlatteningCertified'])
        self.assertEqual(r['query']['transverseEnd'], .7)

    def test_actual_budget_unknown_retains_full_two_surfaces(self):
        r = query_flatten_fold_generic(compact(foldCurve=['cos(5000*s)', 'sin(5000*s)', '0'],
                                              leftDirector=['0', '0', '2'], rightDirector=['0', '0', '-3']))
        self.assertFalse(r['domain']['certified'])
        self.assertEqual(r['domain']['evaluations'], 1024)
        self.assertTrue(r['certification']['sharedGeodesicCurvatureAnalytic'])
        self.assertTrue(r['certification']['finiteRightMetricVerified'])
        self.assertFalse(r['certification']['formalCommonFlatteningCertified'])
        self.assertEqual(len(r['sample']['rows']), 9)
        self.assertEqual(r['sample']['rows'][-1]['s'], 1)
        cover = sorted([(c['start'], c['end']) for c in r['domain']['cells']]+[tuple(x) for x in r['domain']['unresolved']])
        self.assertEqual(cover[0][0], 0); self.assertEqual(cover[-1][1], 1)
        for a, b in zip(cover, cover[1:]): self.assertEqual(a[1], b[0])

    def test_literal_source_degeneracy_and_malicious_input_are_rejected(self):
        for changes in [
            {'foldCurve': ['0', '0', '0']}, {'leftDirector': ['0', '0', '0']},
            {'rightDirector': ['cos(s)', 's/2', 'sin(s)']}, {'foldCurve': ['s+0/(s-.5)', '0', '0']},
            {'initialParameter': -1}, {'initialTangent': [1, 1]}, {'sigma': 1},
            {'rulingSegments': 65}, {'rightDirector': ['s.__class__', '0', '1']},
            {'foldCurve': ['__import__("os")', '0', '0']}, {'leftDirector': ['s**9', '1', '0']}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError): query_flatten_fold_generic(compact(**changes))


if __name__ == '__main__': unittest.main()
