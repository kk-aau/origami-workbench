"""Native In[1117]/[1122]/[1094] tests, with exact geometric references."""
import copy,json,math,pathlib,unittest
from fractions import Fraction
from tessellation_woven_graph_source import (woven_graph_preprocess_query,read_graph_source,
 recompute_graph_source,match_graph_source,in3437_source)
from tessellate import generate

GRID=dict(vertices=[[-1,-1],[1,-1],[1,1],[-1,1],[0,-1],[0,1],[-1,0],[1,0]],
 edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[6,7]])
GRID_ACTUAL=dict(vertices=[[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[0,0]],
 edges=[[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0],[1,8],[8,5],[7,8],[8,3]])
CROSS=dict(vertices=[[-1,0],[1,0],[0,-1],[0,1]],edges=[[0,1],[2,3]])
NEAR=dict(vertices=[[-1,0],[-.1,0],[0,-1],[0,1]],edges=[[0,1],[2,3]])

def query(graph,**values):return dict(family='woven-graph-preprocess-native',inputGraph=copy.deepcopy(graph),**values)
def native_fixtures():
 cases=[]
 for name,q in [('exact-cross',query(CROSS)),('complete-grid',query(GRID)),
                ('near-endpoint',query(NEAR,intersectionTolerance=.15,samePtTolerance=.06)),
                ('coincident-indices',query(dict(vertices=[[-1,0],[0,0],[0,0],[0,1]],edges=[[0,1],[2,3]]))),
                ('collapsed',query(CROSS,samePtTolerance=10)),
                ('overlapping',query(dict(vertices=[[-1,0],[1,0],[-.5,0],[.5,0]],edges=[[0,1],[2,3]]))),
                ('grid-inverted',query(GRID,invertFoldType=True))]:
  r=woven_graph_preprocess_query(q);case=dict(name=name,query=q,response=r)
  if r['diagnostics']['wovenInput']['status']=='accepted':
   p=dict(family='woven-lines',mode='graph',graph=r['graph'],graphSource=r['source'],
    width=.02,parity=1,minPleat=.1,minBorderPleat=.001,borderInset='auto',stationaryFace=0)
   case.update(params=p,construction=generate(p))
  cases.append(case)
 return cases

class WovenNativePreprocessTests(unittest.TestCase):
 def test_exact_fraction_cross_and_ordered_source_owners(self):
  # Fraction line intersection independently gives (0,0), t=u=1/2.
  t=(Fraction(0)-Fraction(-1))/(Fraction(1)-Fraction(-1))
  self.assertEqual(t,Fraction(1,2));r=woven_graph_preprocess_query(query(CROSS))
  self.assertEqual(r['graph'],dict(vertices=[[-1,0],[0,0],[1,0],[0,-1],[0,1]],edges=[[0,1],[1,2],[3,1],[1,4]]))
  self.assertEqual(r['originalEdgeForSegment'],[0,0,1,1]);self.assertEqual(r['pairwiseMedials'][0]['parameters'],[.5,.5])
  self.assertEqual(r['diagnostics']['wovenInput']['status'],'not_ready');self.assertTrue(all(v is False for v in r['certificates'].values()))

 def test_grid_native_source_survives_actual_construction_and_invert(self):
  cases=native_fixtures();normal=next(c for c in cases if c['name']=='complete-grid');inverted=next(c for c in cases if c['name']=='grid-inverted')
  r=normal['response'];self.assertEqual(r['graph'],GRID_ACTUAL);self.assertEqual(r['originalEdgeForSegment'],[i for i in range(6) for _ in range(2)])
  self.assertEqual(r['diagnostics']['wovenInput']['sourceFaceCycles'],[[0,1,8,7],[1,2,3,8],[3,4,5,8],[5,6,7,8]])
  a,b=normal['construction'],inverted['construction'];self.assertEqual(a['source']['graphSource'],r['source']);self.assertFalse(a['source']['invertFoldType']);self.assertTrue(b['source']['invertFoldType'])
  self.assertEqual(a['fold']['vertices_coords'],b['fold']['vertices_coords']);self.assertEqual(a['source']['foldedForm'],b['source']['foldedForm'])
  self.assertEqual(b['fold']['edges_assignment'],[{'M':'V','V':'M'}.get(x,x) for x in a['fold']['edges_assignment']])
  for result in (a,b):
   for name in ('geometry','local','lff'):self.assertEqual(result['stats']['checks'][name]['status'],'passed')
   cp,ff=result['fold'],result['source']['foldedForm']
   for face in cp['faces_vertices']:
    for v in face:
     for w in face:self.assertLess(abs(math.dist(cp['vertices_coords'][v],cp['vertices_coords'][w])-math.dist(ff[v],ff[w])),2e-8)

 def test_original_in1121_near_end_no_average_and_first_representative(self):
  r=woven_graph_preprocess_query(query(NEAR,intersectionTolerance=.15,samePtTolerance=.06))
  self.assertLess(math.dist(r['pairwiseMedials'][0]['point'],[-.05,0]),1e-16);self.assertEqual(r['pairwiseMedials'][0]['parameters'],[1.,.5])
  self.assertEqual(r['graph'],dict(vertices=[[-1,0],[-.1,0],[0,-1],[0,1]],edges=[[0,1],[2,1],[1,3]]))
  self.assertEqual(r['originalEdgeForSegment'],[0,1,1]);self.assertEqual(r['welds'][0]['representative'],[-.1,0]);self.assertFalse(r['original']['averagesRepresentatives'])
  reversed_input=dict(vertices=NEAR['vertices'],edges=list(reversed(NEAR['edges'])))
  reversed_result=woven_graph_preprocess_query(query(reversed_input,intersectionTolerance=.15,samePtTolerance=.06))
  self.assertTrue(any(math.dist(p,[-.05,0])<1e-16 for p in reversed_result['graph']['vertices']));self.assertNotIn([-.1,0],reversed_result['graph']['vertices'])

 def test_native_coincident_indices_collapsed_and_overlap_keep_literal_result(self):
  cases={c['name']:c['response'] for c in native_fixtures()}
  self.assertEqual(cases['coincident-indices']['graph'],dict(vertices=[[-1,0],[0,0],[0,1]],edges=[[0,1],[1,2]]))
  self.assertEqual(cases['collapsed']['graph'],dict(vertices=[[-1,0]],edges=[]));self.assertEqual(cases['collapsed']['originalEdgeForSegment'],[])
  # Original medial is the overlap midpoint; retain original overlapping segments rather than inventing a clean union.
  self.assertEqual(cases['overlapping']['graph'],dict(vertices=[[-1,0],[0,0],[1,0],[-.5,0],[.5,0]],edges=[[0,1],[1,2],[3,1],[1,4]]))
  for name in ('coincident-indices','collapsed','overlapping'):self.assertEqual(cases[name]['diagnostics']['wovenInput']['status'],'not_ready')

 def test_squared_distance_boundary_and_bounding_box_filter(self):
  # Binary-exact 3/16,4/16,5/16 avoids an artificial machine-rounding epsilon at equality.
  g=dict(vertices=[[0,0],[1,0],[1+3/16,4/16],[1+3/16,1]],edges=[[0,1],[2,3]])
  r=woven_graph_preprocess_query(query(g,samePtTolerance=5/16));self.assertEqual(len(r['graph']['vertices']),3)
  self.assertEqual(r['graph']['vertices'][1],[1,0]);self.assertEqual(r['pairwiseMedials'],[])
  r=woven_graph_preprocess_query(query(g,samePtTolerance=.311));self.assertEqual(len(r['graph']['vertices']),4)
  # Source bbox tolerance 0 rejects separated boxes before Chop can accept a tiny medial distance.
  tiny=dict(vertices=[[-1,0],[-5e-11,0],[0,-1],[0,1]],edges=[[0,1],[2,3]])
  r=woven_graph_preprocess_query(query(tiny,intersectionTolerance=0,samePtTolerance=0));self.assertEqual(r['pairwiseMedials'],[])

 def test_native_provenance_recomputed_not_label_and_bad_request_rejected(self):
  q=query(GRID);r=woven_graph_preprocess_query(q);self.assertEqual(read_graph_source(r['source']),r['source']);self.assertEqual(recompute_graph_source(r['source'])[0],r['graph']);match_graph_source(r['source'],r['graph'])
  for mutation in (lambda p:p.update(family='woven-lines'),lambda p:p.update(fake=True),lambda p:p.update(intersectionTolerance=None),lambda p:p.update(samePtTolerance=True),lambda p:p.update(intersectionTolerance=-1),lambda p:p.update(samePtTolerance=101),lambda p:p.update(invertFoldType=1),lambda p:p['inputGraph']['vertices'][0].__setitem__(0,float('nan')),lambda p:p['inputGraph']['edges'][0].__setitem__(1,0),lambda p:p['inputGraph']['edges'][0].__setitem__(1,True)):
   bad=copy.deepcopy(q);mutation(bad)
   with self.assertRaises(ValueError):woven_graph_preprocess_query(bad)
  for mutation in (lambda p:p['vertices'][0].__setitem__(0,-.9),lambda p:p['edges'].reverse()):
   bad=copy.deepcopy(r['graph']);mutation(bad)
   with self.assertRaises(ValueError):match_graph_source(r['source'],bad)
  old=recompute_graph_source(in3437_source());ref=json.loads(pathlib.Path('tests/fixtures/woven-in3437-original-20260930.json').read_text(encoding='utf8'));self.assertEqual(old[0],ref['graph']);self.assertEqual(old[1]['originalEdgeForSegment'],ref['originalEdgeForSegment'])

if __name__=='__main__':unittest.main()
