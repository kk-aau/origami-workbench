"""True-source Ribbon regressions, staged while the parent full batch runs."""
import copy,math,sys,unittest
from functools import lru_cache
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1] if Path(__file__).parent.name=='backend' else Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'backend'))
from tessellation_curved_ribbon_generic import PRESET,query_ribbon_generic
def compact(**changes):return {**copy.deepcopy(PRESET),'segments':8,'rulingSegments':3,**changes}
@lru_cache(None)
def base():return query_ribbon_generic(compact())
def space(s):return np.array([math.sin(s),s*s/4,1-math.cos(s)])
def flat(s):return np.array([s,s*s/4])
class GenericRibbonTests(unittest.TestCase):
    def test_true_noncircular_four_sources_match_independent_closed_pair(self):
        r=base();self.assertEqual(r['source']['functions'],['RibbonPair','NRibbonPair'])
        self.assertEqual(r['source']['initialArgumentOrder'],['ui','ci','ti'])
        self.assertTrue(r['certification']['formalIsometryCertified'])
        for row in r['sample']['rows']:
            s=row['s'];np.testing.assert_allclose(row['sourceBase'],space(s),atol=3e-14)
            np.testing.assert_allclose(row['targetBase'],flat(s),atol=3e-12)
            np.testing.assert_allclose(row['sourceDirector'],[0,1,0],atol=3e-14)
            np.testing.assert_allclose(row['targetDirector'],[0,1],atol=3e-12)
            self.assertAlmostEqual(row['coefficients']['g'],.5/(1+s*s/4),12)
        for key in ('integrationErrorIntervalCertified','globalInjectivityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern'):
            self.assertFalse(r['certification'][key])

    def test_original_circle_in3855_eta_quarter_pi(self):
        r=query_ribbon_generic(compact(spaceCurve=['cos(s)','sin(s)','0'],normalAngle='pi/4',parameterEnd=math.pi))
        g=math.sqrt(.5)
        for row in r['sample']['rows']:
            s=row['s'];np.testing.assert_allclose(row['sourceDirector'],[-g*math.cos(s),-g*math.sin(s),-g],atol=3e-14)
            np.testing.assert_allclose(row['targetBase'],[math.sin(g*s)/g,(1-math.cos(g*s))/g],atol=4e-12)
            np.testing.assert_allclose(row['targetDirector'],[-math.sin(g*s),math.cos(g*s)],atol=4e-12)
        self.assertTrue(r['certification']['sourceStripRegularityCertified'])

    def test_sigma_only_changes_both_rulings_not_source_curve_or_recovery(self):
        r=query_ribbon_generic(compact(sigma=-1))
        for a,b in zip(base()['sample']['rows'],r['sample']['rows']):
            np.testing.assert_allclose(b['targetBase'],a['targetBase'],atol=3e-12)
            for key in ('sourceDirector','targetDirector'):
                np.testing.assert_allclose(b[key],-np.array(a[key]),atol=3e-12)
            self.assertEqual(b['coefficients']['q'],a['coefficients']['q'])
        self.assertEqual(r['domain']['sourceStripRegularity']['orientation'],-base()['domain']['sourceStripRegularity']['orientation'])

    def test_eta_negative_uses_literal_sign_and_space_side(self):
        r=query_ribbon_generic(compact(normalAngle='-atan(sqrt(4+s**2))'))
        for row in r['sample']['rows']:
            s=row['s'];den=math.sqrt(s**4+6*s*s+25)
            np.testing.assert_allclose(row['sourceDirector'],[-4*math.sin(s)/den,-(3+s*s)/den,4*math.cos(s)/den],atol=4e-14)
            np.testing.assert_allclose(row['targetDirector'],[-4*s/den,(5-s*s)/den],atol=4e-12)

    def test_ui_inside_original_domain_and_arbitrary_raw_unit_pose_integrate_both_ways(self):
        ui=.37;point=np.array([3.,-4.]);ti=np.array([.6,.8]);v=math.sqrt(1+ui*ui/4)
        sourceframe=np.array([[1/v,-ui/(2*v)],[ui/(2*v),1/v]])
        targetframe=np.array([[.6,-.8],[.8,.6]]);rotation=targetframe@sourceframe.T
        r=query_ribbon_generic(compact(initialParameter=ui,initialPoint=point.tolist(),initialTangent=ti.tolist()))
        self.assertGreater(r['diagnostics']['integration']['backwardEvaluations'],0);self.assertGreater(r['diagnostics']['integration']['forwardEvaluations'],0)
        for row in r['sample']['rows']:
            np.testing.assert_allclose(row['targetBase'],point+rotation@(flat(row['s'])-flat(ui)),atol=3e-12)
            np.testing.assert_allclose(row['targetDirector'],rotation@np.array([0,1]),atol=3e-12)

    def test_explicit_nonuniform_parameter_nonzero_start_and_ui(self):
        u='(s+s**3/10)';ui=.41;q=compact(spaceCurve=[f'sin({u})',f'{u}**2/4',f'1-cos({u})'],normalAngle=f'atan(sqrt(4+{u}**2))',parameterStart=.23,parameterEnd=1.1,initialParameter=ui)
        r=query_ribbon_generic(q);u0=ui+ui**3/10;v0=math.sqrt(1+u0*u0/4);rotation=np.array([[1/v0,u0/(2*v0)],[-u0/(2*v0),1/v0]])
        for row in r['sample']['rows']:
            us=row['s']+row['s']**3/10;np.testing.assert_allclose(row['sourceBase'],space(us),atol=4e-14)
            np.testing.assert_allclose(row['targetBase'],rotation@(flat(us)-flat(u0)),atol=4e-12)
        self.assertEqual(r['query'],q)

    def test_reverse_parameter_is_preserved_without_positive_q_gate(self):
        r=query_ribbon_generic(compact(spaceCurve=['-sin(s)','s**2/4','1-cos(s)']))
        for row in r['sample']['rows']:
            s=row['s'];den=math.sqrt(s**4+6*s*s+25)
            np.testing.assert_allclose(row['sourceBase'],space(-s),atol=4e-14)
            np.testing.assert_allclose(row['sourceDirector'],[4*math.sin(s)/den,-(3+s*s)/den,4*math.cos(s)/den],atol=4e-14)
        self.assertTrue(r['certification']['formalIsometryCertified'])

    def test_true_variable_eta_helix_and_preserved_source_derivatives(self):
        r=query_ribbon_generic(compact(spaceCurve=['2*cos(s)','2*sin(s)','s/2'],normalAngle='.7+.1*sin(s)',parameterStart=.17,initialParameter=.37))
        self.assertTrue(r['certification']['finiteMetricVerified'])
        for row in r['sample']['rows']:
            s=row['s'];self.assertAlmostEqual(row['normalAngleDerivative'],.1*math.cos(s),13)
            np.testing.assert_allclose(row['sourceBaseDerivative'],[-2*math.sin(s),2*math.cos(s),.5],atol=3e-14)

    def test_tiny_similarity_large_translation_uses_source_natural_metric_scale(self):
        for factor in (1e-6,1e-8):
            r=query_ribbon_generic(compact(spaceCurve=[f'1e9+{factor}*({x})' for x in PRESET['spaceCurve']],initialPoint=[1e9,1e9],transverseStart=-.15*factor,transverseEnd=.15*factor))
            self.assertTrue(r['certification']['finiteMetricVerified'])
            for a,b in zip(base()['sample']['rows'],r['sample']['rows']):
                np.testing.assert_allclose(b['normalizedSourceBase'],a['normalizedSourceBase'],rtol=3e-13,atol=3e-12)
                np.testing.assert_allclose(b['normalizedTargetBase'],a['normalizedTargetBase'],rtol=3e-13,atol=3e-12)
                for key in ('sourceDirector','targetDirector','sourceDirectorDerivative'):
                    np.testing.assert_allclose(b[key],a[key],atol=3e-12)
                np.testing.assert_allclose(np.array(b['targetBaseDerivative'])/factor,a['targetBaseDerivative'],atol=3e-12)

    def test_nonunit_and_zero_original_ti_remain_raw_and_not_formally_isometric(self):
        for tangent in ([1+9e-11,0],[2,0],[0,0]):
            r=query_ribbon_generic(compact(initialTangent=tangent))
            self.assertEqual(r['initial']['tangent'],tangent);self.assertEqual(r['query']['initialTangent'],tangent)
            self.assertFalse(r['initial']['frameCompatible']);self.assertFalse(r['certification']['formalIsometryCertified'])
            self.assertEqual(r['domain']['formalStripRegularity']['status'],'unknown')
            for row in r['sample']['rows']:
                np.testing.assert_allclose(row['targetBase'],np.array(flat(row['s']))*tangent[0],atol=4e-12)
                np.testing.assert_allclose(row['targetDirector'],[0,tangent[0]],atol=4e-12)
            if tangent[0] in (0,2):self.assertFalse(r['certification']['finiteMetricVerified'])

    def test_original_sign_zero_H_positive_keeps_exact_zero_ruling_and_degeneracy(self):
        for eta in ('0','pi','s-s'):
            r=query_ribbon_generic(compact(spaceCurve=['cos(s)','sin(s)','s/2'],normalAngle=eta))
            self.assertFalse(r['certification']['finiteUnitRulingsVerified']);self.assertFalse(r['certification']['formalIsometryCertified'])
            self.assertTrue(r['certification']['finiteMetricVerified'])
            for row in r['sample']['rows']:
                np.testing.assert_array_equal(row['sourceDirector'],[0,0,0]);np.testing.assert_array_equal(row['targetDirector'],[0,0])
                np.testing.assert_array_equal(row['sourceDirectorDerivative'],[0,0,0])
                self.assertGreater(row['coefficients']['normalDerivativeLength'],0)
            self.assertEqual(r['domain']['sourceStripRegularity']['status'],'degenerate')

    def test_focus_separate_from_formal_identity_preserves_complete_width(self):
        r=query_ribbon_generic(compact(spaceCurve=['cos(s)','sin(s)','0'],normalAngle='pi/4',transverseStart=0,transverseEnd=2))
        self.assertTrue(r['certification']['formalIsometryCertified']);self.assertFalse(r['certification']['formalStripRegularityCertified'])
        self.assertEqual(r['domain']['sourceStripRegularity']['status'],'degenerate');self.assertEqual(r['query']['transverseEnd'],2)

    def test_real_unknown_retains_eta_source_and_complete_domain(self):
        eta='atan(sqrt(4+s**2))*(1+sin(5000*s)**2)/(1+sin(5000*s)**2)';r=query_ribbon_generic(compact(normalAngle=eta))
        self.assertFalse(r['domain']['certified']);self.assertFalse(r['certification']['formalIsometryCertified'])
        self.assertEqual(r['query']['normalAngle'],eta);self.assertEqual(len(r['grid']),9);self.assertEqual(len(r['grid'][0]['source']),4)
        pieces=sorted([[c['start'],c['end']] for c in r['domain']['cells']]+r['domain']['unresolved'])
        self.assertEqual(pieces[0][0],0);self.assertEqual(pieces[-1][1],1)
        for a,b in zip(pieces,pieces[1:]):self.assertEqual(a[1],b[0])

    def test_actual_Frenet_and_H_zero_division_are_not_constant_zero_sign_case(self):
        for changes in [dict(spaceCurve=['s','0','0']),dict(spaceCurve=['s','s**3','0'],parameterStart=-1,parameterEnd=1),dict(spaceCurve=['cos(s)','sin(s)','0'],normalAngle='0'),dict(normalAngle='s',parameterStart=-.5,parameterEnd=.5)]:
            with self.subTest(changes=changes),self.assertRaises(ValueError):query_ribbon_generic(compact(**changes))

    def test_safe_source_free_names_extra_keys_initials_and_budgets_are_enforced(self):
        for changes in [dict(normalAngle='__import__("os")'),dict(normalAngle='s+external'),dict(spaceCurve=['s','s.foo','0']),dict(extra=True),dict(sigma=0),dict(initialParameter=2),dict(initialPoint=[1]),dict(segments=129),dict(rulingSegments=65)]:
            with self.subTest(changes=changes),self.assertRaises(ValueError):query_ribbon_generic(compact(**changes))

    def test_nonfinite_normalized_metric_budget_never_returns_nan_or_false_pass(self):
        with self.assertRaises(ValueError):query_ribbon_generic(compact(spaceCurve=[f'1e-200*({x})' for x in PRESET['spaceCurve']]))

if __name__=='__main__':unittest.main()
