import json,math,unittest,copy
from pathlib import Path
from fractions import Fraction
from functools import lru_cache
from unittest.mock import patch
from tessellate import generate
import tessellation_woven_area_topology as area
from tessellation_woven_merit import MeritBudgetExceeded,MeritBudget
from test_tessellation_woven_even_degree import literal_ff
ROOT=Path(__file__).parents[1];FIX=json.loads((ROOT/'tests/fixtures/woven-cell-hole-area-1010.json').read_text(encoding='utf8'))
@lru_cache(None)
def results():return [(c,generate(c['params'])) for c in FIX['cases']]
class WovenCellHoleAreaTests(unittest.TestCase):
 def test_actual_full_original_objective_and_all_global_closure_rows_are_retained(self):
  for c,r in results():
   s=r['source'];p=c['params'];report=s['meritReport'];holes=s['topologyAreaRecovery']['cellHoles'];self.assertEqual(s['graph'],p['graph']);self.assertEqual(s['fullEdgeInsets'],p['fullEdgeInsets']);self.assertEqual(s['wovenMotherHoles']['faceIds'],p['graph']['holeFaces']);self.assertEqual(report['holeClosureEquationCount'],128 if c['name']=='two-independent' else 64);self.assertEqual(report['equalityEquationCount'],report['holeClosureEquationCount']);self.assertLess(report['maximumResidual'],1e-7);self.assertLess(report['holeClosureMaximumResidual'],1e-7);self.assertAlmostEqual(report['merit'],sum(x*x for x in s['pleatFactors']),places=12);self.assertLessEqual(report['evaluationCount'],12000);self.assertTrue(report['noArtificialUpperBound']);self.assertTrue(all(x>=b for x,b in zip(s['pleatFactors'],report['lowerBounds'])));self.assertEqual(s['topologyProbeAttempts'],170);self.assertEqual(holes['materialEuler'],0)
   self.assertLess(max(math.dist(a,b) for a,b in zip(literal_ff(p,s),s['foldedForm'])),1e-17);self.assertEqual(r['stats']['checks']['geometry']['status'],'passed');self.assertEqual(r['stats']['checks']['layerOrder']['status'],'not_checked')
 def test_fraction_verifies_all_material_and_excluded_void_positive_area_intervals(self):
  original=area.restore_recorded_topology;checked=[]
  def audit(record,budget):
   g=original(record,budget);proof=g['areaTopologyProof'];pairs=list(zip(g['faces'],proof['areaBounds']))+list(zip(proof['cellHoles']['excludedCycles'],proof['cellHoles']['excludedBounds']))
   for face,bounds in pairs:
    q=[[Fraction(float(x)) for x in record['initial'][v]] for v in face[::-1]];exact=sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(q,q[1:]+q[:1]));self.assertTrue(Fraction(bounds[0])<exact<Fraction(bounds[1]));self.assertGreater(bounds[0],0)
   self.assertTrue(all(f not in g['faces'] for f in proof['cellHoles']['excludedCycles']));checked.append(len(pairs));return g
  with patch.object(area,'restore_recorded_topology',audit):
   for c in FIX['cases']:generate(c['params'])
  self.assertEqual(checked,[17,17,34])
 def test_old_successful_hole_cases_stay_identical_including_full_source(self):
  for c in FIX['unchangedControls']:
   r=generate(c['params'])
   actual=json.loads(json.dumps(r));expected=copy.deepcopy(c['response']);actual['stats'].pop('elapsedMs');expected['stats'].pop('elapsedMs')
   self.assertEqual(actual,expected,c['name']+' complete JSON except measured wall time')
 def test_same_shared_budget_exhaustion_is_not_retried(self):
  calls=[]
  def stop(record,budget):self.assertIsInstance(budget,MeritBudget);calls.append(budget);raise MeritBudgetExceeded('预算已用尽')
  with patch.object(area,'restore_recorded_topology',stop),self.assertRaises(MeritBudgetExceeded):generate(FIX['cases'][0]['params'])
  self.assertEqual(len(calls),1)
 def test_missing_hole_or_changed_material_identity_never_infers_another_void(self):
  c=copy.deepcopy(FIX['cases'][0]['params']);c['graph']['holeFaces']=[0]
  with self.assertRaisesRegex(ValueError,'孔洞.*外边界'):generate(c)
if __name__=='__main__':unittest.main()
