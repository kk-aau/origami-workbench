"""Independent literal reflection, source contracts and engineering evidence."""
import copy,math,sys,unittest
from pathlib import Path
import mpmath as mp
import numpy as np
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'backend'))
from tessellation_curved_planar_sequence_generic import PRESET,PlanarSequenceError,PlanarSequenceKernel,query_planar_sequence_generic
from tessellation_curved_planar_reflection_sequence import saved_sequence_input,stage_surface,stage_director

def q(**changes):return {**copy.deepcopy(PRESET),'segments':8,'rulingSegments':3,**changes}
def ref(s,mirrors,compose):
    with mp.workdps(70):
        s=mp.mpf(s);b=[s,mp.mpf('.2')*s*s,mp.mpf(0)];d=[mp.mpf(0),mp.mpf(0),mp.mpf(1)]
        pending=[{k:list(map(mp.mpf,v)) for k,v in m.items()} for m in mirrors]
        def dot(a,b):return sum(x*y for x,y in zip(a,b))
        def rv(x,n):return [a-2*dot(x,n)*c for a,c in zip(x,n)]
        def rp(x,p,n):return [a-2*dot([u-v for u,v in zip(x,p)],n)*c for a,c in zip(x,n)]
        out=[(mp.mpf(0),b,b,d)]
        while pending:
            m=pending.pop(0);p,n=m['point'],m['normal'];v=dot([u-z for u,z in zip(p,b)],n)/dot(d,n)
            fold=[x+v*y for x,y in zip(b,d)];b,d=rp(b,p,n),rv(d,n);out.append((v,b,fold,d))
            if compose:pending=[{'point':rp(x['point'],p,n),'normal':rv(x['normal'],n)} for x in pending]
        return out

class NativePlanarSequenceTests(unittest.TestCase):
    def test_true_six_sources_and_both_original_compose_orders_against_70digit_literal(self):
        for compose in (True,False):
            query=q(composeReflections=compose);r=query_planar_sequence_generic(query)
            self.assertTrue(r['certification']['finiteMetricVerified']);self.assertTrue(r['domain']['certified'])
            for row in r['sample']['rows']:
                for actual,expected in zip(row['stages'],ref(row['s'],query['mirrors'],compose)):
                    self.assertAlmostEqual(actual['parameter'],float(expected[0]),12)
                    for key,point in zip(('base','fold','director'),expected[1:]):np.testing.assert_allclose(actual[key],list(map(float,point)),atol=2e-13)
            self.assertEqual(r['source']['initialEntry'],['0','B','B','D'])
        self.assertNotEqual(query_planar_sequence_generic(q())['sample']['rows'][0]['stages'][-1]['base'],
                            query_planar_sequence_generic(q(composeReflections=False))['sample']['rows'][0]['stages'][-1]['base'])

    def test_raw_nonunit_normals_are_not_repaired_and_no_fake_isometry(self):
        r=query_planar_sequence_generic(q(mirrors=[{'point':[0,0,1],'normal':[0,0,2]}]))
        self.assertEqual(r['effectiveMirrors'][0]['normal'],[0,0,2]);self.assertFalse(r['certification']['mirrorNormalsCompatible'])
        self.assertFalse(r['certification']['finiteMetricVerified']);self.assertFalse(r['certification']['conditionalReflectionIsometryCertified'])
        np.testing.assert_allclose(r['sample']['rows'][0]['stages'][1]['director'],[0,0,-7],atol=2e-15)
        for name in ('adoptableCreasePattern','exactStraightCreaseFOLD','selfCollisionChecked','cutOrderVerified'):self.assertFalse(r['certification'][name])

    def test_empty_list_and_nonunit_directors_preserve_original_initial_and_metrics(self):
        r=query_planar_sequence_generic(q(mirrors=[],director=['0','0','2+s']))
        self.assertEqual(len(r['sample']['rows'][0]['stages']),1);self.assertEqual(r['effectiveMirrors'],[])
        self.assertTrue(r['certification']['finiteMetricVerified'])
        stage=r['sample']['rows'][0]['stages'][0];self.assertEqual(stage['parameter'],0);self.assertEqual(stage['base'],stage['fold'])
        self.assertEqual(stage['directorDerivative'],[0,0,1])
        # E=|B'+wD'|² is checked using D', not D itself.
        w=3;s=r['grid'][0]['s'];self.assertAlmostEqual(r['grid'][0]['stages'][0]['EFG'][-1][0],1+(.4*s)**2+w*w,12)

    def test_cone_apex_source_and_all_old_saved_reflection_order_are_retained(self):
        for case in ('cone-symbolic','cylinder-symbolic','cone-numeric-input'):
            saved=saved_sequence_input(case);cone=case!='cylinder-symbolic'
            query=q(baseCurve=['0','0','0'] if cone else ['cos(s)','sin(s)','0'],
                    director=['.5*cos(s)','.5*sin(s)',str(math.sqrt(3)/2)] if cone else ['0','0','1'],
                    mirrors=saved['planes'],composeReflections=saved['composeReflections'],parameterStart=saved['uRange'][0],parameterEnd=saved['uRange'][1])
            r=query_planar_sequence_generic(query)
            for row in r['sample']['rows']:
                for i,stage in enumerate(row['stages']):
                    np.testing.assert_allclose(stage['base'],stage_surface(case,row['s'],0,i),atol=3e-12)
                    np.testing.assert_allclose(stage['director'],stage_director(case,row['s'],i),atol=3e-12)

    def test_singular_parallel_and_whole_domain_unknown_remain_distinct(self):
        with self.assertRaisesRegex(PlanarSequenceError,'source-singularity'):query_planar_sequence_generic(q(director=['1','0','0']))
        with self.assertRaisesRegex(PlanarSequenceError,'source-singularity'):query_planar_sequence_generic(q(mirrors=[{'point':[0,0,1],'normal':[0,0,0]}]))
        unknown=q(director=['0','0','(2+sin(5000*s)**2)/(1+sin(5000*s)**2)'],mirrors=[{'point':[0,0,1],'normal':[0,0,1]}])
        r=query_planar_sequence_generic(unknown);self.assertFalse(r['domain']['certified']);self.assertEqual(r['domain']['evaluations'],1024)
        self.assertEqual(r['sample']['rows'][-1]['s'],unknown['parameterEnd']);self.assertEqual(r['query'],unknown)

    def test_tiny_translated_source_and_incompatible_mirror_order_preserve_inputs(self):
        r=query_planar_sequence_generic(q(baseCurve=['1e9+1e-8*s','1e9+2e-9*s**2','1e9'],director=['0','0','1e-8'],
                                           mirrors=[{'point':[1e9,1e9,1e9],'normal':[0,0,1]}]))
        self.assertLess(r['normalization']['scale'],1e-6);self.assertTrue(r['certification']['finiteMetricVerified'])
        # Original list does not impose increasing cut positions.
        r=query_planar_sequence_generic(q(mirrors=[{'point':[0,0,2],'normal':[0,0,1]},{'point':[0,0,1],'normal':[0,0,1]}]))
        self.assertEqual(r['query']['mirrors'][0]['point'],[0,0,2]);self.assertFalse(r['certification']['cutOrderVerified'])
        for change in ({'baseCurve':['eval(s)','0','0']},{'composeReflections':1},{'mirrors':[{'point':[0,0,0],'normal':[1,2]}]},{'parameterEnd':-.5}):
            with self.assertRaises(PlanarSequenceError):query_planar_sequence_generic(q(**change))

if __name__=='__main__':unittest.main(verbosity=2)
