import copy,json,math,sys,unittest
from pathlib import Path
import numpy as np
from scipy.linalg import expm
sys.path.insert(0,str(Path(__file__).resolve().parent))
from tessellation_curved_linked_first_band_query import query_linked_first_band,validate_linked_first_band_query
from tessellation_curved_linked_common_parameter_query import PRESET as COMMON
from tessellation_curved_near_width_query import PRESET as NEAR,validate_near_width_query

FIXTURE=Path(__file__).resolve().parents[1]/'tests/fixtures/linked-first3d-ndsolve-20261010.json'
def clean(x):return json.loads(json.dumps(x))
class LinkedFirst3DSteps(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.cases=json.loads(FIXTURE.read_text(encoding='utf-8'))
 def test_all_current_no_options_complete_responses_and_only_maxsteps_trajectories_are_exact(self):
  for c in self.cases:
   if not c['name'].startswith('unchanged-'):continue
   self.assertEqual(clean(query_linked_first_band(c['query'])),c['response'],c['name'])
   r=clean(query_linked_first_band({**copy.deepcopy(c['query']),'ndsolveOptions':{'MaxSteps':256}}))
   r.pop('first3DIntegration');r['query'].pop('ndsolveOptions');self.assertEqual(r,c['response'],c['name'])
 def test_smaller_original_s_steps_control_actual_first_darboux_ode_and_full_domain(self):
  for name in ['saved-first-8','saved-chain-ip32','common-subdomain','generic-default','independent-raw-prefix-2']:
   old=next(c['response'] for c in self.cases if c['name']==name+'-maxsteps')
   c=next(c for c in self.cases if c['name']==name+'-smallstep');r=clean(query_linked_first_band(c['query']));self.assertEqual(r,c['response'])
   i=r['first3DIntegration'];step=i['stepOptions'];self.assertEqual(i['callerDefinitionCell'],'In[4081]');self.assertEqual(step['definitionCell'],'In[3815]')
   self.assertEqual(i['controlledStages'],['NRecoverDarboux3D']);self.assertFalse(i['interpolationAndRootStagesControlled'])
   nodes=step['forwardParameters'];self.assertEqual(nodes[0],i['initialParameter']);self.assertEqual(nodes[-1],c['query'].get('parameterEnd',math.pi))
   self.assertTrue(all(0<b-a<=.01*(1+1e-12) for a,b in zip(nodes,nodes[1:])));self.assertGreater(step['forwardSteps'],old['first3DIntegration']['stepOptions']['forwardSteps'])
 def test_exhaustion_rejects_the_actual_first3d_stage_without_partial_or_shrunk_output(self):
  for name in ['saved-first-8','saved-chain-ip32','common-subdomain','generic-default','independent-raw-prefix-2']:
   c=next(c for c in self.cases if c['name']==name+'-smallstep');q=copy.deepcopy(c['query']);q['ndsolveOptions']={'MaxSteps':1}
   with self.assertRaisesRegex(ValueError,'首First3D.*完整s域未完成'):query_linked_first_band(q)
   self.assertEqual(clean(query_linked_first_band(c['query'])),c['response'])
 def test_matrix_exponential_replays_original_constant_equations_and_nonunit_imported_frame(self):
  raw=next(copy.deepcopy(c['query']) for c in self.cases if c['name']=='unchanged-independent-raw-prefix-1')
  inputs=[({**copy.deepcopy(COMMON),'radii':[1.,1.1,1.2],'q1Harmonics':[0.],'firstFoldAngleDeg':90.,'parameterEnd':.35,'segments':8},1.,1.,1.,[1.,0.,0.,0.,1.,0.,-1.,0.,0.,0.,0.,1.]),
   (raw,1.,.6,.6*math.tan(.9),[0.,0.,0.,2.,0.,0.,0.,3.,0.,0.,0.,1.])]
  for q,v,g,n,initial in inputs:
   q['ndsolveOptions']={'MaxSteps':256,'MaxStepSize':.01};r=query_linked_first_band(q);matrix=np.zeros((12,12));identity=np.eye(3)
   matrix[:3,3:6]=v*identity;matrix[3:6,6:9]=g*identity;matrix[3:6,9:12]=n*identity;matrix[6:9,3:6]=-g*identity;matrix[9:12,3:6]=-n*identity
   for row in r['sample']['rows']:
    expected=expm(matrix*row['s'])@np.asarray(initial)
    np.testing.assert_allclose(row['foldedCurves'][0],expected[:3],rtol=2e-12,atol=2e-12)
    np.testing.assert_allclose(row['foldedDerivatives'][0],v*expected[3:6],rtol=2e-12,atol=2e-12)
   if q.get('curve2DSystemsMode')=='independent-external':
    self.assertEqual(r['first3DIntegration']['initialState'][3:9],[2.,0.,0.,0.,3.,0.]);self.assertFalse(r['certification']['finiteNumericalMetricVerified'])
 def test_saved_next2d_sequences_and_other_original_option_paths_are_unchanged(self):
  for ip in [16,32,64]:
   old=next(c['response'] for c in self.cases if c['name']==f'unchanged-saved-chain-ip{ip}')
   q={**copy.deepcopy(old['query']),'ndsolveOptions':{'MaxSteps':4096,'MaxStepSize':.01}};r=query_linked_first_band(q)
   for a,b in zip(r['sample']['rows'],old['sample']['rows']):
    for key in ['qValues','foldAnglesDeg','flatCurves']:self.assertEqual(a[key],b[key])
   for key in ['source','diagnostics','certification']:self.assertEqual(r[key],old[key])
  with self.assertRaises(ValueError):validate_linked_first_band_query({'family':'linked-concentric-first-band','variant':'zero-chain','segments':8,'ndsolveOptions':{'MaxSteps':256}})
  with self.assertRaises(ValueError):validate_near_width_query({**NEAR,'ndsolveOptions':{'MaxSteps':256}})
 def test_invalid_defaults_goals_and_step_values_are_not_disguised_controller_support(self):
  inputs=[c['query'] for c in self.cases if c['name'] in ['unchanged-saved-first-8','unchanged-saved-chain-ip32','unchanged-common-subdomain','unchanged-generic-default']]
  for q in inputs:
   for options in [{},{'MaxSteps':True},{'MaxSteps':0},{'MaxSteps':1.2},{'MaxSteps':4097},{'MaxSteps':'Infinity'},{'MaxStepSize':'Automatic'},{'MaxStepSize':0},{'MaxStepSize':10},{'AccuracyGoal':10},{'MaxSteps':256,'WorkingPrecision':30}]:
    with self.assertRaises(ValueError):validate_linked_first_band_query({**copy.deepcopy(q),'ndsolveOptions':options})
 def test_explicit_steps_do_not_escape_the_shared_total_rhs_budget(self):
  with self.assertRaisesRegex(ValueError,'24000.*RHS预算|成功步数已耗尽'):
   query_linked_first_band({'family':'linked-concentric-first-band','segments':8,'ndsolveOptions':{'MaxSteps':4096,'MaxStepSize':1e-6}})
if __name__=='__main__':unittest.main()
