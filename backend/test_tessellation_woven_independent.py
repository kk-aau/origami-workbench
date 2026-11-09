"""Independent mother input: real public generation and original frame identity."""
import copy,json,math,unittest
from pathlib import Path
from collections import defaultdict
from tessellate import generate
from tessellation_woven_graph import woven_graph_data

SAVED=json.loads((Path(__file__).resolve().parents[1]/'tests/fixtures/woven-independent-1008.json').read_text(encoding='utf8'))['cases']

class WovenIndependentTests(unittest.TestCase):
 def test_source_indices_components_and_all_public_geometry_gates(self):
  for c in SAVED:
   with self.subTest(name=c['name']):
    p=c['params'];before=copy.deepcopy(p);r=generate(p);self.assertEqual(p,before)
    self.assertEqual(r['mother']['vertices_coords'],p['graph']['vertices']);self.assertEqual(r['mother']['edges_vertices'],p['graph']['edges'])
    d=woven_graph_data(p['graph']);s=r['source'];self.assertEqual(s['sourceFaceCycles'],d['sourceFaceCycles'])
    self.assertEqual(s['wovenIndependentMother']['vertices'],d['motherComponents']);self.assertEqual(s['wovenIndependentMother']['faces'],d['motherComponentFaces'])
    self.assertEqual(r['stats']['checks']['geometry']['status'],'passed')
    for k in ('local','lff'):self.assertIn(r['stats']['checks'][k]['status'],('passed','not_applicable'))
    self.assertEqual((r['stats']['vertices'],r['stats']['edges'],r['stats']['faces']),(20,28,10) if c['name']=='merit-cut-pair' else (40,64,26))
    self.assertNotIn('lines',s);self.assertNotIn('segmentInsets',s)

 def test_each_component_is_anchored_in_its_actual_ff_frame_and_every_face_is_isometric(self):
  for c in SAVED:
   r=generate(c['params']);cp=r['fold']['vertices_coords'];ff=r['source']['foldedForm'];fs=r['fold']['faces_vertices']
   for root in r['source']['wovenIndependentMother']['foldRoots']:
    for v in fs[root]:self.assertLess(math.dist(cp[v],ff[v]),1e-10)
   for f in fs:
    for i,a in enumerate(f):
     for b in f[i+1:]:self.assertLess(abs(math.dist(cp[a],cp[b])-math.dist(ff[a],ff[b])),1e-8)
   self.assertLess(r['source']['closureError'],1e-8)

 def test_unrequested_single_mother_outputs_are_unchanged(self):
  frozen=json.loads((Path(__file__).resolve().parents[1]/'tests/fixtures/woven-even-degree-20261001.json').read_text(encoding='utf8'))
  for c in frozen['baseline']:
   r=generate(c['params'])
   for k in ('fold','mother','source'):self.assertEqual(json.loads(json.dumps(r[k])),c['response'][k])
   self.assertNotIn('wovenIndependentMother',r['source'])

 def test_fixed_second_face_full_insets_and_nonempty_period_stay_real_requests(self):
  results={c['name']:generate(c['params']) for c in SAVED}
  self.assertEqual(results['fixed-second']['source']['stationaryFace'],4)
  self.assertEqual(results['fixed-second']['source']['wovenIndependentMother']['foldRoots'],[14,1])
  self.assertEqual(results['full-insets']['source']['requestedEdgeInsets'],[.04]*16)
  self.assertEqual(results['periodic-pair']['stats']['parameters']['periodicity'],[[1,6]])
  self.assertEqual(results['periodic-pair']['source']['borderInset'],0)
  self.assertEqual(results['merit-cut-pair']['source']['meritReport']['certificate'],'feasible-lower-bound')
  self.assertEqual(len(results['merit-cut-pair']['source']['wovenCutTopology']['internalBoundaryEdges']),4)

 def test_component_and_face_ids_follow_original_arrays_even_if_edges_interleave(self):
  p=copy.deepcopy(SAVED[0]['params']);es=p['graph']['edges'];p['graph']['edges']=[e for pair in zip(es[8:],es[:8]) for e in pair]
  r=generate(p);self.assertEqual(r['mother']['edges_vertices'],p['graph']['edges']);self.assertEqual(r['source']['sourceFaceCycles'],woven_graph_data(p['graph'])['sourceFaceCycles']);self.assertEqual(r['stats']['checks']['geometry']['status'],'passed')

 def test_nested_touching_crossed_or_isolated_components_are_not_silently_reinterpreted(self):
  g=copy.deepcopy(SAVED[0]['params']['graph'])
  nested=dict(vertices=[[-3,-3],[3,-3],[3,3],[-3,3]]+copy.deepcopy(g['vertices'][:5]),edges=[[0,1],[1,2],[2,3],[3,0]]+[[a+4,b+4] for a,b in g['edges'][:8]])
  with self.assertRaisesRegex(ValueError,'包含'):woven_graph_data(nested)
  touching=copy.deepcopy(g);touching['vertices'][5:]=[[x+2,y] for x,y in touching['vertices'][:5]]
  with self.assertRaisesRegex(ValueError,'重合|交叉|交点'):woven_graph_data(touching)
  isolated=copy.deepcopy(g);isolated['vertices'].append([16,0])
  with self.assertRaisesRegex(ValueError,'孤点'):woven_graph_data(isolated)
  crossing=copy.deepcopy(g);crossing['vertices'][5:]=[[x+.5,y+.3] for x,y in crossing['vertices'][:5]]
  with self.assertRaisesRegex(ValueError,'交叉|交点'):woven_graph_data(crossing)

if __name__=='__main__':unittest.main()
