"""Independent meaningful numerical contracts for generic Darboux recovery."""
import copy
import math
import unittest
from unittest.mock import patch

import mpmath as mp
import numpy as np

from tessellation_curved_generic_darboux import (
    FLATTEN_PRESET, RESHAPE_PRESET, FLATTEN_FAMILY, RESHAPE_FAMILY,
    DarbouxKernel, GenericDarbouxError, query_flatten_generic,
    query_reshape_generic, validate_generic_darboux_query,
)


def compact(preset, **changes):
    return {**copy.deepcopy(preset), 'segments': 8, 'rulingSegments': 3, **changes}


def flatten_x(s):
    return .5*s*math.sqrt(1+.04*s*s)+2.5*math.asinh(.2*s)


class GenericDarbouxTests(unittest.TestCase):
    def test_non_circular_flatten_literal_closed_form_and_efg(self):
        result = query_flatten_generic(compact(FLATTEN_PRESET))
        self.assertEqual(result['source']['functions'], ['FlattenGeneric2D', 'NFlattenGeneric2D'])
        self.assertEqual(result['source']['definitionCells'], ['In[3882]', 'In[3885]'])
        self.assertTrue(result['certification']['formalIsometryCertified'])
        self.assertTrue(result['certification']['formalStripRegularityCertified'])
        self.assertFalse(result['certification']['integrationErrorIntervalCertified'])
        length = result['normalization']['scale']
        for row, grid in zip(result['sample']['rows'], result['grid']):
            s = row['s']
            np.testing.assert_allclose(row['targetBase'], [flatten_x(s), .2*s**3], rtol=0, atol=3e-12)
            np.testing.assert_allclose(row['targetDirector'], [0, 1], rtol=0, atol=3e-12)
            np.testing.assert_allclose(row['targetBaseDerivative'], [math.sqrt(1+.04*s*s), .6*s*s], rtol=0, atol=3e-12)
            for metrics in grid['sourceEFG']+grid['targetEFG']:
                np.testing.assert_allclose(np.asarray(metrics)*length**2, [1+.04*s*s+.36*s**4, .6*s*s, 1], rtol=0, atol=4e-12)

    def test_original_cone_family_and_apex_retains_full_strip(self):
        q = compact(FLATTEN_PRESET, baseCurve=['sqrt(3)/2', '-cos(s)/2', 'sin(s)/2'],
                    director=['-sqrt(3)/2', 'cos(s)/2', '-sin(s)/2'],
                    initialPoint=[1, 0], initialTangent=[0, 1],
                    parameterEnd=math.pi, transverseStart=-1, transverseEnd=1)
        result = query_flatten_generic(q)
        self.assertTrue(result['certification']['finiteMetricVerified'])
        self.assertEqual(result['domain']['formalStripRegularity']['status'], 'degenerate')
        self.assertFalse(result['certification']['formalStripRegularityCertified'])
        self.assertEqual(result['query']['transverseEnd'], 1)
        for row in result['sample']['rows']:
            s = row['s']; expected = [math.cos(s/2), math.sin(s/2)]
            np.testing.assert_allclose(row['targetBase'], expected, rtol=0, atol=4e-12)
            np.testing.assert_allclose(row['targetDirector'], -np.asarray(expected), rtol=0, atol=4e-12)

    def test_original_cylinder_reshape_modes(self):
        for base, curvature, cylinder in [(['-cos(s)', '0', 'sin(s)'], '0', False), (['s', '0', '0'], '1', True)]:
            result = query_reshape_generic(compact(RESHAPE_PRESET, baseCurve=base, director=['0', '1', '0'],
                                          normalCurvature=curvature, initialDirector=[0, 1, 0], parameterEnd=math.pi))
            self.assertEqual(result['source']['initialArgumentOrder'], ['ui', 'bbi', 'ddi', 'tti'])
            for row in result['sample']['rows']:
                s = row['s']; expected = [math.sin(s), 0, 1-math.cos(s)] if cylinder else [s, 0, 0]
                np.testing.assert_allclose(row['targetBase'], expected, rtol=0, atol=5e-12)
                np.testing.assert_allclose(row['targetDirector'], [0, 1, 0], rtol=0, atol=3e-12)

    def test_arbitrary_interior_initial_parameter_bidirectional_and_nonunit_ruling(self):
        ui, angle = .37, .6
        r = query_flatten_generic(compact(FLATTEN_PRESET, director=['0', '0', '2+.1*s'], initialParameter=ui,
                                 initialPoint=[3, -4], initialTangent=[math.cos(angle), math.sin(angle)]))
        self.assertGreater(r['diagnostics']['integration']['backwardEvaluations'], 0)
        self.assertGreater(r['diagnostics']['integration']['forwardEvaluations'], 0)
        source_angle = math.atan2(.6*ui*ui, math.sqrt(1+.04*ui*ui))
        turn = angle-source_angle
        rotation = np.asarray([[math.cos(turn), -math.sin(turn)], [math.sin(turn), math.cos(turn)]])
        for row in r['sample']['rows']:
            s = row['s']; delta = np.asarray([flatten_x(s)-flatten_x(ui), .2*(s**3-ui**3)])
            np.testing.assert_allclose(row['targetBase'], np.asarray([3, -4])+rotation@delta, rtol=0, atol=5e-12)
            np.testing.assert_allclose(row['targetDirector'], rotation@np.asarray([0, 2+.1*s]), rtol=0, atol=5e-12)
            self.assertAlmostEqual(sum(x*x for x in row['targetDirector']), (2+.1*s)**2, 11)
        self.assertTrue(r['certification']['sourceDevelopabilityAnalytic'])

    def test_nonunit_varying_reshape_and_all_darboux_coefficients(self):
        r = query_reshape_generic(compact(RESHAPE_PRESET, initialParameter=.43))
        self.assertTrue(r['certification']['finiteMetricVerified'])
        self.assertTrue(r['certification']['formalIsometryCertified'])
        self.assertGreater(r['diagnostics']['integration']['backwardEvaluations'], 0)
        for row in r['sample']['rows']:
            s = row['s']; c = row['coefficients']
            self.assertAlmostEqual(sum(x*x for x in row['targetDirector']), (1+.1*s)**2, 11)
            self.assertAlmostEqual(c['p']*c['h']+c['q']*c['z'], 0, 12)
            self.assertAlmostEqual(c['h'], c['speed']*(.05+.02*math.sin(s)), 12)
        # Supplied director is only a direction hint at this changed ui.
        self.assertFalse(r['initial']['directorCompatible'])

    def test_requested_initial_director_does_not_overwrite_source_pq(self):
        r = query_reshape_generic(compact(RESHAPE_PRESET, baseCurve=['s', '0', '0'],
                                 director=['0', '2', '0'], normalCurvature='0', initialDirector=[9, 1, 0]))
        self.assertFalse(r['initial']['directorCompatible'])
        self.assertEqual(r['initial']['requestedDirector'], [9, 1, 0])
        np.testing.assert_allclose(r['initial']['computedDirector'], [0, 2, 0], atol=1e-14)
        for row in r['sample']['rows']:
            np.testing.assert_allclose(row['targetDirector'], [0, 2, 0], atol=1e-14)

    def test_reverse_common_parameter_and_negative_sigma(self):
        for sigma in (-1, 1):
            r = query_flatten_generic(compact(FLATTEN_PRESET, sigma=sigma,
                     baseCurve=['-s', '.1*s**2', '-.2*s**3'], director=['0', '0', '2+.1*s']))
            self.assertTrue(r['certification']['finiteMetricVerified'])
            self.assertTrue(r['certification']['formalIsometryCertified'])
            self.assertTrue(r['certification']['formalStripRegularityCertified'])
            self.assertEqual(r['domain']['formalStripRegularity']['orientation'], sigma)
            for row in r['sample']['rows']:
                self.assertGreater(row['coefficients']['q'], 0)
        r = query_reshape_generic(compact(RESHAPE_PRESET, sigma=-1))
        self.assertTrue(r['certification']['finiteMetricVerified'])
        self.assertEqual(r['domain']['formalStripRegularity']['orientation'], -1)

    def test_zero_frenet_curvature_is_allowed(self):
        r = query_flatten_generic(compact(FLATTEN_PRESET, baseCurve=['2*s', '0', '0'], director=['.5', '3', '0']))
        self.assertTrue(r['certification']['formalIsometryCertified'])
        for row in r['sample']['rows']:
            np.testing.assert_allclose(row['targetBase'], [2*row['s'], 0], atol=1e-13)
            np.testing.assert_allclose(row['targetDirector'], [.5, 3], atol=1e-13)

    def test_constant_only_tiny_ruling_interval_rounding_is_enclosed(self):
        mp.mp.dps = 60
        for director in ('1e-10', '1/3*1e-8', 'sqrt(2)*1e-8'):
            r = query_flatten_generic(compact(FLATTEN_PRESET, baseCurve=['s', '0', '0'],
                                      director=['0', '0', director], transverseStart=-1e6, transverseEnd=1e6))
            exact = mp.mpf('1e-10') if director == '1e-10' else mp.mpf('1e-8')/3 if director == '1/3*1e-8' else mp.sqrt(2)*mp.mpf('1e-8')
            for cell in r['domain']['cells']:
                self.assertLessEqual(mp.mpf(cell['directorLengthLowerBound']), exact)
                self.assertLessEqual(mp.mpf(cell['normalizedJacobianBounds'][0]), exact)
                self.assertGreaterEqual(mp.mpf(cell['normalizedJacobianBounds'][1]), exact)
            self.assertTrue(r['certification']['formalStripRegularityCertified'])

    def test_nondevelopable_source_keeps_real_output_without_isometry_claim(self):
        for preset, fn in [(FLATTEN_PRESET, query_flatten_generic), (RESHAPE_PRESET, query_reshape_generic)]:
            changes = {'baseCurve': ['s', '0', '0'], 'director': ['0', 'cos(s)', 'sin(s)']}
            if preset['family'] == RESHAPE_FAMILY: changes.update(normalCurvature='0', initialDirector=[0, 1, 0])
            r = fn(compact(preset, **changes))
            self.assertEqual(r['diagnostics']['sourceDevelopability']['status'], 'incompatible')
            self.assertFalse(r['certification']['sourceDevelopabilityAnalytic'])
            self.assertFalse(r['certification']['finiteMetricVerified'])
            self.assertFalse(r['certification']['formalIsometryCertified'])
            self.assertEqual(len(r['sample']['rows']), 9)
            self.assertEqual(r['query']['parameterEnd'], 1)
            # Original helicoid E=1+w^2; literal recovered constant band E=1.
            row = r['grid'][0]
            length = r['normalization']['scale']
            self.assertAlmostEqual(row['sourceEFG'][0][0]*length**2, 1+preset['transverseStart']**2, 12)
            self.assertAlmostEqual(row['targetEFG'][0][0]*length**2, 1, 12)

    def test_similarity_tiny_large_translation_and_physical_jets(self):
        for preset, fn in [(FLATTEN_PRESET, query_flatten_generic), (RESHAPE_PRESET, query_reshape_generic)]:
            original = fn(compact(preset))
            for factor in (1e-6, 1e-8):
                q = compact(preset, baseCurve=[f'1e9+{factor}*({x})' for x in preset['baseCurve']],
                            director=[f'{factor}*({x})' for x in preset['director']],
                            initialPoint=[1e9]*len(preset['initialPoint']))
                if preset['family'] == RESHAPE_FAMILY:
                    q['normalCurvature'] = f'({preset["normalCurvature"]})/{factor}'
                    q['initialDirector'] = [factor*x for x in preset['initialDirector']]
                tiny = fn(q)
                self.assertTrue(tiny['certification']['finiteMetricVerified'])
                self.assertAlmostEqual(tiny['normalization']['scale']/factor, original['normalization']['scale'], 12)
                for a, b in zip(original['sample']['rows'], tiny['sample']['rows']):
                    for field in ('normalizedSourceBase', 'normalizedTargetBase', 'normalizedTargetDirector', 'normalizedTargetBaseDerivative', 'normalizedTargetDirectorDerivative'):
                        np.testing.assert_allclose(b[field], a[field], rtol=2e-11, atol=2e-12)
                    for field in ('sourceDirector', 'sourceBaseDerivative', 'sourceDirectorDerivative', 'targetDirector', 'targetBaseDerivative', 'targetDirectorDerivative'):
                        np.testing.assert_allclose(np.asarray(b[field])/factor, a[field], rtol=2e-11, atol=2e-12)

    def test_finite_band_focus_and_disjoint_regular_branch(self):
        q = compact(FLATTEN_PRESET, baseCurve=['cos(s)', 'sin(s)', '0'],
                    director=['-cos(s)', '-sin(s)', '0'], initialPoint=[1, 0], initialTangent=[0, 1])
        r = query_flatten_generic({**q, 'transverseStart': -.1, 'transverseEnd': 1.2})
        self.assertEqual(r['domain']['formalStripRegularity']['status'], 'degenerate')
        self.assertFalse(r['certification']['formalStripRegularityCertified'])
        self.assertTrue(r['certification']['finiteMetricVerified'])
        r = query_flatten_generic({**q, 'transverseStart': 2, 'transverseEnd': 3})
        self.assertTrue(r['certification']['formalStripRegularityCertified'])
        self.assertEqual(r['domain']['formalStripRegularity']['orientation'], -1)

    def test_actual_interval_budget_unknown_preserves_entire_source(self):
        r = query_flatten_generic(compact(FLATTEN_PRESET, baseCurve=['cos(5000*s)', 'sin(5000*s)', '0']))
        self.assertFalse(r['domain']['certified'])
        self.assertFalse(r['certification']['sourceRegularityCertified'])
        self.assertFalse(r['certification']['formalIsometryCertified'])
        self.assertTrue(r['certification']['sourceDevelopabilityAnalytic'])
        self.assertTrue(r['certification']['finiteMetricVerified'])
        self.assertEqual(r['domain']['evaluations'], 1024)
        self.assertEqual(r['sample']['rows'][0]['s'], 0)
        self.assertEqual(r['sample']['rows'][-1]['s'], 1)
        self.assertEqual(len(r['sample']['rows']), 9)
        cover = sorted([(c['start'], c['end']) for c in r['domain']['cells']]+[tuple(x) for x in r['domain']['unresolved']])
        self.assertEqual(cover[0][0], 0); self.assertEqual(cover[-1][1], 1)
        for a, b in zip(cover, cover[1:]): self.assertEqual(a[1], b[0])

    def test_undefined_source_and_initial_frame_rejection(self):
        for changes in [
            {'baseCurve': ['0', '0', '0']}, {'director': ['1', '.2*s', '.6*s**2']},
            {'director': ['0', '0', '0']}, {'baseCurve': ['s+0/(s-.5)', '0', '0']},
            {'baseCurve': ['exp(1000*s)', '0', '0']}, {'initialTangent': [2, 0]},
            {'initialParameter': 1.1}, {'parameterEnd': 11}, {'sigma': True}, {'rulingSegments': 65}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError): query_flatten_generic(compact(FLATTEN_PRESET, **changes))
        for initial in ([0, 0, 0], [1, 0, 0]):
            with self.assertRaises(GenericDarbouxError): query_reshape_generic(compact(RESHAPE_PRESET, initialDirector=initial))

    def test_malicious_ast_and_solver_budget_never_execute(self):
        for source in ['__import__("os")', 's.__class__', '[s,s]', 'sum(s)', 'open(s)', '(lambda:s)()', 's**9', 's+external']:
            with self.subTest(source=source), self.assertRaises(ValueError):
                query_flatten_generic(compact(FLATTEN_PRESET, baseCurve=[source, '0', '0']))
        with self.assertRaises(ValueError): query_flatten_generic(compact(FLATTEN_PRESET, extra='execute'))
        with patch('tessellation_curved_generic_darboux.INTEGRATION_BUDGET', 1), self.assertRaisesRegex(GenericDarbouxError, 'integration-budget'):
            query_reshape_generic(compact(RESHAPE_PRESET))
        self.assertEqual(validate_generic_darboux_query(compact(FLATTEN_PRESET, rulingSegments=3))['rulingSegments'], 3)


if __name__ == '__main__': unittest.main()
