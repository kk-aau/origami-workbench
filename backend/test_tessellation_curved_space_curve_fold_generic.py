"""Four-source literal geometry tests, staged outside discovery until frozen."""
import copy, math, sys, unittest
from functools import lru_cache
from pathlib import Path
import numpy as np
ROOT = Path(__file__).resolve().parents[1] if Path(__file__).parent.name == 'backend' else Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'backend'))
from tessellation_curved_space_curve_fold_generic import PRESET, query_space_curve_fold_generic
def compact(**changes): return {**copy.deepcopy(PRESET), 'segments': 8, 'rulingSegments': 3, **changes}
@lru_cache(None)
def baseline(): return query_space_curve_fold_generic(compact())
def spatial(s):
    return np.array([math.sin(s), s*s/4, 1-math.cos(s)]), np.array([0.,1.,0.]), np.array([4*math.sin(s),3+s*s,-4*math.cos(s)])/math.sqrt(s**4+6*s*s+25)
def planar(s): return np.array([1-s*s/4,s]), np.array([-1.,0.]), np.array([5-s*s,4*s])/math.sqrt(s**4+6*s*s+25)
def natural_metric(a,b):
    e,g=max(a[0],b[0]),max(a[2],b[2]); den=np.maximum([e,math.sqrt(e)*math.sqrt(g),g],np.finfo(float).tiny)
    return float(np.max(np.abs(np.array(a)-b)/den))

class SpaceCurveFoldTests(unittest.TestCase):
    def test_true_noncircular_source_and_original_fixed_planar_wrapper(self):
        r=baseline()
        self.assertEqual(r['source']['functions'],['FoldSpaceCurve3D','NSpaceCurveFold3D'])
        self.assertEqual(r['initial'],{'parameter':0.,'point':[1.,0.],'tangent':[0.,1.],'argumentOrder':['ui','fi','ti']})
        self.assertTrue(r['certification']['formalCommonFlatteningCertified'])
        for row in r['sample']['rows']:
            for prefix,expected in [('source',spatial(row['s'])),('target',planar(row['s']))]:
                for suffix,vector in zip(('Base','LeftDirector','RightDirector'),expected):
                    np.testing.assert_allclose(row[prefix+suffix],vector,rtol=0,atol=4e-12)
            s=row['s'];v=math.sqrt(1+s*s/4)
            self.assertAlmostEqual(row['coefficients']['curvature'],.5*math.sqrt(5+s*s)/v**3,12)
            self.assertAlmostEqual(row['coefficients']['torsion'],-2*s/(5+s*s),12)
            self.assertAlmostEqual(row['coefficients']['g'],.5/(v*v),12)
        for key in ('integrationErrorIntervalCertified','globalInjectivityChecked','selfCollisionChecked','exactStraightCreaseFOLD','adoptableCreasePattern'):
            self.assertFalse(r['certification'][key])

    def test_signed_circle_gamma_respects_different_left_right_sign_formulas(self):
        for sign in (1,-1):
            r=query_space_curve_fold_generic(compact(foldCurve=['cos(s)','sin(s)','0'],foldAngle=f'{sign}*2*pi/3'))
            for row in r['sample']['rows']:
                s=row['s'];c=math.cos(s);sn=math.sin(s)
                np.testing.assert_allclose(row['sourceLeftDirector'],[-c/2,-sn/2,sign*math.sqrt(3)/2],atol=3e-14)
                np.testing.assert_allclose(row['sourceRightDirector'],[c/2,sn/2,sign*math.sqrt(3)/2],atol=3e-14)
                np.testing.assert_allclose(row['targetBase'],[2*math.cos(s/2)-1,2*math.sin(s/2)],atol=3e-12)
            self.assertTrue(r['certification']['finiteRightMetricVerified'])

    def test_gamma_pi_is_regular_here_and_no_secant_angle_gate_is_inherited(self):
        r=query_space_curve_fold_generic(compact(foldCurve=['cos(s)','sin(s)','s/4'],foldAngle='pi'))
        self.assertTrue(r['certification']['sourceRegularityCertified'])
        self.assertTrue(r['certification']['finiteUnitRulingsVerified'])
        for row in r['sample']['rows']:
            self.assertEqual(row['foldAngleRad'],math.pi)
            self.assertLess(abs(row['coefficients']['g']),1e-15)

    def test_orientation_is_not_a_planar_curvature_or_parameter_sign(self):
        r=query_space_curve_fold_generic(compact(orientation=-1))
        for a,b in zip(baseline()['sample']['rows'],r['sample']['rows']):
            for side in ('Left','Right'):
                np.testing.assert_allclose(b['source'+side+'Director'],-np.array(a['source'+side+'Director']),atol=3e-14)
            np.testing.assert_allclose(b['targetBase'],[1+b['s']**2/4,b['s']],atol=4e-12)
        self.assertTrue(r['certification']['finiteSharedGeodesicCurvatureVerified'])

    def test_nonlinear_common_parameter_and_nonzero_wrapper_start(self):
        u='(s+s**3/10)';a=.23
        q=compact(foldCurve=[f'sin({u})',f'{u}**2/4',f'1-cos({u})'],foldAngle=f'-2*atan(sqrt(4+{u}**2))',parameterStart=a,parameterEnd=1.1)
        r=query_space_curve_fold_generic(q);u0=a+a**3/10;v0=math.sqrt(1+u0*u0/4)
        rotation=np.array([[u0/(2*v0),-1/v0],[1/v0,u0/(2*v0)]])
        for row in r['sample']['rows']:
            s=row['s'];u1=s+s**3/10;np.testing.assert_allclose(row['sourceBase'],spatial(u1)[0],atol=3e-14)
            expected=np.array([1.,0.])+rotation@np.array([u1-u0,(u1*u1-u0*u0)/4])
            np.testing.assert_allclose(row['targetBase'],expected,atol=4e-12)
        self.assertEqual(r['query'],q);self.assertEqual(r['initial']['parameter'],a)

    def test_reverse_parameter_keeps_original_side_swap_and_sign(self):
        r=query_space_curve_fold_generic(compact(foldCurve=['-sin(s)','s**2/4','1-cos(s)']))
        for row in r['sample']['rows']:
            b,l,rr=spatial(-row['s'])
            np.testing.assert_allclose(row['sourceBase'],b,atol=3e-14)
            np.testing.assert_allclose(row['sourceLeftDirector'],-rr,atol=3e-14)
            np.testing.assert_allclose(row['sourceRightDirector'],-l,atol=3e-14)
        self.assertTrue(r['certification']['formalCommonFlatteningCertified'])

    def test_variable_gamma_true_helix_source_produces_real_curves_and_jets(self):
        r=query_space_curve_fold_generic(compact(foldCurve=['2*cos(s)','2*sin(s)','s/2'],foldAngle='1.4+.2*sin(s)',parameterStart=.17))
        self.assertTrue(r['certification']['finiteLeftMetricVerified']);self.assertTrue(r['certification']['finiteDevelopabilityVerified'])
        for row in r['sample']['rows']:
            s=row['s'];self.assertAlmostEqual(row['foldAngleDerivative'],.2*math.cos(s),13)
            np.testing.assert_allclose(row['sourceBaseDerivative'],[-2*math.sin(s),2*math.cos(s),.5],atol=3e-14)

    def test_similarity_large_translation_preserves_unit_output_directors(self):
        for scale in (1e-6,1e-8):
            r=query_space_curve_fold_generic(compact(foldCurve=[f'1e9+{scale}*({x})' for x in PRESET['foldCurve']],transverseEnd=.15*scale))
            self.assertTrue(r['certification']['finiteLeftMetricVerified']);self.assertTrue(r['certification']['finiteRightMetricVerified'])
            for a,b in zip(baseline()['sample']['rows'],r['sample']['rows']):
                for key in ('sourceLeftDirector','sourceRightDirector','sourceRightDirectorDerivative','targetRightDirector'):
                    np.testing.assert_allclose(b[key],a[key],rtol=3e-13,atol=3e-12)
                np.testing.assert_allclose(np.array(b['sourceBaseDerivative'])/scale,a['sourceBaseDerivative'],rtol=3e-13,atol=3e-12)
                np.testing.assert_allclose(b['normalizedSourceBase'],a['normalizedSourceBase'],rtol=3e-13,atol=3e-12)
                self.assertAlmostEqual(b['coefficients']['curvature']*scale,a['coefficients']['curvature'],11)
            for side in ('Left','Right'):
                actual=max(natural_metric(a,b) for row in r['grid'] for a,b in zip(row['source'+side+'EFG'],row['target'+side+'EFG']))
                self.assertLessEqual(actual,r['diagnostics']['maximum'+side+'RelativeMetricDifference']+1e-15)

    def test_real_budget_unknown_keeps_all_original_source_and_geometry(self):
        gamma='(-2*atan(sqrt(4+s**2)))*(1+sin(5000*s)**2)/(1+sin(5000*s)**2)'
        q=compact(foldAngle=gamma);r=query_space_curve_fold_generic(q)
        self.assertFalse(r['domain']['certified']);self.assertFalse(r['certification']['formalCommonFlatteningCertified'])
        self.assertEqual(r['query']['foldAngle'],gamma);self.assertEqual(len(r['grid']),9)
        self.assertEqual(len(r['grid'][0]['sourceLeft']),4);self.assertGreater(len(r['domain']['unresolved']),0)
        pieces=sorted([[c['start'],c['end']] for c in r['domain']['cells']]+r['domain']['unresolved'])
        self.assertEqual(pieces[0][0],0);self.assertEqual(pieces[-1][1],1)
        for a,b in zip(pieces,pieces[1:]):self.assertEqual(a[1],b[0])
        self.assertTrue(r['certification']['finiteRightMetricVerified'])

    def test_finite_focus_does_not_mean_missing_formal_common_flattening(self):
        r=query_space_curve_fold_generic(compact(foldCurve=['cos(s)','sin(s)','0'],foldAngle='2*pi/3',transverseEnd=2.5))
        self.assertTrue(r['certification']['formalCommonFlatteningCertified'])
        self.assertFalse(r['certification']['sourceLeftStripRegularityCertified'])
        self.assertEqual(r['domain']['sourceStripRegularity']['left']['status'],'degenerate')
        self.assertEqual(r['domain']['formalStripRegularity']['left']['status'],'degenerate')
        self.assertEqual(r['query']['transverseEnd'],2.5)

    def test_actual_frenet_or_sign_degeneracy_is_rejected_without_substitution(self):
        for changes in [dict(foldCurve=['s','0','0']),dict(foldCurve=['s','s**3','0'],parameterStart=-1,parameterEnd=1),dict(foldAngle='0'),dict(foldAngle='s',parameterStart=-.5,parameterEnd=.5)]:
            with self.subTest(changes=changes),self.assertRaises(ValueError):query_space_curve_fold_generic(compact(**changes))

    def test_malicious_free_names_extra_keys_and_budgets_are_rejected(self):
        for changes in [dict(foldAngle='__import__("os")'),dict(foldAngle='s+external'),dict(foldCurve=['s','s.attr','0']),dict(extra=True),dict(orientation=0),dict(segments=129),dict(rulingSegments=65),dict(parameterEnd=13),dict(initialParameter=.5)]:
            with self.subTest(changes=changes),self.assertRaises(ValueError):query_space_curve_fold_generic(compact(**changes))

if __name__=='__main__':unittest.main()
