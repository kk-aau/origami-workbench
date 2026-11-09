"""Literal special Cone/Tandev regressions, independently checked before promotion."""
import copy,math,sys,unittest
from functools import lru_cache
from pathlib import Path
import numpy as np
from scipy.integrate import quad
ROOT=Path(__file__).resolve().parents[1] if Path(__file__).parent.name=='backend' else Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'backend'))
from tessellation_curved_reshape_special_generic import CONE_PRESET,TANDEV_PRESET,query_special_reshape,SpecialReshapeKernel,validate_special_reshape_query

def compact(cone,**changes):return {**copy.deepcopy(CONE_PRESET if cone else TANDEV_PRESET),'segments':8,'rulingSegments':3,**changes}
@lru_cache(None)
def default(cone):return query_special_reshape(compact(cone),cone)
def b(s):return np.array([math.sin(s),s*s/4,1-math.cos(s)])
def frame(s):
    v=math.sqrt(1+s*s/4);vp=s/(4*v);t=np.array([math.cos(s),s/2,math.sin(s)])/v
    tp=np.array([-math.sin(s),.5,math.cos(s)])/v-t*vp/v
    return t,np.cross(t,tp/np.linalg.norm(tp))
def cone_speed(s):return 2*math.sqrt(1+.16*s*s)/(1+s*s+(.3+.2*s*s)**2)

class SpecialReshapeTests(unittest.TestCase):
    def test_true_noncircular_cone_discards_auxiliary_curve_and_obeys_original_ODE(self):
        r=default(True);q=r['query'];di=np.array(q['initialDirector']);ui=np.array(q['initialNormal']);ti=np.cross(di,ui)
        for row in r['sample']['rows']:
            s=row['s'];angle=quad(cone_speed,0,s,epsabs=2e-13,epsrel=2e-13)[0]
            t=ti*math.cos(angle)-di*math.sin(angle);d=ti*math.sin(angle)+di*math.cos(angle)
            np.testing.assert_allclose(row['targetBase'],[0,0,0],atol=0)
            np.testing.assert_allclose(row['targetDirector'],d,atol=3e-12)
            np.testing.assert_allclose(row['targetDirectorDerivative'],cone_speed(s)*t,atol=4e-12)
            self.assertAlmostEqual(row['coefficients']['g'],-cone_speed(s),13)
        self.assertTrue(r['source']['discardedRecoveredCrossCurve']);self.assertTrue(r['certification']['formalIsometryCertified'])

    def test_true_noncircular_tandev_recovers_original_curve_and_raw_tangent(self):
        r=default(False)
        for row in r['sample']['rows']:
            t,u=frame(row['s']);np.testing.assert_allclose(row['targetBase'],b(row['s']),atol=4e-12)
            np.testing.assert_allclose(row['targetDirector'],t,atol=4e-12);np.testing.assert_allclose(row['sourceAuxiliaryNormal'],u,atol=4e-14)
        self.assertEqual(r['initial']['zeta'],1);self.assertTrue(r['certification']['formalIsometryCertified'])

    def test_four_cone_sign_branches_preserve_literal_initials(self):
        for sigma in (-1,1):
            for psi in (-1,1):
                r=query_special_reshape(compact(True,sigma=sigma,psi=psi),True);q=r['query'];l=sigma*np.array(q['initialDirector']);t=np.cross(l,q['initialNormal'])
                for row in r['sample']['rows']:
                    a=-sigma*psi*quad(cone_speed,0,row['s'],epsabs=2e-13)[0]
                    np.testing.assert_allclose(row['targetDirector'],sigma*(-t*math.sin(a)+l*math.cos(a)),atol=4e-12)
                self.assertTrue(r['certification']['finiteMetricVerified'])

    def test_original_varying_beta_and_torsion_are_parameter_coefficients(self):
        for cone,key in [(True,'beta'),(False,'torsion')]:
            r=query_special_reshape(compact(cone,**{key:'.2+.1*sin(s)'}),cone)
            for row in r['sample']['rows']:
                self.assertAlmostEqual(row['coefficients']['h' if cone else 'z'],.2+.1*math.sin(row['s']),14)
            self.assertTrue(r['certification']['finiteMetricVerified'])
            self.assertGreater(np.linalg.norm(np.array(r['sample']['rows'][-1]['targetDirector'])-default(cone)['sample']['rows'][-1]['targetDirector']),.01)

    def test_tandev_interior_initial_parameter_recovers_both_directions_and_pose(self):
        ui=.37;t,u=frame(ui);point=np.array([3.,-4.,2.])
        r=query_special_reshape(compact(False,initialParameter=ui,initialPoint=point.tolist(),initialDirector=t.tolist(),initialNormal=u.tolist()),False)
        for row in r['sample']['rows']:np.testing.assert_allclose(row['targetBase'],point+b(row['s'])-b(ui),atol=4e-12)
        for key in ('backwardEvaluations','forwardEvaluations'):self.assertGreater(r['diagnostics']['integration'][key],0)

    def test_explicit_nonuniform_source_requires_literal_parameter_torsion(self):
        u='(s+s**3/10)'
        q=compact(False,baseCurve=[f'sin({u})',f'{u}**2/4',f'1-cos({u})'],director=[f'cos({u})/sqrt(1+{u}**2/4)',f'({u}/2)/sqrt(1+{u}**2/4)',f'sin({u})/sqrt(1+{u}**2/4)'],torsion=f'-2*{u}*sqrt(1+{u}**2/4)/(5+{u}**2)*(1+3*s**2/10)')
        r=query_special_reshape(q,False)
        for row in r['sample']['rows']:
            us=row['s']+row['s']**3/10;np.testing.assert_allclose(row['targetBase'],b(us),atol=4e-12)
            np.testing.assert_allclose(row['targetDirector'],frame(us)[0],atol=4e-12)
        self.assertEqual(r['query'],q)

    def test_reverse_parameter_and_antiparallel_raw_source_direction(self):
        q=compact(False,baseCurve=['-sin(s)','s**2/4','1-cos(s)'],director=['cos(s)/sqrt(1+s**2/4)','(-s/2)/sqrt(1+s**2/4)','-sin(s)/sqrt(1+s**2/4)'],torsion='2*s*sqrt(1+s**2/4)/(5+s**2)',initialNormal=[0,2/math.sqrt(5),-1/math.sqrt(5)])
        r=query_special_reshape(q,False);self.assertEqual(r['initial']['zeta'],-1)
        for row in r['sample']['rows']:
            np.testing.assert_allclose(row['targetBase'],b(-row['s']),atol=4e-12)
            np.testing.assert_allclose(row['targetDirector'],frame(-row['s'])[0],atol=4e-12)
        self.assertTrue(r['certification']['formalIsometryCertified'])

    def test_noncone_base_is_not_rejected_or_silently_replaced(self):
        q=compact(True,baseCurve=['s','.1*s**2','0']);r=query_special_reshape(q,True)
        self.assertEqual(r['query'],q);self.assertFalse(r['certification']['sourceCompatibilityAnalytic']);self.assertFalse(r['certification']['finiteMetricVerified'])
        for row in r['sample']['rows']:
            np.testing.assert_array_equal(row['targetBase'],[0,0,0]);np.testing.assert_allclose(row['sourceBase'],[row['s'],.1*row['s']**2,0],atol=2e-15)

    def test_raw_nonunit_tandev_normal_and_zeta_are_not_normalized(self):
        r=query_special_reshape(compact(False,director=[f'2*({x})' for x in TANDEV_PRESET['director']]),False)
        self.assertAlmostEqual(r['initial']['zeta'],2);self.assertFalse(r['certification']['formalIsometryCertified'])
        self.assertFalse(r['certification']['finiteMetricVerified'])
        for row in r['sample']['rows']:self.assertAlmostEqual(np.linalg.norm(row['sourceAuxiliaryNormal']),2,12)
        np.testing.assert_array_equal(r['sample']['rows'][0]['targetDirector'],[4,0,0])

    def test_zero_and_nonunit_initial_vectors_return_literal_geometry_with_false_frame(self):
        for cone,changes in [(True,{'initialDirector':[0,2,0],'initialNormal':[0,0,1]}),(False,{'initialDirector':[0,0,0],'initialNormal':[0,0,0]})]:
            r=query_special_reshape(compact(cone,**changes),cone);self.assertFalse(r['certification']['initialFrameCompatible']);self.assertFalse(r['certification']['formalIsometryCertified'])
            self.assertEqual(r['domain']['formalStripRegularity']['status'],'unknown');self.assertIsNone(r['domain']['formalStripRegularity']['minimumAreaSquaredLowerBound'])
            for key in changes:self.assertEqual(r['query'][key],changes[key])
        for row in r['sample']['rows']:np.testing.assert_array_equal(row['targetDirector'],[0,0,0])

    def test_constant_cone_director_is_computable_while_tandev_normalization_is_undefined(self):
        r=query_special_reshape(compact(True,director=['0','1','0'],initialDirector=[0,1,0],initialNormal=[0,0,1]),True)
        for row in r['sample']['rows']:
            self.assertFalse(row['sourceAuxiliaryFrameDefined']);np.testing.assert_array_equal(row['targetDirector'],[0,1,0]);self.assertEqual(row['coefficients']['g'],0)
        self.assertFalse(r['certification']['formalStripRegularityCertified'])
        with self.assertRaises(ValueError):query_special_reshape(compact(False,director=['1','0','0']),False)
        with self.assertRaises(ValueError):query_special_reshape(compact(False,baseCurve=['0','0','0']),False)

    def test_true_tiny_scaled_paper_and_large_translation_keep_normalized_geometry(self):
        for cone in (False,True):
            q=compact(cone,baseCurve=['1e9','1e9','1e9'] if cone else [f'1e9+1e-8*({x})' for x in TANDEV_PRESET['baseCurve']],initialPoint=[1e9]*3,transverseStart=(.2 if cone else .15)*1e-8,transverseEnd=(1 if cone else .5)*1e-8)
            r=query_special_reshape(q,cone);self.assertTrue(r['certification']['finiteMetricVerified']);self.assertTrue(r['certification']['formalIsometryCertified'])
            self.assertLess(r['normalization']['scale'],2e-8)
            for a,c in zip(default(cone)['grid'],r['grid']):
                np.testing.assert_allclose(c['normalizedSource'],a['normalizedSource'],atol=3e-14);np.testing.assert_allclose(c['normalizedTarget'],a['normalizedTarget'],atol=4e-12)

    def test_apex_and_edge_are_retained_and_separate_from_formal_isometry(self):
        for cone in (True,False):
            r=query_special_reshape(compact(cone,transverseStart=0,transverseEnd=.5),cone)
            self.assertTrue(r['certification']['formalIsometryCertified'])
            for key in ('sourceStripRegularity','formalStripRegularity'):self.assertEqual(r['domain'][key]['status'],'degenerate')
            self.assertFalse(r['certification']['adoptableCreasePattern']);self.assertFalse(r['certification']['integrationErrorIntervalCertified'])

    def test_interval_unknown_retains_complete_original_source_and_target(self):
        f='(2+sin(4000*s)+cos(4000*s))';q=compact(True,director=[f'cos(s)*{f}/{f}',f'sin(s)*{f}/{f}','0'],initialDirector=[1,0,0],initialNormal=[0,0,1])
        r=query_special_reshape(q,True);self.assertFalse(r['domain']['certified']);self.assertEqual(r['domain']['evaluations'],1024)
        self.assertFalse(r['certification']['formalIsometryCertified']);self.assertEqual(r['query'],q);self.assertEqual(len(r['sample']['rows']),9)
        self.assertTrue(r['domain']['unresolved']);self.assertEqual(r['grid'][-1]['s'],q['parameterEnd'])

    def test_safe_source_and_initial_domain_errors_never_execute_or_erase_original_poles(self):
        for changes in ({'beta':'__import__("os").getcwd()'},{'director':['1/(s-s)','0','1']},{'initialParameter':2},{'sigma':True},{'initialDirector':[float('nan'),0,0]},{'extra':1}):
            with self.assertRaises(ValueError):query_special_reshape(compact(True,**changes),True)
        # A sufficient unit identity cannot cancel the original divisor pole.
        with self.assertRaises(ValueError):query_special_reshape(compact(True,director=['(s-.5)/(s-.5)','0','0']),True)

if __name__=='__main__':unittest.main()
