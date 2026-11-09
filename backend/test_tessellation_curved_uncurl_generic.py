"""Independent old-Uncurl source, closed-curve, and failure contracts."""
import copy
import hashlib
import json
import math
import re
import unittest
from pathlib import Path
from unittest.mock import patch

import tessellation_curved_uncurl_generic as uncurl
import tessellation_curved_uncurl_identity as identity
from tessellation_curved_generic_linked_expression import GenericLinkedError

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT/'tests'/'fixtures'
GOLDEN = json.loads((FIXTURES/'origamica-uncurl-generic-independent-80digit.json').read_text(encoding='utf-8'))


def query(**overrides):
    value = copy.deepcopy(uncurl.PRESET)
    value.update(overrides)
    return value


class OldUncurlTests(unittest.TestCase):
    def close(self, actual, expected, *, tolerance=2e-10):
        if expected is None:
            self.assertIsNone(actual)
        elif isinstance(expected, list):
            self.assertIsInstance(actual, list)
            self.assertEqual(len(actual), len(expected))
            for a, b in zip(actual, expected):
                self.close(a, b, tolerance=tolerance)
        elif isinstance(expected, dict):
            self.assertEqual(set(actual), set(expected))
            for key in expected:
                self.close(actual[key], expected[key], tolerance=tolerance)
        else:
            self.assertIsNotNone(actual)
            expected = float(expected)
            self.assertTrue(math.isfinite(actual))
            self.assertLessEqual(abs(actual-expected), tolerance*max(1., abs(expected)), (actual, expected))

    def verify_golden_case(self, name):
        reference = next(case for case in GOLDEN['cases'] if case['name'] == name)
        result = uncurl.generate_uncurl_generic_query(reference['query'])
        self.assertEqual(result['source']['ruleOrder'], GOLDEN['rules'])
        self.assertEqual(result['domain']['recoveryStatus'], 'ready')
        for expected in reference['rows']:
            row = next(row for row in result['sample']['rows'] if abs(row['s']-float(expected['s'])) < 1e-15)
            self.assertEqual(list(row['rules']), GOLDEN['rules'])
            self.close(row['rules'], expected['rules'])
            self.close(row['sourceJets'], expected['sourceJets'])
            self.close(row['angle2D'], expected['angle2D'])
        json.dumps(result, allow_nan=False)
        return result

    def test_unit_circle_all_twenty_rules_and_physical_derivatives(self):
        self.verify_golden_case('unit-circle')

    def test_raw_nonunit_normal_and_fixed_zero_outside_display(self):
        result = self.verify_golden_case('nonunit-normal-fixed-zero-outside-view')
        self.assertEqual(result['domain']['integrationInterval'], [0., 2.])
        self.assertEqual(result['diagnostics']['initialTangentMagnitude'], 5.)
        self.assertFalse(result['diagnostics']['initialTangentMagnitudePreserved'])
        self.assertNotEqual(result['sample']['rows'][0]['recoveredCurve'], result['query']['initialPoint'])

    def test_nonorthogonal_normal_original_geodesic_torsion(self):
        result = self.verify_golden_case('nonorthogonal-normal')
        row = result['sample']['rows'][-1]
        # For constant U the modern -L.U'/v is zero.  The original is -.8.
        self.assertAlmostEqual(row['rules']['GeodesicTorsion3D'], -.8, places=12)
        self.assertEqual(row['rules']['SurfaceNormalVector3D'], [1., 1., 2.])

    def test_variable_normal_helix_independent_closed_angle_and_quad(self):
        self.verify_golden_case('variable-normal-helix')

    def test_straight_curve_recovers_while_original_frame_rules_stay_undefined(self):
        result = self.verify_golden_case('straight-with-undefined-source-frame')
        undefined = {item['key'] for item in result['sample']['rows'][0]['undefined']}
        self.assertEqual(undefined, {'Torsion3D', 'FrenetDarbouxAngle', 'GeodesicTorsion3D',
                                     'NormalVector3D', 'BinormalVector3D'})
        self.assertTrue(result['certification']['allSampledRecoveredPointsFinite'])
        self.assertFalse(result['certification']['allSampledRulesFinite'])

    def test_nonuniform_straight_source_cannot_manufacture_a_frenet_frame(self):
        for curve, bounds, ready in (
                (['s**2', '2*s**2', '3*s**2'], (1, 2), False),
                (['s**2', '2*s**2', '3*s**2'], (.1, .2), False),
                (['s+s**2/8', '2*s+s**2/4', '3*s+3*s**2/8'], (-.5, .5), True)):
            with self.subTest(curve=curve):
                result = uncurl.generate_uncurl_generic_query(query(curve=curve, parameterStart=bounds[0], parameterEnd=bounds[1]))
                self.assertEqual(result['domain']['recoveryStatus'], 'ready' if ready else 'undefined')
                for row in result['sample']['rows']:
                    self.assertEqual(row['rules']['Curvature3D'], 0.)
                    self.assertEqual(row['rules']['GeodesicCurvature3D'], 0.)
                    for key in ('NormalVector3D', 'BinormalVector3D', 'Torsion3D', 'GeodesicTorsion3D'):
                        self.assertIsNone(row['rules'][key], (row['s'], key))
                    if ready:
                        self.close(row['recoveredCurve'], [math.sqrt(14)*(row['s']+row['s']**2/8), 0.])
                        self.assertEqual(row['rules']['NormalVector2D'], [0., 0.])

    def test_bounded_source_identity_preserves_function_and_rational_straight_curves(self):
        for curve, point in (
                (['sin(s)', '2*sin(s)', '3*sin(s)'], lambda s: math.sqrt(14)*math.sin(s)),
                (['s/(1+s)', '2*s/(1+s)', '3*s/(1+s)'], lambda s: math.sqrt(14)*s/(1+s))):
            with self.subTest(curve=curve):
                result = uncurl.generate_uncurl_generic_query(query(curve=curve, parameterStart=.1, parameterEnd=.2, segments=8))
                self.assertEqual(result['domain']['recoveryStatus'], 'ready')
                for row in result['sample']['rows']:
                    self.assertEqual(row['rules']['Curvature3D'], 0.)
                    self.assertEqual(row['rules']['GeodesicCurvature3D'], 0.)
                    for key in ('NormalVector3D', 'BinormalVector3D', 'Torsion3D', 'GeodesicTorsion3D'):
                        self.assertIsNone(row['rules'][key])
                    self.close(row['recoveredCurve'], [point(row['s']), 0.])

    def test_algebraic_identity_does_not_erase_original_source_pole_or_zero_speed(self):
        for curve in (['s**2/s', '2*s**2/s', '3*s**2/s'], ['s/s', '2*s/s', '3*s/s']):
            with self.subTest(curve=curve):
                q = query(curve=curve, parameterStart=.1, parameterEnd=.2, segments=8)
                result = uncurl.generate_uncurl_generic_query(q)
                self.assertEqual(result['domain']['recoveryStatus'], 'undefined')
                self.assertIsNone(result['normalization']['sourceOrigin'])
                self.assertFalse(result['certification']['allSampledRecoveredPointsFinite'])
                if curve[0] == 's/s':
                    self.assertTrue(all(row['rules']['Curvature3D'] is None for row in result['sample']['rows']))

    def test_identity_budget_unknown_is_not_a_zero_proof(self):
        compiled = uncurl._compile_sources(query(curve=['s+s**2', '2*s+2*s**2', '3*s+3*s**2']), uncurl._Budget())
        self.assertTrue(identity.prove_uncurl_straight_identity(compiled[0]))
        for name, limit in (('MAXIMUM_TERMS', 1), ('MAXIMUM_MULTIPLICATION_STEPS', 1),
                            ('MAXIMUM_DEGREE', 0), ('MAXIMUM_COEFFICIENT_BITS', 1), ('MAXIMUM_PROOF_NODES', 1)):
            with self.subTest(name=name), patch.object(identity, name, limit):
                self.assertIsNone(identity.prove_uncurl_straight_identity(compiled[0]))

    def test_maximal_constant_folding_keeps_genuine_tiny_polynomial_curvature(self):
        result = uncurl.generate_uncurl_generic_query(query(curve=['s', '(1000000000+1/10**8-1000000000)*s**2', '0']))
        self.assertEqual(result['domain']['recoveryStatus'], 'ready')
        for row in result['sample']['rows']:
            self.assertGreater(row['rules']['Curvature3D'], 0.)
            self.assertAlmostEqual(row['rules']['Curvature3D']/1e-8, 2., places=12)
            self.assertIsNotNone(row['rules']['NormalVector3D'])
            self.assertIsNotNone(row['rules']['BinormalVector3D'])

    def test_safe_signed_integer_powers_survive_constant_folding(self):
        result = uncurl.generate_uncurl_generic_query(query(curve=['(1+s)**-1', '2*(1+s)**-1', '3*(1+s)**-1']))
        self.assertEqual(result['domain']['recoveryStatus'], 'ready')
        self.assertTrue(all(row['rules']['Curvature3D'] == 0. for row in result['sample']['rows']))

    def test_radial_helix_triple_product_zero_cannot_change_planar_normal_sign(self):
        result = uncurl.generate_uncurl_generic_query(query(curve=['cos(s)', 'sin(s)', 's/2'], normal=['cos(s)', 'sin(s)', '0']))
        self.assertEqual(result['domain']['recoveryStatus'], 'ready')
        for row in result['sample']['rows']:
            self.assertEqual(row['rules']['GeodesicCurvature3D'], 0.)
            self.assertEqual(row['rules']['LeftCurvature2D'], 0.)
            self.assertEqual(row['rules']['NormalVector2D'], [0., 0.])
            self.assertEqual(row['angle2D'], 0.)
            self.close(row['recoveredCurve'], [math.sqrt(1.25)*row['s'], 0.])

    def test_genuine_nearly_straight_curvature_survives_without_epsilon_cutoff(self):
        epsilon = 1e-24
        result = uncurl.generate_uncurl_generic_query(query(curve=['s', '2*s', 's**2/10**8/10**8/10**8']))
        self.assertEqual(result['domain']['recoveryStatus'], 'ready')
        for row in result['sample']['rows']:
            v = math.hypot(1., 2., 2*epsilon*row['s'])
            self.assertGreater(row['rules']['Curvature3D'], 0.)
            self.assertAlmostEqual(row['rules']['Curvature3D']/epsilon, 2*math.sqrt(5)/v**3, places=12)
            self.assertAlmostEqual(math.hypot(*row['rules']['NormalVector3D']), 1., places=12)
            self.assertIsNotNone(row['rules']['BinormalVector3D'])
            self.assertEqual(row['rules']['GeodesicCurvature3D'], 0.)
            self.assertEqual(row['rules']['NormalVector2D'], [0., 0.])

    def test_original_notebook_literal_rule_order_and_old_call_chain(self):
        path = ROOT/'tmp'/'Origamica-15.0-reference.nb'
        if not path.exists():
            self.skipTest('原Notebook未随当前源树提供；永久独立fixture仍参与数值验收。')
        data = path.read_bytes()
        self.assertEqual(hashlib.sha256(data).hexdigest(), GOLDEN['sourceNotebookSha256'])
        lines = data.decode('utf-8').splitlines()
        old3d = '\n'.join(lines[301623:301870])
        old2d = '\n'.join(lines[288692:288882])
        call = '\n'.join(lines[306910:306970])
        pattern = r'RowBox\[\{"([A-Za-z0-9]+)", "\\\[Rule\]"'
        self.assertEqual([key for key in re.findall(pattern, old3d) if key in GOLDEN['rules']], GOLDEN['rules'][:13])
        self.assertEqual([key for key in re.findall(pattern, old2d) if key in GOLDEN['rules']], GOLDEN['rules'][13:])
        self.assertIn('"Darboux3DSystemOld"', call)
        self.assertIn('"RecoverCurve2DSystemOld"', call)
        self.assertIn('RowBox[{"cis3s", ",", "rc2s"}]', call)
        self.assertNotIn('"Normalize"', old3d)
        self.assertIn('SuperscriptBox["kp", "2"]', old3d)
        self.assertIn('RowBox[{"t", ",", "0", ",", "t"}]', old2d)
        self.assertIn('"ArcTan"', old2d)

    def test_direction_only_initial_tangent_and_negative_interval(self):
        a = uncurl.generate_uncurl_generic_query(query(parameterStart=-2., parameterEnd=-1., initialTangent=[0, 5]))
        b = uncurl.generate_uncurl_generic_query(query(parameterStart=-2., parameterEnd=-1., initialTangent=[0, .2]))
        self.assertEqual(a['domain']['integrationInterval'], [-2., 0.])
        for ra, rb in zip(a['sample']['rows'], b['sample']['rows']):
            self.close(ra['recoveredCurve'], rb['recoveredCurve'])
            s = ra['s']
            self.close(ra['recoveredCurve'], [math.cos(s)-1, math.sin(s)])
            self.assertAlmostEqual(math.hypot(*ra['rules']['TangentVector2D']), 1., places=13)

    def test_zero_initial_tangent_preserves_source_and_no_fabricated_recovery(self):
        result = uncurl.generate_uncurl_generic_query(query(initialTangent=[0, 0]))
        self.assertEqual(result['domain']['recoveryStatus'], 'undefined')
        self.assertIsNone(result['diagnostics']['initialTangentAngle'])
        for row in result['sample']['rows']:
            self.assertEqual(list(row['rules']), GOLDEN['rules'])
            self.assertIsNotNone(row['rules']['Speed3D'])
            self.assertIsNotNone(row['rules']['Speed2D'])
            self.assertIsNone(row['recoveredCurve'])
            self.assertIsNone(row['rules']['TangentVector2D'])

    def test_zero_surface_normal_is_not_normalized_or_fabricated(self):
        result = uncurl.generate_uncurl_generic_query(query(normal=['0', '0', '0']))
        self.assertEqual(result['domain']['recoveryStatus'], 'ready')
        for row in result['sample']['rows']:
            self.assertIsNone(row['rules']['FrenetDarbouxAngle'])
            self.assertEqual(row['rules']['SurfaceNormalVector3D'], [0., 0., 0.])
            self.assertEqual(row['rules']['GeodesicTorsion3D'], 0.)
            self.close(row['recoveredCurve'], [row['s'], 0.])
            self.assertEqual(row['rules']['NormalVector2D'], [0., 0.])

    def test_undefined_anchor_outside_display_cannot_move_initial_parameter(self):
        result = uncurl.generate_uncurl_generic_query(query(normal=['0', '0', '1/s'], parameterStart=1, parameterEnd=2))
        self.assertEqual(result['domain']['recoveryStatus'], 'undefined')
        self.assertEqual(result['domain']['integrationInterval'], [0., 2.])
        self.assertEqual(result['domain']['branches'][0]['parameter'], 0.)
        self.assertTrue(result['certification']['allSampledSourceValuesFinite'])
        self.assertFalse(result['certification']['allSampledRecoveredPointsFinite'])
        self.assertTrue(all(row['recoveredCurve'] is None for row in result['sample']['rows']))
        self.assertTrue(all(row['rules']['SurfaceNormalVector3D'][2] == 1/row['s'] for row in result['sample']['rows']))

    def test_original_zero_speed_rules_and_failed_anchor_are_not_success(self):
        result = uncurl.generate_uncurl_generic_query(query(curve=['s**2', '0', '0']))
        center = result['sample']['rows'][16]
        self.assertEqual(center['rules']['Speed3D'], 0.)
        self.assertIsNone(center['rules']['GeodesicCurvature3D'])
        self.assertIsNone(center['rules']['TangentVector3D'])
        self.assertEqual(result['domain']['recoveryStatus'], 'undefined')
        self.assertFalse(result['certification']['allSampledRecoveredPointsFinite'])
        self.assertEqual(center['sourceCurve'], [0., 0., 0.])

    def test_constant_sqrt_zero_vs_unsupported_radical_identity(self):
        constant = uncurl.generate_uncurl_generic_query(query(curve=['sin(s)', '1-cos(s)', 'sqrt(0)']))
        self.assertEqual(constant['domain']['recoveryStatus'], 'ready')
        for source in ('sqrt(s-s)', 'sqrt(s**4)'):
            with self.subTest(source=source):
                result = uncurl.generate_uncurl_generic_query(query(curve=[source, 's', '0']))
                center = result['sample']['rows'][16]
                self.assertEqual(center['sourceJets']['curve'][0][0], 0.)
                self.assertIsNone(center['sourceJets']['curve'][1][0])
                self.assertTrue(any(item['code'] == 'source-jet-undefined' for item in center['undefinedSourceJets']))
                self.assertEqual(result['domain']['recoveryStatus'], 'undefined')

    def test_nonreal_source_does_not_resurrect_formal_derivatives(self):
        result = uncurl.generate_uncurl_generic_query(query(curve=['log(s)', 's', '0']))
        row = result['sample']['rows'][0]
        self.assertTrue(all(jet[0] is None for jet in row['sourceJets']['curve']))
        self.assertIsNone(row['sourceCurve'])
        self.assertIsNotNone(row['sourceJets']['curve'][1][1])
        self.assertFalse(result['certification']['allSampledSourceValuesFinite'])
        json.dumps(result, allow_nan=False)

    def test_positive_branch_can_survive_negative_source_failure(self):
        result = uncurl.generate_uncurl_generic_query(query(parameterStart=-2, parameterEnd=.5, normal=['0', '0', 'log(s+1)']))
        self.assertEqual(result['domain']['recoveryStatus'], 'partial')
        self.assertEqual([x['status'] for x in result['domain']['branches']], ['undefined', 'ready'])
        self.assertFalse(result['certification']['allSampledSourceValuesFinite'])
        self.assertIsNotNone(result['sample']['rows'][-1]['recoveredCurve'])
        self.assertIsNone(result['sample']['rows'][0]['recoveredCurve'])

    def test_tiny_and_huge_scales_do_not_square_physical_curvature(self):
        factors = [('(10**8)**8*(10**8)**8*(10**6)**2', 1e140),
                   ('1/((10**8)**8*(10**8)**8*(10**6)**2)', 1e-140),
                   ('(10**8)**8*(10**8)**8*(10**8)**8*10**8', 1e200),
                   ('1/((10**8)**8*(10**8)**8*(10**8)**8*10**8)', 1e-200)]
        for text, scale in factors:
            with self.subTest(scale=scale):
                result = uncurl.generate_uncurl_generic_query(query(curve=[f'({text})*s', f'({text})*s**2/2', '0'], normal=['1', '1', '2']))
                self.assertEqual(result['domain']['recoveryStatus'], 'ready')
                self.assertTrue(result['certification']['allSampledRulesFinite'])
                for row in result['sample']['rows']:
                    s = row['s']
                    v = math.sqrt(1+s*s)
                    self.close(row['rules']['GeodesicTorsion3D']*scale, -2*s/(1+s*s))
                    self.close(row['rules']['GeodesicCurvature3D']*scale, 2/v**3)
                    self.close([x/scale for x in row['recoveredCurve']], [1.5*math.asinh(s)-s*v/2, 2*(v-1)])

    def test_compensated_source_and_recovered_positions_keep_tiny_offsets(self):
        result = uncurl.generate_uncurl_generic_query(query(curve=['1000000000+1/10**8*sin(s)', '1000000000+1/10**8*(1-cos(s))', '0'],
                                                      initialPoint=[1e9, 1e9]))
        self.assertEqual(result['normalization']['sourceOrigin'], [1e9, 1e9, 0.])
        self.assertEqual(result['normalization']['recoveredOrigin'], [1e9, 1e9])
        self.assertEqual(result['domain']['recoveryStatus'], 'ready')
        last = result['sample']['rows'][-1]
        # Binary64 world positions collapse, while compensated display offsets do not.
        self.assertEqual(last['sourceCurve'], [1e9, 1e9, 0.])
        self.assertGreater(abs(last['normalizedSourceCurve'][0]), .4)
        self.assertGreater(abs(last['normalizedRecoveredCurve'][0]), .4)
        self.close(last['normalizedSourceCurve'][:2], last['normalizedRecoveredCurve'])

    def test_numeric_certificates_never_claim_symbolic_or_fold_objects(self):
        result = uncurl.generate_uncurl_generic_query(query())
        for key in ('continuousDomainCertified', 'integrationErrorIntervalCertified',
                    'symbolicObjectsReproduced', 'wolframOptionsReproduced',
                    'exactStraightCreaseFOLD', 'adoptableCreasePattern', 'globalFoldingCertified'):
            self.assertFalse(result['certification'][key])
        self.assertFalse(result['source']['wolframNumericOutAvailable'])
        self.assertEqual(result['source']['simplification'], 'None')
        self.assertEqual(result['source']['assumptions'], [])

    def test_finite_input_budget_and_unknown_options(self):
        cases = [query(parameterStart=10**310), query(initialPoint=[10**310, 0]),
                 query(initialTangent=[True, 0]), query(segments=True),
                 query(parameterEnd=.5, parameterStart=.5), query(initialParameter=.5),
                 query(simplification='FullSimplify'), query(assumptions=['s>0'])]
        for data in cases:
            with self.subTest(data=data):
                with self.assertRaises(GenericLinkedError):
                    uncurl.generate_uncurl_generic_query(data)

    def test_unsafe_expression_rejected_without_execution(self):
        for source in ('__import__("os")', 's.real', 'unknown(s)', '[s,s]', 's**9', '1e300'):
            with self.subTest(source=source):
                with self.assertRaises(GenericLinkedError):
                    uncurl.generate_uncurl_generic_query(query(normal=['0', '0', source]))

    def test_actual_offset_product_budget_is_hard_error_not_null(self):
        with patch.dict(uncurl.LIMITS, maximumOffsetProducts=1024):
            with self.assertRaises(uncurl.GenericUncurlError) as error:
                uncurl.generate_uncurl_generic_query(query(normal=['0', '0', '((s+1+1+1+1)**4)**2']))
        self.assertEqual(error.exception.code, 'evaluation-budget')

    def test_actual_integration_and_ast_budgets_are_hard_errors(self):
        for key, limit, code in (('maximumIntegrationEvaluations', 5, 'integration-budget'),
                                 ('maximumAstWeightedEvaluations', 12, 'evaluation-budget')):
            with self.subTest(key=key), patch.dict(uncurl.LIMITS, **{key: limit}):
                with self.assertRaises(uncurl.GenericUncurlError) as error:
                    uncurl.generate_uncurl_generic_query(query())
                self.assertEqual(error.exception.code, code)

    def test_overflowing_display_scale_cannot_be_fabricated_as_one(self):
        with self.assertRaises(uncurl.GenericUncurlError) as error:
            uncurl.generate_uncurl_generic_query(query(curve=['exp(709)*s', '0', '0'], parameterStart=0, parameterEnd=10))
        self.assertEqual(error.exception.code, 'normalization-scale')

    def test_staged_responses_retain_actual_query_and_contract(self):
        for name in ('plane', 'nonunit-normal', 'nonorthogonal-normal', 'helix', 'straight', 'anchor-pole'):
            with self.subTest(name=name):
                fixture = json.loads((FIXTURES/f'origamica-uncurl-generic-{name}.json').read_text(encoding='utf-8'))
                result = uncurl.generate_uncurl_generic_query(fixture['query'])
                self.assertEqual(result['source'], fixture['source'])
                self.assertEqual(result['domain']['recoveryStatus'], fixture['domain']['recoveryStatus'])
                for actual, expected in zip(result['sample']['rows'], fixture['sample']['rows']):
                    self.close(actual['rules'], expected['rules'])
                    self.close(actual['sourceJets'], expected['sourceJets'])


if __name__ == '__main__':
    unittest.main()
