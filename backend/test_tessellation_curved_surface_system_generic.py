"""Literal two-variable SurfaceSystem regression coverage."""
import copy
import json
import math
from pathlib import Path
import sys
import unittest

import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from tessellation_curved_surface_system_generic import (
    BASIC_RULES,PRINCIPAL_RULES,PRESET,SurfaceExpression,SurfaceJet,SurfaceSystemKernel,
    GenericSurfaceSystemError,query_generic_surface_system,validate_generic_surface_system_query)


def cases():
    def make(name,surface,**extra):return name,{**PRESET,'surface':surface,'uEnd':1.,'vStart':.1,'vEnd':1.,'uSegments':8,'vSegments':8,**extra}
    return [make('original-in3778',PRESET['surface']),
            make('plane-skew',['u+2*v','3*v','0']),
            make('mixed-saddle',['u','v','u*v']),
            make('skew-saddle',['u+2*v','v','u*v+.3*v**2']),
            make('sphere',['2*cos(u)*cos(v)','2*sin(u)*cos(v)','2*sin(v)']),
            make('two-variable-trigonometric',['u+.1*sin(u*v)','v+.2*cos(u+v)','u*v+.1*sin(v)']),
            make('rational-mixed',['u/(2+u*v)','v/(2+u*v)','u*v/(2+u*v)']),
            make('near-parallel',['u+v','1e-8*v','u*v'],uStart=.1,vStart=.2),
            make('large-offset-tiny-surface',['1e12+1e-9*u','-1e12+1e-9*v','1e12+1e-9*u*v']),
            make('tiny-v-metric',['u','1e-10*v','u**2']),
            make('sphere-without-principal',['2*cos(u)*cos(v)','2*sin(u)*cos(v)','2*sin(v)'],principalAnalysis=False),
            make('unresolved-off-grid-rank',['u','(u-.123)*(u-.123)*v','0']),
            make('wolfram-spelling',['2u','2Sin[v]','2(1-Cos[v])'])]


class SurfaceNativeProbe(unittest.TestCase):
    def test_zero_identities_match_independent_literal_eighty_digit_mixed_surface(self):
        refs=json.loads((ROOT/'tests/fixtures/origamica-surface-zero-identities-independent-80digit.json').read_text(encoding='utf8'))
        self.assertFalse(refs['productionImported']);self.assertEqual(refs['precision'],80)
        for case in refs['cases']:
            kernel=SurfaceSystemKernel({**PRESET,'surface':case['surface'],'uStart':case['uStart'],'uEnd':1.,'vEnd':1.,'uSegments':8,'vSegments':8})
            for expected in case['rows']:
                row=kernel.row(*expected['uv']);rules=row['rules']
                for field,ref in [('sourcePoint','point'),('sourceSecondDerivatives','second')]:
                    np.testing.assert_allclose(row[field],np.asarray(expected[ref],dtype=float),rtol=3e-15,atol=3e-15,err_msg=case['name']+field)
                np.testing.assert_allclose([rules['SurfaceTangentU'],rules['SurfaceTangentV']],np.asarray(expected['tangents'],dtype=float),rtol=3e-15,atol=3e-15,err_msg=case['name']+'tangents')
                for field,ref in [('SurfaceNormal','normal'),('CurvatureMatrix','A'),('MeanCurvature','H'),('GaussianCurvature','K')]:
                    np.testing.assert_allclose(rules[field],np.asarray(expected[ref],dtype=float),rtol=3e-15,atol=3e-15,err_msg=case['name']+field)

    def test_identity_cancellation_retains_original_partial_domains(self):
        undefined=('sqrt(1/u-1/u)','sqrt(u**-1-u**-1)','sqrt((1/u)**0-1)',
          'sqrt(0*(1/u))','sqrt(log(u)-log(u))','sqrt(0*log(-1))',
          'sqrt(sqrt(-u)-sqrt(-u))','sqrt(0*sqrt(-1))','sqrt(1/(u-u)-1/(u-u))',
          'sqrt(tan(pi/2)-tan(pi/2))','sqrt(exp(log(u))*exp(-log(u))-1)','sqrt(u**3)','sqrt(u**2)')
        for source in undefined:
            with self.subTest(source=source),self.assertRaises(GenericSurfaceSystemError):
                query_generic_surface_system({**PRESET,'surface':['u','v',source],'uEnd':1.,'vEnd':1.,'uSegments':8,'vSegments':8})
        for source in ('sqrt(1/u-1/u)','sqrt(u**-2-1/(u*u))','sqrt(log(u)-log(u))','sqrt((1/u)**0-1)','sqrt(exp(log(u))*exp(-log(u))-1)'):
            r=query_generic_surface_system({**PRESET,'surface':['u','v',source],'uStart':.1,'uEnd':1.,'vEnd':1.,'uSegments':8,'vSegments':8})
            self.assertTrue(r['domain']['certified'],source)
            self.assertTrue(all(row['rules']['SurfaceNormal']==[0.,0.,1.] for row in r['sample']['rows']))
        # A nonzero IEEE subnormal is not a zero denominator.
        r=query_generic_surface_system({**PRESET,'surface':['u','v','sqrt(1/u-1/u)'],'uStart':1e-320,'uEnd':1.,'vEnd':1.,'uSegments':8,'vSegments':8})
        self.assertEqual(r['sample']['rows'][0]['rules']['SurfaceNormal'],[0.,0.,1.])
        e=SurfaceExpression('sqrt(1/(sin(1e-220)+1-1)-1/(sin(1e-220)+1-1))')
        self.assertEqual(e(SurfaceJet.variable(0.,0),SurfaceJet.variable(0.,1)).c,[0.]*6)
        for source in ('sqrt(tan(pi*u/2)-tan(pi*u/2))','sqrt(1/cos(pi*u/2)-1/cos(pi*u/2))','sqrt(log(sin(pi*u))-log(sin(pi*u)))'):
            with self.subTest(source=source),self.assertRaises((ValueError,ZeroDivisionError)):
                SurfaceExpression(source)(SurfaceJet.variable(1.,0),SurfaceJet.variable(0.,1))

    def test_structural_zero_roots_are_constants_not_sampled_jet_promotions(self):
        for source in ('sqrt(0)','sqrt(sin(0))','sqrt(1-1)','sqrt(0*u)'):
            r=query_generic_surface_system({**PRESET,'surface':['u','v',source],'uEnd':1.,'vEnd':1.,'uSegments':8,'vSegments':8})
            for row in r['sample']['rows']:
                self.assertEqual(row['rules']['SurfaceNormal'],[0.,0.,1.]);self.assertEqual(row['rules']['GaussianCurvature'],0.)
                self.assertEqual(row['sourceSecondDerivatives'],[[0.,0.,0.]]*3)
        for source in ('sqrt(u**3)','sqrt(u**2)','sqrt(-1)'):
            with self.assertRaises(GenericSurfaceSystemError):query_generic_surface_system({**PRESET,'surface':['u','v',source]})

    def test_tiny_constant_scale_inverse_does_not_invent_second_derivatives(self):
        r=query_generic_surface_system({**PRESET,'surface':['1e-110*u','1e-110*v','0'],'uEnd':1.,'vEnd':1.,'uSegments':8,'vSegments':8})
        for row in r['sample']['rows']:
            self.assertEqual(row['sourceSecondDerivatives'],[[0.,0.,0.]]*3)
            self.assertAlmostEqual(row['rules']['FundamentalFormE']/1e-220,1.,14)
            self.assertAlmostEqual(row['rules']['FundamentalFormG']/1e-220,1.,14)
            self.assertEqual(row['rules']['GaussianCurvature'],0.);self.assertEqual(row['rules']['MeanCurvature'],0.)

    def test_positive_tiny_root_keeps_finite_large_and_tiny_nonzero_second_derivatives(self):
        q={**PRESET,'surface':['u','v','sqrt(1e-220+u**2)'],'uEnd':1.,'vEnd':1.,'uSegments':8,'vSegments':8}
        r=query_generic_surface_system(q)
        self.assertAlmostEqual(r['grid']['rows'][0][0]['sourceSecondDerivatives'][0][2]/1e110,1.,14)
        self.assertAlmostEqual(r['grid']['rows'][0][0]['rules']['MeanCurvature']/5e109,1.,14)
        for rows in r['grid']['rows'][1:]:
            row=rows[0];u=row['u'];expected=1e-220/(u*u*u)
            self.assertGreater(row['sourceSecondDerivatives'][0][2],0.)
            self.assertAlmostEqual(row['sourceSecondDerivatives'][0][2]/expected,1.,12)
            self.assertAlmostEqual(row['rules']['MeanCurvature']/(expected/(4*math.sqrt(2))),1.,12)

    def test_near_parallel_parameters_preserve_original_uv_matrix_and_eigen_residual(self):
        for epsilon in ('1e-8','1e-10','1e-12','1e-24'):
            q={**PRESET,'surface':['u+v',epsilon+'*v','(u+v)**2'],'uEnd':1.,'vEnd':1.}
            k=SurfaceSystemKernel(validate_generic_surface_system_query(q))
            for u,v in ((.2,.3),(.45,.8),(.8,.6)):
                row=k.row(u,v);r=row['rules'];curvature=2/(1+4*(u+v)**2)**1.5
                np.testing.assert_allclose(r['CurvatureMatrix'],[[curvature,curvature],[0.,0.]],rtol=2e-13,atol=0)
                self.assertEqual(r['GaussianCurvature'],0.);self.assertAlmostEqual(r['MeanCurvature']/curvature,.5,13)
                for value,uv in zip(r['PrincipalCurvatures'],r['PrincipalDirectionsUV']):
                    residual=np.asarray(r['CurvatureMatrix'])@uv-value*np.asarray(uv)
                    self.assertLess(math.hypot(*residual),2e-13*curvature)
                self.assertLess(row['principalEigenResidual'],2e-13)

    def test_two_variable_mixed_jets_against_independent_eighty_digit_source(self):
        reference=json.loads((ROOT/'tests/fixtures/origamica-surface-system-independent-80digit.json').read_text(encoding='utf8'))
        for case in reference['cases']:
            kernel=SurfaceSystemKernel(validate_generic_surface_system_query({**PRESET,'surface':case['surface']}))
            for expected in case['rows']:
                actual=kernel.row(*expected['uv']);rules=actual['rules']
                mappings={'tangentU':'SurfaceTangentU','tangentV':'SurfaceTangentV','normal':'SurfaceNormal',
                          'GaussianCurvature':'GaussianCurvature','MeanCurvature':'MeanCurvature','CurvatureMatrix':'CurvatureMatrix'}
                for key,target in mappings.items():
                    a=np.asarray(rules[target]);b=np.asarray(expected[key],dtype=float)
                    natural=max(np.linalg.norm(b),np.linalg.norm(np.asarray(expected['PrincipalCurvatures'],dtype=float)) if key in ('GaussianCurvature','MeanCurvature','CurvatureMatrix') else 0.,np.finfo(float).tiny)
                    self.assertLessEqual(np.linalg.norm(a-b),5e-7*natural,(case['name'],key))
                expected_mixed=np.asarray(expected['mixedDerivativeUV'],dtype=float)
                self.assertLessEqual(np.linalg.norm(np.asarray(actual['sourceSecondDerivatives'][1])-expected_mixed),2e-12*max(np.linalg.norm(expected_mixed),np.finfo(float).tiny))
                self.assertLessEqual(actual['principalEigenResidual'],2e-12)
                curv=np.asarray(rules['PrincipalCurvatures']);expected_curv=np.sort(np.asarray(expected['PrincipalCurvatures'],dtype=float))[::-1]
                self.assertLessEqual(np.linalg.norm(curv-expected_curv),5e-7*max(np.linalg.norm(expected_curv),np.finfo(float).tiny))

    def test_full_rules_literal_anchor_principal_false_and_source_units(self):
        response=query_generic_surface_system(PRESET)
        self.assertTrue(response['domain']['certified'])
        self.assertEqual(response['source']['ruleOrder'],BASIC_RULES+PRINCIPAL_RULES)
        for row in response['sample']['rows']:
            r=row['rules'];self.assertAlmostEqual(r['FundamentalFormE'],4);self.assertAlmostEqual(r['FundamentalFormG'],4)
            self.assertAlmostEqual(r['FundamentalFormN'],2);self.assertAlmostEqual(r['GaussianCurvature'],0);self.assertAlmostEqual(r['MeanCurvature'],.25)
        without=query_generic_surface_system({**PRESET,'principalAnalysis':False})
        self.assertEqual(without['source']['ruleOrder'],BASIC_RULES)
        self.assertEqual(list(without['grid']['rows'][0][0]['rules']),BASIC_RULES)
        self.assertIsNone(without['sample']['rows'][0]['principalChoice'])

    def test_skew_metric_eigensystem_and_nonunique_identity_never_sample_proof(self):
        plane=SurfaceSystemKernel(validate_generic_surface_system_query({**PRESET,'surface':['u+2*v','3*v','0']}))
        self.assertTrue(plane.umbilic);self.assertEqual(plane.row(.2,.3)['principalChoice'],'non-unique-identity')
        skew=SurfaceSystemKernel(validate_generic_surface_system_query({**PRESET,'surface':['u+2*v','v','u*v+.3*v**2']}))
        self.assertFalse(skew.umbilic)
        r=skew.row(.2,.3)['rules'];A=np.asarray(r['CurvatureMatrix']);self.assertGreater(abs(A[0,1]-A[1,0]),.1)
        for k,uv,d in zip(r['PrincipalCurvatures'],r['PrincipalDirectionsUV'],r['PrincipalDirections']):
            self.assertLess(np.linalg.norm(A@uv-k*np.asarray(uv)),1e-12)
            mapped=np.asarray(r['SurfaceTangentU'])*uv[0]+np.asarray(r['SurfaceTangentV'])*uv[1]
            np.testing.assert_allclose(mapped/np.linalg.norm(mapped),d,rtol=1e-12,atol=1e-12)
        self.assertFalse(query_generic_surface_system({**PRESET,'surface':['u','v','1e-12*u**2']})['source']['principalUmbilicIdentity'])

    def test_full_two_variable_rectangle_and_off_grid_singularity_unknown(self):
        q=dict(cases())['unresolved-off-grid-rank'];r=query_generic_surface_system(q)
        self.assertFalse(r['domain']['certified']);self.assertTrue(r['domain']['unresolved'])
        self.assertFalse(r['certification']['fullRectangleRegularityCertified'])
        self.assertTrue(r['certification']['finiteGridVerified'])
        rectangles=[c['rectangle'] for c in r['domain']['cells']]+r['domain']['unresolved']
        area=sum((b-a)*(d-c) for a,b,c,d in rectangles)
        self.assertAlmostEqual(area,(q['uEnd']-q['uStart'])*(q['vEnd']-q['vStart']),12)
        for rect in rectangles:
            self.assertEqual(len(rect),4)
        with self.assertRaisesRegex(GenericSurfaceSystemError,'source-singularity'):
            query_generic_surface_system({**PRESET,'surface':['u','v**2','0'],'vStart':0.})

    def test_safe_contract_rejects_wrong_variables_orientation_density_and_code(self):
        for extra in ({'orientation':-1},{'uStart':1},{'principalAnalysis':1},{'uSegments':7},{'surface':['u','s','0']},
                      {'surface':['u','v','__import__("os")']},{'surface':['u','v','sqrt(-1)']},{'surface':['u','v','1/(v-v)']},
                      {'surface':['u','v','tan(pi/2)']}):
            with self.assertRaises((GenericSurfaceSystemError,ValueError)):
                query_generic_surface_system({**PRESET,**extra})
        partial=copy.deepcopy(PRESET);del partial['vEnd']
        with self.assertRaises(GenericSurfaceSystemError):validate_generic_surface_system_query(partial)
        jet=SurfaceExpression('exp(u*v)+sin(u+v)')(SurfaceJet.variable(.2,0),SurfaceJet.variable(.3,1))
        self.assertAlmostEqual(jet.c[4],math.exp(.06)*1.06-math.sin(.5),14)

    def test_tiny_metric_and_large_translation_do_not_flatten_source(self):
        q=dict(cases())['tiny-v-metric'];r=query_generic_surface_system(q)
        for row in r['sample']['rows']:
            self.assertGreater(row['rules']['FundamentalFormG'],0)
            self.assertLess(row['rules']['FundamentalFormG'],1e-18)
        small=dict(cases())['large-offset-tiny-surface'];r=query_generic_surface_system(small)
        self.assertLess(r['normalization']['scale'],1e-8)
        self.assertGreater(np.ptp(np.asarray([[x['normalizedPoint'] for x in row] for row in r['grid']['rows']]),axis=0).max(),.5)
        self.assertTrue(r['domain']['certified'])


