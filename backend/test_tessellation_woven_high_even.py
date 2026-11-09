"""Real >=10 mother junctions, with original geometry and objective evidence."""
import copy,json,math,unittest
from collections import Counter,defaultdict
from functools import lru_cache
from pathlib import Path
from tessellate import generate
from tessellation_woven_graph import woven_graph_data
from test_tessellation_woven_even_degree import literal_ff,fan

SAVED=json.loads((Path(__file__).resolve().parents[1]/'tests/fixtures/woven-high-even-20261010.json').read_text(encoding='utf8'))

@lru_cache(None)
def fixtures():return [(c['name'],c['params'],generate(c['params'])) for c in SAVED['cases']]

class WovenHighEvenTests(unittest.TestCase):
 def test_public_original_objective_generates_every_even_degree_10_to_32(self):
  for name,p,r in fixtures():
   with self.subTest(name=name):
    n=len(p['graph']['vertices'])-1;degree=Counter(v for e in p['graph']['edges'] for v in e)
    self.assertEqual(degree[0],n);self.assertEqual(n%2,0);self.assertGreaterEqual(n,10)
    self.assertEqual(r['mother']['vertices_coords'],p['graph']['vertices']);self.assertEqual(r['mother']['edges_vertices'],p['graph']['edges']);self.assertEqual(r['source']['graph'],p['graph'])
    self.assertEqual((r['stats']['vertices'],r['stats']['edges'],r['stats']['faces']),(5*n,8*n,3*n+1))
    self.assertEqual(r['source']['sourceFaceCycles'],woven_graph_data(p['graph'])['sourceFaceCycles'])
    for check in ('geometry','local','lff'):self.assertEqual(r['stats']['checks'][check]['status'],'passed')
    self.assertEqual(r['stats']['checks']['layerOrder']['status'],'not_checked')
    self.assertLess(r['source']['closureError'],2e-6);self.assertEqual(r['source']['topologyProbeBudget'],170)
    self.assertLessEqual(r['source']['topologyProbeAttempts'],170)
    if p['optimization']=='origamica-merit':
     q=r['source']['meritReport'];self.assertEqual(q['objective'],'sum-pleat-factors-squared')
     self.assertEqual(q['certificate'],'local-numerical-candidate');self.assertTrue(q['noArtificialUpperBound']);self.assertFalse(q['wolframExecuted'])
     self.assertLess(q['maximumResidual'],1e-7);self.assertLess(q['kktResidual'],1e-4)
     self.assertAlmostEqual(q['merit'],sum(x*x for x in r['source']['pleatFactors']),places=8)
     self.assertTrue(all(x>=b for x,b in zip(r['source']['pleatFactors'],q['lowerBounds'])))

 def test_independent_literal_makeverts_and_all_face_pair_isometries(self):
  for name,p,r in fixtures():
   with self.subTest(name=name):
    actual=r['source']['foldedForm'];expected=literal_ff(p,r['source'])
    self.assertLess(max(math.dist(a,b) for a,b in zip(actual,expected)),1e-12)
    cp=r['fold']['vertices_coords']
    for face in r['fold']['faces_vertices']:
     for i,a in enumerate(face):
      for b in face[i+1:]:self.assertLess(abs(math.dist(cp[a],cp[b])-math.dist(actual[a],actual[b])),2e-6)

 def test_original_mv_edges_and_generated_four_degree_corners_are_not_replaced(self):
  for name,p,r in fixtures():
   with self.subTest(name=name):
    n=len(p['graph']['vertices'])-1;edges=r['fold']['edges_vertices'];kinds=r['fold']['edges_assignment']
    self.assertEqual(Counter(kinds),dict(B=4*n,M=5*n//2,V=3*n//2))
    incident=defaultdict(list);border=set()
    for (a,b),kind in zip(edges,kinds):
     incident[a].append(kind);incident[b].append(kind)
     if kind=='B':border.update((a,b))
    internal=[v for v in incident if v not in border];self.assertEqual(len(internal),n)
    for v in internal:self.assertEqual(Counter(incident[v]),dict(M=3,V=1))

 def test_full_absolute_insets_width_change_and_fixed_face_are_recomputed(self):
  cases={name:(p,r) for name,p,r in fixtures()};base=cases['star-10-parity-1'][1]
  self.assertEqual(cases['star-10-full-h'][1]['fold'],base['fold'])
  self.assertNotEqual(cases['star-10-width-012'][1]['fold'],base['fold'])
  self.assertEqual(cases['star-10-fixed-F4'][1]['source']['stationaryFace'],3)
  bad=copy.deepcopy(cases['star-10-full-h'][0]);bad['fullEdgeInsets']['entries'][0]['from'][0]+=.01
  with self.assertRaisesRegex(ValueError,'几何戳'):generate(bad)

 def test_odd_capacity_crossing_and_failed_round_mother_still_reject(self):
  for n in (3,5,9,11,33,34,36):
   with self.subTest(degree=n):
    with self.assertRaisesRegex(ValueError,'当前有限母图'):woven_graph_data(fan(n))
  p=copy.deepcopy(SAVED['cases'][0]['params']);p['graph']=fan(10);p['width']=.06
  for optimization in ('legacy','origamica-merit'):
   with self.subTest(optimization=optimization):
    with self.assertRaisesRegex(ValueError,'CP 几何校验.*不构成数学无解证明'):generate(dict(p,optimization=optimization))
  bad=copy.deepcopy(SAVED['cases'][0]['params']);bad['graph']['edges'].append([1,6])
  with self.assertRaisesRegex(ValueError,'交叉|点边|重复'):generate(bad)
  reverse=dict(SAVED['cases'][0]['params'],parity=-1)
  with self.assertRaisesRegex(ValueError,'无方程残差.*不构成数学无解证明'):generate(reverse)

if __name__=='__main__':unittest.main()
