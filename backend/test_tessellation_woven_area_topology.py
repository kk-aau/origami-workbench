import copy,json,math,unittest
from fractions import Fraction
from functools import lru_cache
from pathlib import Path
from unittest.mock import patch
import numpy as np
from tessellate import generate
from tessellation_patterns import planar_faces
from tessellation_woven_area_topology import certified_area,certified_faces
from tessellation_woven_merit import MeritBudget,MeritBudgetExceeded
from test_tessellation_woven_even_degree import literal_ff,fan
from test_tessellation_woven_boundaries import restored_cp
ROOT=Path(__file__).parents[1]
CASES=json.loads((ROOT/'tests/fixtures/woven-area-topology-1010.json').read_text(encoding='utf8'))['cases']
@lru_cache(None)
def results():return [(c,generate(c['params'])) for c in CASES]
def exact_area(points,cycle):
 q=[[Fraction(float(x)) for x in points[v]] for v in cycle]
 return sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(q,q[1:]+q[:1]))
class WovenAreaTopologyTests(unittest.TestCase):
 def test_interval_contains_exact_binary64_area_and_excludes_zero_noise(self):
  points=np.array([[0.,0.],[1e-6,0.],[0.,1e-6]]);bounds,_=certified_area(points,[0,1,2]);self.assertLess(bounds[0],exact_area(points,[0,1,2]));self.assertGreater(bounds[1],exact_area(points,[0,1,2]));self.assertGreater(bounds[0],0)
  self.assertEqual(planar_faces(points.tolist(),[[0,1],[1,2],[2,0]]),[])
  fs,proof=certified_faces(points,[[0,1],[1,2],[2,0]],MeritBudget());self.assertEqual(fs,[[2,1,0]])
  for y in (0.,1e-20):
   q=np.array([[0.,0.],[1e-4,0.],[1e-4,y]]);area,_=certified_area(q,[0,1,2]);self.assertLessEqual(area[0],0);self.assertGreaterEqual(area[1],0)
   fs,proof=certified_faces(q,[[0,1],[1,2],[2,0]],MeritBudget());self.assertEqual(fs,[]);self.assertGreater(proof['unresolvedCycles'],0)
 def test_public_generates_three_witnesses_with_all_original_constraints_and_gate(self):
  for c,r in results():
   with self.subTest(c=c['name']):
    p=c['params'];s=r['source'];report=s['meritReport'];proof=s['topologyAreaRecovery'];self.assertEqual(s['graph'],p['graph']);self.assertEqual(s['fullEdgeInsets'],p['fullEdgeInsets']);self.assertEqual(s['topologyProbeAttempts'],170);self.assertEqual(s['topologyProbeBudget'],170)
    self.assertTrue(proof['allOriginalConstraintsRetained']);self.assertFalse(proof['sourceCoordinatesChanged']);self.assertFalse(proof['finalGeometryToleranceChanged']);self.assertFalse(proof['originalObjectiveChanged']);self.assertFalse(proof['newNegativeProbesAdded']);self.assertTrue(all(b[0]>0 for b in proof['areaBounds']))
    self.assertEqual(report['objective'],'sum-pleat-factors-squared');self.assertTrue(report['noArtificialUpperBound']);self.assertLess(report['maximumResidual'],1e-12);self.assertLess(report['kktResidual'],1e-5);self.assertLessEqual(report['evaluationCount'],12000);self.assertAlmostEqual(report['merit'],sum(x*x for x in s['pleatFactors']),places=9)
    self.assertTrue(all(x>=b for x,b in zip(s['pleatFactors'],report['lowerBounds'])))
    expected=literal_ff(p,s);self.assertLess(max(math.dist(a,b) for a,b in zip(expected,s['foldedForm'])),1e-16)
    cp=restored_cp(r['fold'],expected,s['stationaryFoldFace']);self.assertLess(max(math.dist(a,b) for a,b in zip(cp,r['fold']['vertices_coords'])),2e-15)
    for key in ('geometry','local','lff'):self.assertEqual(r['stats']['checks'][key]['status'],'passed')
    self.assertEqual(r['stats']['checks']['layerOrder']['status'],'not_checked')
    for face in r['fold']['faces_vertices']:
     for i,a in enumerate(face):
      for b in face[i+1:]:self.assertLess(abs(math.dist(cp[a],cp[b])-math.dist(expected[a],expected[b])),2e-15)
 def test_successful_historical_public_paths_remain_identical_including_source(self):
  old=json.loads((ROOT/'tests/fixtures/woven-area-topology-1010.json').read_text(encoding='utf8'))['unchangedControls']
  for c in old:
   r=generate(c['params'])
   for k in ('fold','mother','source'):self.assertEqual(json.loads(json.dumps(r[k])),c['response'][k],c['name']+' '+k)
 def test_budget_is_existing_shared_budget_and_exhaustion_is_not_retried(self):
  calls=[]
  def stop(record,budget):calls.append(budget);self.assertIsInstance(budget,MeritBudget);raise MeritBudgetExceeded('共享预算用尽')
  with patch('tessellation_woven_area_topology.restore_recorded_topology',stop),self.assertRaises(MeritBudgetExceeded):generate(CASES[0]['params'])
  self.assertEqual(len(calls),1)
 def test_failed_near_circle_keeps_final_geometry_gate(self):
  for n in (10,12,16):
   p=copy.deepcopy(CASES[0]['params']);p.pop('fullEdgeInsets');p.update(graph=fan(n),width=.06)
   with self.assertRaisesRegex(ValueError,'CP 几何校验.*不构成数学无解'):generate(p)
 def test_interval_operation_budget_is_charged(self):
  budget=MeritBudget(max_evaluations=1)
  with self.assertRaises(MeritBudgetExceeded):certified_faces(np.array([[0.,0.],[1.,0.],[0.,1.]]),[[0,1],[1,2],[2,0]],budget)
if __name__=='__main__':unittest.main()
