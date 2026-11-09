"""Independent literal SurfaceOrientation coverage, distinct from SurfaceSystem."""
import copy,json,math,sys,unittest
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend'))
from tessellation_curved_surface_system_generic import (
    NORMAL_PRESET,PRESET,NORMAL_FAMILY,GenericSurfaceSystemError,
    query_generic_surface_normal,query_generic_surface_system,validate_generic_surface_normal_query)


class SurfaceNormalNativeTests(unittest.TestCase):
    def test_zero_identity_normals_retain_every_original_child_domain(self):
        refs=json.loads((ROOT/'tests/fixtures/origamica-surface-zero-identities-independent-80digit.json').read_text(encoding='utf8'))['cases']
        for case in refs:
            q={**NORMAL_PRESET,'surface':case['surface'],'uStart':case['uStart'],'uEnd':1.,'vEnd':1.,'uSegments':8,'vSegments':8}
            for orientation in (1,-1):
                for expected in case['rows']:
                    u,v=expected['uv'];row=query_generic_surface_normal({**q,'uStart':u,'uEnd':u+.05,'vStart':v,'vEnd':v+.05,'surfaceOrientation':orientation})['sample']['rows'][0]
                    np.testing.assert_allclose(row['normal'],orientation*np.asarray(expected['normal'],dtype=float),rtol=3e-15,atol=3e-15,err_msg=case['name'])
        for source in ('sqrt(1/u-1/u)','sqrt((1/u)**0-1)','sqrt(log(u)-log(u))','sqrt(0*sqrt(-1))'):
            with self.subTest(source=source),self.assertRaises(GenericSurfaceSystemError):query_generic_surface_normal({**NORMAL_PRESET,'surface':['u','v',source]})

    def test_constant_zero_and_smooth_tiny_root_are_distinct_from_actual_undefined_normal(self):
        for source in ('sqrt(0)','sqrt(sin(0))','sqrt(1-1)','sqrt(0*u)'):
            r=query_generic_surface_normal({**NORMAL_PRESET,'surface':['u','v',source],'uEnd':1.,'vEnd':1.,'uSegments':8,'vSegments':8})
            self.assertTrue(all(row['normal']==[0.,0.,1.] for row in r['sample']['rows']))
        r=query_generic_surface_normal({**NORMAL_PRESET,'surface':['u','v','sqrt(1e-220+u**2)'],'uEnd':1.,'vEnd':1.,'uSegments':8,'vSegments':8})
        self.assertEqual(r['grid']['rows'][0][0]['normal'],[0.,0.,1.])
        np.testing.assert_allclose(r['grid']['rows'][1][0]['normal'],[-1/math.sqrt(2),0,1/math.sqrt(2)],rtol=2e-15,atol=0)
        for source in ('sqrt(u**3)','sqrt(u**2)'):
            with self.assertRaises(GenericSurfaceSystemError):query_generic_surface_normal({**NORMAL_PRESET,'surface':['u','v',source]})

    def test_original_cylinder_normal_and_explicit_back_reverse_only(self):
        front=query_generic_surface_normal(NORMAL_PRESET)
        back=query_generic_surface_normal({**NORMAL_PRESET,'surfaceOrientation':-1})
        for a,b in zip(front['sample']['rows'],back['sample']['rows']):
            self.assertEqual(a['sourcePoint'],b['sourcePoint']);self.assertEqual(a['sourceTangents'],b['sourceTangents'])
            expected=[0.,-math.sin(a['v']),math.cos(a['v'])]
            np.testing.assert_allclose(a['normal'],expected,rtol=2e-15,atol=2e-15)
            np.testing.assert_allclose(b['normal'],[-x for x in expected],rtol=2e-15,atol=2e-15)
        self.assertTrue(front['domain']['certified']);self.assertTrue(back['domain']['certified'])
        self.assertEqual(front['source']['function'],'SurfaceNormalFromSurface')
        self.assertEqual(front['source']['numericalWrapperFunction'],'NSurfaceNormalFromSurface')
        self.assertFalse(front['source']['numericalWrapperInterpolationReproduced'])

    def test_two_variable_normals_match_independent_eighty_digit_literal_source(self):
        references=json.loads((ROOT/'tests/fixtures/origamica-surface-system-independent-80digit.json').read_text(encoding='utf8'))['cases']
        for case in references:
            q={**NORMAL_PRESET,'surface':case['surface'],'uSegments':8,'vSegments':8}
            # Use a zero-width-free small rectangle anchored at each independent reference point.
            for expected in case['rows']:
                u,v=expected['uv'];r=query_generic_surface_normal({**q,'uStart':u,'uEnd':u+.05,'vStart':v,'vEnd':v+.05})['sample']['rows'][0]
                np.testing.assert_allclose(r['normal'],np.asarray(expected['normal'],dtype=float),rtol=5e-8,atol=5e-8)
                np.testing.assert_allclose(r['sourceTangents'],np.asarray([expected['tangentU'],expected['tangentV']],dtype=float),rtol=5e-8,atol=0)

    def test_normal_contract_never_changes_system_mean_or_principal_curvatures(self):
        for extra in ({'principalAnalysis':True},{'surfaceOrientation':0},{'surfaceOrientation':True},{'orientation':-1}):
            with self.assertRaises(GenericSurfaceSystemError):validate_generic_surface_normal_query({**NORMAL_PRESET,**extra})
        with self.assertRaises(GenericSurfaceSystemError):query_generic_surface_system({**PRESET,'surfaceOrientation':-1})
        self.assertNotIn('principalAnalysis',query_generic_surface_normal(NORMAL_PRESET)['query'])
        bad=copy.deepcopy(NORMAL_PRESET);del bad['surfaceOrientation']
        with self.assertRaises(GenericSurfaceSystemError):validate_generic_surface_normal_query(bad)

    def test_rectangle_unknown_and_actual_rank_zero_keep_distinct(self):
        r=query_generic_surface_normal({**NORMAL_PRESET,'surface':['u','(u-.123)*(u-.123)*v','0']})
        self.assertFalse(r['domain']['certified']);self.assertTrue(r['domain']['unresolved'])
        self.assertFalse(r['certification']['fullRectangleRegularityCertified']);self.assertTrue(r['certification']['finiteGridVerified'])
        for extra in ({'surface':['u','0','0']},{'surface':['u','v','tan(pi/2)']},{'surface':['u','v','sqrt(-1)']}):
            with self.assertRaises(GenericSurfaceSystemError):query_generic_surface_normal({**NORMAL_PRESET,**extra})


if __name__=='__main__':unittest.main()
