import copy,json,math,sys,unittest
from pathlib import Path
import numpy as np
from scipy.linalg import expm
sys.path.insert(0,str(Path(__file__).resolve().parent))
from tessellation_curved_system_helpers_generic import PRESETS,query_system_helpers_generic,validate_system_helpers_query

FIXTURE=Path(__file__).resolve().parents[1]/'tests/fixtures/recover-ndsolve-options-20261010.json'
MODES=('recover2','recover3','recover-darboux')
class RecoverStepOptions(unittest.TestCase):
 def test_all_no_option_fields_remain_exactly_frozen(self):
  for case in json.loads(FIXTURE.read_text(encoding='utf-8')):
   if case['name'].startswith('unchanged-'):
    self.assertEqual(query_system_helpers_generic(case['query']),case['response'],case['name'])
 def test_explicit_steps_bind_original_numeric_definitions_and_full_parameter_domain(self):
  for mode,cell in zip(MODES,('In[3640]','In[3685]','In[3815]')):
   for initial in (0.,.4,1.):
    q={**copy.deepcopy(PRESETS[mode]),'initialParameter':initial,'ndsolveOptions':{'MaxSteps':128,'MaxStepSize':.02}}
    r=query_system_helpers_generic(q);stamp=r['diagnostics']['integration']['stepOptions']
    self.assertEqual(stamp['definitionCell'],cell);self.assertEqual(r['query']['ndsolveOptions'],q['ndsolveOptions'])
    for direction,bound in (('forward',1.),('backward',0.)):
     nodes=stamp[direction+'Parameters'];self.assertEqual(nodes[0],initial);self.assertEqual(nodes[-1],bound)
     self.assertEqual(len(nodes)-1,stamp[direction+'Steps']);self.assertTrue(all(abs(b-a)<=.02*(1+1e-12) for a,b in zip(nodes,nodes[1:])))
    self.assertFalse(r['source']['wolframOptionsReproduced']);self.assertFalse(r['certification']['adoptableCreasePattern'])
 def test_shared_maxsteps_rejects_unfinished_backward_domain_without_partial_result(self):
  for mode in MODES:
   q={**copy.deepcopy(PRESETS[mode]),'initialParameter':.4,'ndsolveOptions':{'MaxSteps':128,'MaxStepSize':.02}}
   r=query_system_helpers_generic(q);stamp=r['diagnostics']['integration']['stepOptions'];total=stamp['forwardSteps']+stamp['backwardSteps']
   q['ndsolveOptions']['MaxSteps']=total;self.assertEqual(query_system_helpers_generic(q)['sample'],r['sample'])
   q['ndsolveOptions']['MaxSteps']=total-1
   with self.assertRaisesRegex(ValueError,'完整s域未完成'):query_system_helpers_generic(q)
   q['ndsolveOptions']={'MaxSteps':1}
   with self.assertRaisesRegex(ValueError,'完整s域未完成'):query_system_helpers_generic(q)
 def test_constant_original_equations_match_independent_matrix_exponential_with_raw_frames(self):
  for mode in MODES:
   n=2 if mode=='recover2' else 3;coeff=[2.,.5] if n==2 else [2.,.5,.2] if mode=='recover3' else [2.,.8,.3,.2]
   q={**copy.deepcopy(PRESETS[mode]),'coefficients':list(map(str,coeff)),'initialParameter':.4,'initialPoint':[3.,4.] if n==2 else [3.,4.,5.],
      'initialTangent':[2.,0.] if n==2 else [2.,0.,0.],'ndsolveOptions':{'MaxSteps':256,'MaxStepSize':.01}}
   if mode=='recover3':q['initialBinormal']=[0.,0.,3.]
   if mode=='recover-darboux':q.update(initialLeft=[.2,3.,0.],initialNormal=[0.,.4,4.])
   r=query_system_helpers_generic(q);v=coeff[0];g=coeff[1] if mode=='recover-darboux' else v*coeff[1];h=coeff[2] if mode=='recover-darboux' else 0.;z=coeff[3] if mode=='recover-darboux' else v*coeff[2] if n==3 else 0.
   blocks=3 if n==2 else 4;matrix=np.zeros((blocks*n,blocks*n));identity=np.eye(n)
   matrix[:n,n:2*n]=v*identity;matrix[n:2*n,2*n:3*n]=g*identity;matrix[2*n:3*n,n:2*n]=-g*identity
   if n==3:
    matrix[n:2*n,3*n:4*n]=h*identity;matrix[2*n:3*n,3*n:4*n]=z*identity;matrix[3*n:4*n,n:2*n]=-h*identity;matrix[3*n:4*n,2*n:3*n]=-z*identity
   initial=np.concatenate((q['initialPoint'],*r['initial']['frame']))
   for row in r['sample']['rows']:
    expected=expm(matrix*(row['s']-.4))@initial
    np.testing.assert_allclose(row['curve'],expected[:n],rtol=2e-12,atol=2e-12)
    np.testing.assert_allclose(np.asarray(row['frame']).flatten(),expected[n:],rtol=2e-12,atol=2e-12)
   self.assertFalse(r['initial']['frameCompatible']);self.assertFalse(r['certification']['formalFrameOrthonormalCertified'])
 def test_only_original_recovery_step_options_enter_the_existing_safe_contract(self):
  invalid=({}, {'MaxSteps':0},{'MaxSteps':True},{'MaxSteps':1.2},{'MaxSteps':4097},{'MaxStepSize':0},{'MaxStepSize':2},
   {'MaxStepSize':math.inf},{'MaxStepSize':'Automatic'},{'MaxSteps':'Infinity'},{'WorkingPrecision':30},{'AccuracyGoal':10},{'MaxSteps':128,'unused':1})
  for mode in MODES:
   for options in invalid:
    with self.assertRaises(ValueError):validate_system_helpers_query({**PRESETS[mode],'ndsolveOptions':options})
  for mode in ('curve2','curve3','darboux3','ruled-normal'):
   with self.assertRaises(ValueError):validate_system_helpers_query({**PRESETS[mode],'ndsolveOptions':{'MaxSteps':128}})
  with self.assertRaises(ValueError):query_system_helpers_generic({**PRESETS['recover2'],'coefficients':['__import__(s)','0'],'ndsolveOptions':{'MaxSteps':128}})
 def test_tiny_steps_do_not_escape_shared_rhs_budget(self):
  with self.assertRaisesRegex(ValueError,'成功步数已耗尽|有限积分预算'):
   query_system_helpers_generic({**PRESETS['recover3'],'ndsolveOptions':{'MaxSteps':4096,'MaxStepSize':1e-6}})
if __name__=='__main__':unittest.main()
