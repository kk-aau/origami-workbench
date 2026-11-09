import copy,json,unittest,math
from pathlib import Path
from functools import lru_cache
from unittest.mock import patch
import numpy as np
from scipy.optimize import OptimizeResult
from tessellate import generate
from tessellation_woven import validate_woven
from tessellation_woven_graph import woven_graph_data
from tessellation_woven_old import old_topology
from tessellation_woven_merit import MeritBudget,MeritBudgetExceeded,ReflectionSystem
ROOT=Path(__file__).parents[1]
FIX=json.loads((ROOT/'tests/fixtures/woven-original-old-1010.json').read_text(encoding='utf8'))
@lru_cache(None)
def actual():return [(c,generate(c['params'])) for c in FIX['cases']]
class WovenOriginalOldTests(unittest.TestCase):
 def test_original_raw_groups_objective_all_constraints_and_fixed_chart(self):
  for c,r in actual():
   p=c['params'];s=r['source'];o=s['oldWoven'];h=p['width']/2;budget=MeritBudget();g,i=old_topology(woven_graph_data(p['graph'],h),h,p['parity'],p['stationaryFace'],budget)
   x=np.array(o['rawD']+o['rawDD']);self.assertEqual((i['dCount'],i['ddCount']),(18,6));self.assertEqual(o['topologyInitialCP'],i['initialCP']);self.assertEqual(o['signedStartFace'],p['parity']*(p['stationaryFace']+1));self.assertEqual(g['colors'][p['stationaryFace']],p['parity']);self.assertEqual(o['originalOptimizer'],'FindMinimum');self.assertFalse(o['wolframExecuted']);self.assertNotIn('pleatFactors',s);self.assertNotIn('meritReport',s)
   system=ReflectionSystem(g['base'],g['directions'],g['variable'],g['cycles'],budget);res,_=system.evaluate(x);self.assertLess(np.max(np.abs(res)),1e-7);np.testing.assert_allclose(system.positions(x),s['foldedForm'],rtol=0,atol=1e-12);self.assertEqual(len(g['cycles']),12);self.assertEqual(g['mainFaces'],list(range(7)))
   report=s['oldMeritReport'];self.assertAlmostEqual(report['merit'],float(x@x),places=12);self.assertEqual(report['lowerBounds'],[p['minPleat']*h]*18+[p['minBorderPleat']*h]*6);self.assertTrue(all(v>=lo for v,lo in zip(x,report['lowerBounds'])));self.assertEqual(report['evaluationBudget'],12000);self.assertLessEqual(report['evaluationCount'],12000);self.assertTrue(report['noArtificialUpperBound']);self.assertEqual(s['graph'],p['graph']);self.assertEqual(s['stationaryFoldFace'],p['stationaryFace']);self.assertEqual((r['stats']['vertices'],r['stats']['edges'],r['stats']['faces']),(40,64,25));self.assertEqual(r['stats']['checks']['geometry']['status'],'passed');self.assertEqual(r['stats']['checks']['local']['status'],'passed');self.assertEqual(r['stats']['checks']['layerOrder']['status'],'not_checked')
 def test_raw_lower_reconstruction_does_not_apply_new_all_boundary_db(self):
  p=FIX['cases'][0]['params'];g,i=old_topology(woven_graph_data(p['graph'],.2),.2,1,5,MeritBudget());boundary={v for e,k in zip(woven_graph_data(p['graph'],.2)['mesh']['edges_vertices'],woven_graph_data(p['graph'],.2)['edgeLines']) if k<0 for v in e};self.assertTrue(any(v in boundary and g['variable'][corner]>=0 and g['variable'][corner]<i['dCount'] for (f,v),corner in g['corners'].items()))
 def test_unsupported_old_extension_options_and_stationary_are_explicitly_rejected(self):
  p=FIX['cases'][0]['params']
  for edits in [dict(wovenVersion='current'),dict(borderInset='none'),dict(periodicity=[]),dict(periodicityEnabled=False),dict(segmentInsets=[]),dict(fullEdgeInsets={}),dict(optimization='legacy'),dict(stationaryFace=99),dict(graph={**p['graph'],'holeFaces':[]})]:
   with self.subTest(edits=edits),self.assertRaises(ValueError):generate({**p,**edits})
 def test_same_shared_budget_exhaustion_is_not_retried(self):
  budgets=[]
  def stop(g,lower,budget):budgets.append(budget);self.assertIsInstance(budget,MeritBudget);self.assertGreater(budget.evaluations,0);raise MeritBudgetExceeded('预算已用尽')
  with patch('tessellation_woven_old.solve_merit',stop),self.assertRaises(MeritBudgetExceeded):generate(FIX['cases'][0]['params'])
  self.assertEqual(len(budgets),1)
 def test_optimizer_failure_at_a_real_feasible_witness_is_rejected(self):
  p,r=actual()[0][0]['params'],actual()[0][1];witness=np.array(r['source']['oldWoven']['rawD']+r['source']['oldWoven']['rawDD'])
  with patch('tessellation_woven_merit.minimize',return_value=OptimizeResult(x=witness,success=False,nit=1,status=8,message='forced failure')),self.assertRaises(ValueError):generate(p)
 def test_expired_shared_deadline_after_real_solve_is_never_a_success(self):
  import tessellation_woven_old as old,time
  original=old.solve_merit
  def expire(g,lower,budget):
   result=original(g,lower,budget);budget.deadline=time.monotonic()-1;return result
  with patch.object(old,'solve_merit',expire),self.assertRaises(MeritBudgetExceeded):generate(FIX['cases'][0]['params'])
 def test_old_default_success_outputs_remain_complete_json_identical(self):
  for name in ['woven-cell-hole-area-1010.json','woven-area-topology-1010.json']:
   f=json.loads((ROOT/'tests/fixtures'/name).read_text(encoding='utf8'))
   for c in f.get('unchangedControls',[]):
    a=json.loads(json.dumps(generate(c['params'])));b=copy.deepcopy(c['response']);a['stats'].pop('elapsedMs');b['stats'].pop('elapsedMs');self.assertEqual(a,b,c['name'])
if __name__=='__main__':unittest.main()
