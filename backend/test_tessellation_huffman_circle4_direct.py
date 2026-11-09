import json,math,pathlib,unittest
import numpy as np
from scipy.integrate import solve_ivp
from tessellation_huffman_circle4_query import query_huffman_circle4
from tessellation_huffman_circle4_direct import query_circle4_direct,validate_circle4_direct,ITEMS
from tessellation_huffman_column import Circle4Audit,Circle4Parameters

class IndependentOriginalCircle4:
    """DOP853 literal equations/frames, separate from the existing RK45 class."""
    def __init__(self,degrees):
        a,b,g,h=map(math.radians,degrees)
        def rhs(moving):
            def f(t,Y):
                q,G,H=Y;A=2*np.sin(t)-4*np.sin(t-q);B=1+2*np.cos(t)-4*np.cos(t-q)
                return [((-4+np.cos(t-q)+2*np.cos(q))*np.cos(H/2)/np.sin(H/2)*np.tan(G/2)/(-B)) if moving else 0,
                        A*np.tan(G/2)/B,(-np.sin(t-2*q)-4*np.sin(q)+2*np.sin(2*q))*np.tan(G/2)/(np.cos(q)*(-B))]
            return f
        opts=dict(method='DOP853',rtol=2e-13,atol=2e-14,dense_output=True,max_step=.015)
        self.before=solve_ivp(rhs(False),(a,0),[0,g,h],**opts);self.middle=solve_ivp(rhs(True),(a,b),[0,g,h],**opts);self.after=solve_ivp(rhs(False),(b,math.pi/2),self.middle.y[:,-1],**opts);self.a,self.b=a,b
        if not all(s.success for s in [self.before,self.middle,self.after]):raise ValueError('Independent original-angle verification failed.')
        def frame_rhs(t,Y):
            F,T,L,U=np.asarray(Y).reshape(4,3);k=np.tan(self.angles(t)[1]/2)
            return np.concatenate((T,L-k*U,-T,k*T))
        self.frame=solve_ivp(frame_rhs,(0,math.pi/2),[1,0,0,0,0,1,-1,0,0,0,-1,0],**opts)
        if not self.frame.success:raise ValueError('Independent original-Darboux verification failed.')
    def angles(self,t):return (self.before if t<self.a else self.middle if t<=self.b else self.after).sol(t)

def fixture():return json.loads((pathlib.Path(__file__).parents[1]/'tests/fixtures/huffman-circle4-direct-20261010.json').read_text(encoding='utf-8'))

class DirectCircle4Tests(unittest.TestCase):
    def test_saved_default_outputs_unchanged(self):
        for saved in fixture()['savedDefaults']:
            self.assertEqual(query_huffman_circle4(saved['query']),saved['response'])
    def test_all_seventeen_original_items_and_real_parameters(self):
        for case in fixture()['cases']:
            with self.subTest(case=case['name']):
                result=query_huffman_circle4(case['query']);self.assertEqual(result,case['response']);self.assertEqual([v['name'] for v in result['originalItems']],list(ITEMS))
                self.assertEqual(result['source']['arguments'],list(map(math.radians,case['query']['parametersDeg'])))
                self.assertFalse(result['closure']['rootSearchExecuted']);self.assertFalse(result['closure']['closedColumnCertified']);self.assertFalse(result['certification']['adoptableCreasePattern'])
    def test_independent_original_ode_and_darboux_at_every_returned_position(self):
        for case in fixture()['cases']:
            independent=IndependentOriginalCircle4(case['query']['parametersDeg']);model=Circle4Audit(Circle4Parameters(*map(math.radians,case['query']['parametersDeg'])))
            for t in list(np.linspace(0,math.pi/2,17))+[.371,.853,1.219]:
                actual=model.frame(float(t));np.testing.assert_allclose([actual[k] for k in ('q','gamma1','gamma2')],independent.angles(t),atol=2e-8,rtol=2e-8);np.testing.assert_allclose(actual['ff1'],independent.frame.sol(t).reshape(4,3)[0],atol=2e-8,rtol=2e-8)
    def test_parameter_changes_compute_new_curves_not_relabel_a_saved_root(self):
        outputs=[c['response'] for c in fixture()['cases']]
        self.assertNotEqual(outputs[0]['sample']['rows'],outputs[1]['sample']['rows']);self.assertGreater(outputs[0]['closure']['maximumAbsoluteResidual'],1e-2)
    def test_literal_offset_and_original_mirror_frame_identities(self):
        for case in fixture()['cases']:
            r=case['response'];v={i['name']:i.get('value') for i in r['originalItems'] if i['kind']=='constant-vector'}
            np.testing.assert_allclose(v['xL'],np.cross(v['yL'],v['z']),atol=1e-13);np.testing.assert_allclose(v['xR'],np.cross(v['yR'],v['z']),atol=1e-13)
            for row in r['sample']['rows']:self.assertAlmostEqual(row['foldedThirdRulingLength']-row['flatThirdRulingLength'],1e-6,places=12)
    def test_invalid_domains_types_and_unknown_fields_reject(self):
        q=fixture()['cases'][0]['query']
        bad=[{**q,'parametersDeg':p} for p in [[0,87,60,-52],[87,33,60,-52],[33,90,60,-52],[33,87,0,-52],[33,87,180,-52],[33,87,60,0],[33,87,60,-180],[True,87,60,-52],[float('nan'),87,60,-52],[33,87,60,float('inf')],['33',87,60,-52],[33,87,60]]]
        bad.extend([{**q,'unknown':True},{**q,'divisions':True},{**q,'divisions':65},{**q,'mode':'skip-closure'},{**q,'family':'other'}])
        for value in bad:
            with self.subTest(value=value),self.assertRaises(ValueError):query_huffman_circle4(value)
    def test_budget_and_original_poles_really_reject(self):
        p=Circle4Parameters(*map(math.radians,[33,87,60,-52]))
        with self.assertRaisesRegex(ValueError,'budget'):Circle4Audit(p,max_evaluations=1)
        with self.assertRaises(ValueError):query_circle4_direct({**fixture()['cases'][0]['query'],'parametersDeg':[33,87,179.99999999999,-52]})
    def test_bounded_mode_never_misrepresents_full_numericq_runtime(self):
        for case in fixture()['cases']:
            self.assertFalse(case['response']['source']['originalNumericQDomainComplete']);self.assertEqual(case['response']['source']['representation'],'sampled-original-17-return-items')

if __name__=='__main__':unittest.main()
