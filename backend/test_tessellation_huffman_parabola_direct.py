import json,math,pathlib,unittest
import numpy as np
from scipy.integrate import solve_ivp
from tessellation_huffman_parabola_direct import query_parabola_direct,ITEMS
from tessellation_huffman_parabola_query import query_huffman_parabola
from tessellation_huffman_parabola import ParabolaAudit,ParabolaParameters

class IndependentOriginalParabola:
    """Independent DOP853, including uncancelled literal gamma2 equation."""
    def __init__(self,degrees):
        a,b,g,h=map(math.radians,degrees);self.a,self.b=a,b
        def rhs(moving):
            def f(t,Y):
                q,G,H=Y;A=-4+np.cos(t)+np.cos(t-q);D=1-4*np.cos(t-q)+np.cos(q);cot=np.cos(H/2)/np.sin(H/2)
                # Keep the original tan*cot and A*(1/A) factors, in contrast
                # to the production kernel's checked algebraic cancellation.
                return [-2*A*np.cos(q/2)*cot*np.tan(G/2)/D if moving else 0,
                    -4*np.sin(t-q)*np.tan(G/2)/D,
                    np.tan(H/2)*(2*A*np.cos(q/2)*cot*np.tan(G/2)/D)*np.sin(t-q)/A]
            return f
        opts=dict(method='DOP853',rtol=2e-13,atol=2e-14,max_step=.012,dense_output=True)
        self.before=solve_ivp(rhs(False),(a,0),[0,g,h],**opts);self.middle=solve_ivp(rhs(True),(a,b),[0,g,h],**opts);self.after=solve_ivp(rhs(False),(b,math.pi/2),self.middle.y[:,-1],**opts)
        if not all(s.success for s in [self.before,self.middle,self.after]):raise ValueError('Independent original angle solve failed.')
        def space(t,Y):
            F,T,L,U=np.asarray(Y).reshape(4,3);k=np.tan(self.angles(t)[1]/2);return np.concatenate((T,L-k*U,-T,k*T))
        self.space=solve_ivp(space,(0,math.pi/2),[1,0,0,0,0,1,-1,0,0,0,-1,0],**opts)
        if not self.space.success:raise ValueError('Independent original Darboux solve failed.')
        self.axis=self.direction((a+b)/2)
    def angles(self,t):return (self.before if t<self.a else self.middle if t<=self.b else self.after).sol(t)
    @staticmethod
    def unit(p):return np.asarray(p)/np.linalg.norm(p)
    def direction(self,t):
        q,G,H=self.angles(t);_,T,L,U=self.space.sol(t).reshape(4,3);LR=np.cos(G)*L-np.sin(G)*U;UR=np.sin(G)*L+np.cos(G)*U
        tf=np.array([-np.sin(t),np.cos(t)]);lf=np.array([-np.cos(t),-np.sin(t)]);tf2=np.array([-np.sin(q/2),np.cos(q/2)]);T2=self.unit(np.dot(tf2,tf)*T+np.dot(tf2,lf)*LR);L2=self.unit(np.cross(UR,T2));L2R=np.cos(H)*L2-np.sin(H)*UR;return self.unit(-np.sin(q/2)*T2-np.cos(q/2)*L2R)
    def frame(self,t):
        q,G,H=self.angles(t);F,T,L,U=self.space.sol(t).reshape(4,3);f0=np.zeros(2);f1=np.array([np.cos(t),np.sin(t)]);f2=4/(1+np.cos(q))*np.array([np.cos(q),np.sin(q)]);f3=np.array([2.,f2[1]]);LR=np.cos(G)*L-np.sin(G)*U;delta=f2-f1;ff2=F+np.dot(delta,[-np.sin(t),np.cos(t)])*T+np.dot(delta,-f1)*LR;ff3=ff2+(f3[0]-f2[0]+1e-6)*self.axis
        return dict(f0=f0,f1=f1,f2=f2,f3=f3,ff0=np.zeros(3),ff1=F,ff2=ff2,ff3=ff3,q=q,gamma1=G,gamma2=H)
    def constants(self):
        first,last=self.frame(0),self.frame(math.pi/2);yL=self.unit(np.cross(last['ff2']-last['ff1'],last['ff0']-last['ff1']));yR=self.axis;z=self.unit(np.cross(yL,yR));return dict(xL=np.cross(yL,z),xR=np.cross(yR,z),yL=yL,yR=yR,z=z,pv=self.unit((first['ff2']+first['ff0'])/2-first['ff1']))

def fixture():return json.loads((pathlib.Path(__file__).parents[1]/'tests/fixtures/huffman-parabola-direct-20261010.json').read_text(encoding='utf-8'))
class ParabolaDirectTests(unittest.TestCase):
    def test_original_saved_results_stay_all_field_equal(self):
        for c in fixture()['savedDefaults']:self.assertEqual(query_huffman_parabola(c['query']),c['response'])
    def test_actual_four_input_calls_and_seventeen_returns(self):
        for c in fixture()['cases']:
            r=query_huffman_parabola(c['query']);self.assertEqual(r,c['response']);self.assertEqual([v['name'] for v in r['originalItems']],list(ITEMS));self.assertEqual(r['source']['arguments'],list(map(math.radians,c['query']['parametersDeg'])));self.assertEqual(r['source']['originalCompletionStatus'],'partially-worked-out');self.assertFalse(r['diagnostics']['closureConditionsSaved'])
    def test_all_seventeen_values_independently_verify_literal_original_ode(self):
        for c in fixture()['cases']:
            independent=IndependentOriginalParabola(c['query']['parametersDeg']);constants=independent.constants()
            for item in c['response']['originalItems']:
                if item['kind']=='constant-vector':np.testing.assert_allclose(item['value'],constants[item['name']],atol=3e-8,rtol=3e-8)
                else:
                    expected=[independent.frame(r['t'])[item['name']] for r in c['response']['sample']['rows']];np.testing.assert_allclose(item['values'],expected,atol=3e-8,rtol=3e-8)
    def test_changed_four_parameters_compute_a_different_real_curve(self):self.assertNotEqual(fixture()['cases'][0]['response']['sample']['rows'],fixture()['cases'][1]['response']['sample']['rows'])
    def test_original_partial_symbol_unit_and_offset_are_not_repaired(self):
        for c in fixture()['cases']:
            r=c['response'];self.assertEqual(r['source']['function'],'HCwCParabola');self.assertFalse(r['source']['originalNumericQDomainComplete']);self.assertFalse(r['source']['wolframExecuted']);self.assertEqual(r['source']['representation'],'sampled-original-17-return-items');self.assertNotIn('closure',r)
            for row in r['sample']['rows']:self.assertAlmostEqual(row['foldedThirdRulingLength']-row['flatThirdRulingLength'],1e-6,places=12)
    def test_unknown_fields_bad_units_domains_types_and_sampling_reject(self):
        q=fixture()['cases'][0]['query'];bad=[{**q,'parametersDeg':p} for p in [[0,85,60,-90],[85,5,60,-90],[5,90,60,-90],[5,85,0,-90],[5,85,180,-90],[5,85,60,0],[5,85,60,-180],[True,85,60,-90],[float('nan'),85,60,-90],[5,85,60,float('inf')],['5',85,60,-90],[5,85,60]]]
        bad.extend([{**q,'unknown':True},{**q,'units':'radians'},{**q,'divisions':True},{**q,'divisions':65},{**q,'mode':'fix-partial'},{**q,'family':'other'}])
        for value in bad:
            with self.subTest(value=value),self.assertRaises(ValueError):query_huffman_parabola(value)
    def test_literal_poles_and_shared_rhs_budget_really_reject(self):
        q=fixture()['cases'][0]['query'];p=ParabolaParameters(*map(math.radians,q['parametersDeg']))
        with self.assertRaisesRegex(ValueError,'budget'):ParabolaAudit(p,max_evaluations=1)
        with self.assertRaises(ValueError):query_parabola_direct({**q,'parametersDeg':[5,85,179.99999999999,-90]})
    def test_no_closed_cp_or_machine_claim_can_be_created(self):
        for c in fixture()['cases']:
            r=c['response'];self.assertFalse(r['diagnostics']['closureConditionsSaved']);self.assertFalse(r['certification']['completeBlockExactIsometry']);self.assertFalse(r['certification']['adoptableCreasePattern']);self.assertFalse(r['certification']['exactStraightCreaseFOLD'])
if __name__=='__main__':unittest.main()
