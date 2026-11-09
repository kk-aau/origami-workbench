import copy,json,math,unittest
import numpy as np
from pathlib import Path
from unittest.mock import patch
import tessellation_woven_merit as merit
from tessellate import generate
from test_tessellation_woven_even_degree import literal_ff,fan
from test_tessellation_woven_boundaries import restored_cp

OLD=json.loads((Path(__file__).parents[1]/'tests/fixtures/woven-even-degree-20261001.json').read_text(encoding='utf8'))['cases']
def query(name):return dict(next(c['params'] for c in OLD if c['name']==name),optimization='origamica-merit')

class WovenMeritRecoveryTests(unittest.TestCase):
 def test_three_known_feasible_inputs_now_truly_optimize_same_original_square_sum(self):
  for name in ('six-reverse','six-none','six-empty-period'):
   with self.subTest(name=name):
    p=query(name);r=generate(p);report=r['source']['meritReport'];recovery=report.get('numericalRecovery')
    self.assertEqual(report['objective'],'sum-pleat-factors-squared');self.assertTrue(report['noArtificialUpperBound'])
    self.assertEqual(report['certificate'],'local-numerical-candidate');self.assertFalse(report['wolframExecuted'])
    if recovery:
     self.assertIn('Positive directional derivative',recovery['initialOptimizerMessage'])
     self.assertLessEqual(recovery['initialMaximumResidual'],1e-7);self.assertLessEqual(recovery['restorationMaximumResidual'],1e-12)
     self.assertTrue(recovery['restartedOptimizerSuccess']);self.assertEqual(recovery['originalConstraintCount'],6)
    self.assertLess(report['maximumResidual'],1e-12);self.assertLess(report['kktResidual'],1e-5)
    self.assertAlmostEqual(report['merit'],sum(x*x for x in r['source']['pleatFactors']),places=9)
    self.assertTrue(all(x>=b for x,b in zip(r['source']['pleatFactors'],report['lowerBounds'])))
    self.assertEqual(r['mother']['vertices_coords'],p['graph']['vertices']);self.assertEqual(r['mother']['edges_vertices'],p['graph']['edges'])
    for c in ('geometry','local','lff'):self.assertEqual(r['stats']['checks'][c]['status'],'passed')
    self.assertEqual(r['stats']['checks']['layerOrder']['status'],'not_checked')
    expected=literal_ff(p,r['source']);self.assertLess(max(math.dist(a,b) for a,b in zip(expected,r['source']['foldedForm'])),2e-12)
    cp=restored_cp(r['fold'],expected,r['source']['stationaryFoldFace']);self.assertLess(max(math.dist(a,b) for a,b in zip(cp,r['fold']['vertices_coords'])),2e-11)
    for face in r['fold']['faces_vertices']:
     for i,a in enumerate(face):
      for b in face[i+1:]:self.assertLess(abs(math.dist(cp[a],cp[b])-math.dist(expected[a],expected[b])),2e-6)

 def test_success_flag_is_required_even_after_constraint_restoration(self):
  p=query('six-none')
  feasible=np.array(generate(p)['source']['pleatFactors']);events=[]
  def forced_failure(*args,**kwargs):
   events.append(('optimizer',np.array(args[1],copy=True)))
   return merit.OptimizeResult(x=feasible.copy(),success=False,status=8,
      message='forced optimizer failure',nit=1,nfev=1)
  def restored_candidate(*args,**kwargs):
   # Supply a known feasible candidate while evaluating the REAL complete
   # equations and bounds. Numerical restoration is covered by the preceding
   # real-solver tests; this test isolates the mandatory final success gate.
   residual=args[0](feasible)
   self.assertLessEqual(np.max(np.abs(residual),initial=0),1e-12)
   self.assertTrue(np.all(feasible>=kwargs['bounds'][0]))
   events.append(('restored',feasible.copy()))
   return merit.OptimizeResult(x=feasible.copy(),success=True,nfev=1)
  with patch.object(merit,'minimize',forced_failure),patch.object(merit,'least_squares',restored_candidate),self.assertRaisesRegex(ValueError,'未找到.*不构成数学无解'):
   generate(p)
  restarts=[events[i+1][1] for i,event in enumerate(events[:-1])
            if event[0]=='restored' and events[i+1][0]=='optimizer']
  self.assertTrue(restarts,'A completed feasible restoration must reach the original optimizer.')
  self.assertTrue(all(np.array_equal(seed,feasible) for seed in restarts))

 def test_projection_uses_existing_shared_budget_and_cannot_retry_exhaustion(self):
  calls=[]
  def exhausted(*args,**kwargs):calls.append(1);raise merit.MeritBudgetExceeded('预算已用尽；不构成数学无解证明。')
  with patch.object(merit,'least_squares',exhausted),self.assertRaises(merit.MeritBudgetExceeded):generate(query('six-reverse'))
  self.assertEqual(len(calls),1)

 def test_previous_legacy_cp_and_source_remain_unchanged(self):
  for name in ('six-reverse','six-none','six-empty-period'):
   c=next(c for c in OLD if c['name']==name);r=generate(c['params'])
   for k in ('fold','mother','source'):self.assertEqual(json.loads(json.dumps(r[k])),c['response'][k])

 def test_near_circular_ten_degree_and_unsafe_mother_still_reject(self):
  p=query('six-none');p.update(graph=fan(10),width=.06,minPleat=.1,minBorderPleat=.001,borderInset='auto')
  with self.assertRaisesRegex(ValueError,'CP 几何校验.*不构成数学无解'):generate(p)
  p=query('six-none');p['graph']=copy.deepcopy(p['graph']);p['graph']['edges'].append([1,4])
  with self.assertRaisesRegex(ValueError,'交叉|重复|点边'):generate(p)

if __name__=='__main__':unittest.main()
