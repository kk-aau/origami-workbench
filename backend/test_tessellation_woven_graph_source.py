import copy,json,math,pathlib,re,unittest
from tessellate import generate
from tessellation_woven import validate_woven,woven_pattern
from tessellation_woven_graph import woven_graph_data
from tessellation_woven_graph_source import INPUT,in3437_source,recompute_graph_source
from tessellation_woven_inset_separation import woven_inset_separation_query

def source_params():
 source=in3437_source();graph,_=recompute_graph_source(source)
 return dict(family='woven-lines',mode='graph',graph=graph,graphSource=source,width=16.,parity=1,minPleat=1.,minBorderPleat=.01,borderInset='auto',stationaryFace=0)

def full_source(params):
 graph=params['graph'];data=woven_graph_data(graph,8.,params['graphSource'])
 return dict(edgeCount=len(graph['edges']),entries=[dict(edge=i,line=data['edgeLines'][i],**{'from':graph['vertices'][a].copy()},to=graph['vertices'][b].copy(),inset=8.) for i,(a,b) in enumerate(graph['edges'])])

def fixtures():
 p=source_params();full=full_source(p)
 values=[p,dict(p,fullEdgeInsets=full),dict(p,fullEdgeInsets=full,width=18.),dict(p,fullEdgeInsets=full,borderInset='none'),dict(p,fullEdgeInsets=full,periodicityEnabled=True,periodicity=[]),dict(p,parity=-1,stationaryFace=3)]
 return [dict(params=p,response=generate(p)) for p in values]

class WovenGraphSourceTests(unittest.TestCase):
 def test_literal_notebook_input_and_original_tolerant_index_order(self):
  text=pathlib.Path('tmp/Origamica-15.0-reference.nb').read_text(encoding='utf8');cell=text[text.index('Cell["Dislocation", "Subsubsection"'):];cell=cell[:cell.index('"In[3437]:="')];raw=cell[cell.index('RowBox[{"MakeTGraph"'):cell.index('RowBox[{"Print"')]
  pairs=re.findall(r'RowBox\[\{"([^"\n]+)", ",", "([^"\n]+)"\}\]',raw);values=[[float(a.rstrip('`')),float(b.rstrip('`'))] for a,b in pairs]
  self.assertEqual(INPUT,dict(vertices=values[:22],edges=[[int(a)-1,int(b)-1] for a,b in values[22:]]))
  graph,info=recompute_graph_source(in3437_source());reference=json.loads(pathlib.Path('tests/fixtures/woven-in3437-original-20260930.json').read_text(encoding='utf8'))
  self.assertEqual(graph,reference['graph']);self.assertEqual(info['originalEdgeForSegment'],reference['originalEdgeForSegment'])
  self.assertEqual((len(graph['vertices']),len(graph['edges'])),(46,79));self.assertEqual(woven_graph_data(graph,8.,in3437_source())['sourceFaceCycles'],reference['sourceFaceCycles'])

 def test_unscaled_h8_actual_invert_fold_type_and_independent_isometry(self):
  p=source_params();r=generate(p);data=woven_graph_data(p['graph'],8.,p['graphSource']);fold,flat,solved=woven_pattern(data,border_inset=8.)
  self.assertEqual(r['fold']['vertices_coords'],fold['vertices_coords']);self.assertEqual(r['source']['foldedForm'],flat)
  self.assertEqual(r['fold']['edges_assignment'],[{'M':'V','V':'M'}.get(a,a) for a in fold['edges_assignment']]);self.assertEqual(r['fold']['edges_foldAngle'],[-a if a is not None else None for a in fold['edges_foldAngle']])
  self.assertEqual((r['stats']['vertices'],r['stats']['edges'],r['stats']['faces'],r['stats']['tiles']),(172,304,133,34))
  self.assertEqual(r['source']['graphSource'],p['graphSource']);self.assertTrue(r['source']['invertFoldType']);self.assertEqual(r['source']['stationaryFace'],0)
  for name in ('geometry','local','lff'):self.assertEqual(r['stats']['checks'][name]['status'],'passed')
  self.assertGreater(max(x for point in p['graph']['vertices'] for x in point),353)
  for f in fold['faces_vertices']:
   for a in f:
    for b in f:self.assertLess(abs(math.dist(fold['vertices_coords'][a],fold['vertices_coords'][b])-math.dist(flat[a],flat[b])),2e-8)

 def test_complete_79_h_width_invariance_none_empty_periodicity_and_fixed_face(self):
  cases=fixtures();self.assertEqual(cases[0]['response']['fold'],cases[1]['response']['fold']);self.assertEqual(cases[1]['response']['fold'],cases[2]['response']['fold']);self.assertEqual(cases[3]['response']['fold'],cases[4]['response']['fold'])
  empty=cases[4]['response']['source'];self.assertEqual(empty['requestedEdgeInsets'],[8.]*79);self.assertEqual(empty['effectiveEdgeInsets'],[0. if k<0 else 8. for k in empty['edgeLines']])
  self.assertEqual(cases[5]['response']['source']['stationaryFace'],3);self.assertNotEqual(cases[5]['response']['source']['stationaryFoldFace'],cases[0]['response']['source']['stationaryFoldFace'])
  for case in cases:self.assertEqual(validate_woven(case['params']),case['params'])

 def test_source_is_not_a_label_and_plain_graph_preserves_indices_without_stamp(self):
  p=source_params();plain=copy.deepcopy(p);plain.pop('graphSource')
  # The general graph path now admits true reentrant outer boundaries.
  # Omitting a source stamp must keep the graph, without inventing provenance.
  self.assertEqual(validate_woven(plain),plain)
  data=woven_graph_data(plain['graph'],8.)
  self.assertTrue(data['concaveBoundary']);self.assertNotIn('graphSourceInfo',data)
  self.assertEqual(data['sourceFaceCycles'],woven_graph_data(p['graph'],8.,p['graphSource'])['sourceFaceCycles'])
  for mutation in (lambda q:q['graphSource'].update(kind='unknown'),lambda q:q['graphSource'].update(intersectionTolerance=1),lambda q:q['graphSource'].update(invertFoldType=False),lambda q:q['graphSource']['inputGraph']['vertices'][0].__setitem__(0,1.3),lambda q:q['graphSource']['inputGraph']['edges'][0].__setitem__(0,False),lambda q:q['graph']['vertices'][0].__setitem__(0,1.3),lambda q:q['graph']['edges'].reverse(),lambda q:q['graph']['vertices'].pop()):
   bad=copy.deepcopy(p);mutation(bad)
   with self.assertRaises(ValueError):validate_woven(bad)

 def test_context_limits_full_source_stamps_and_degenerate_interior_reject(self):
  p=source_params();full=full_source(p)
  for patch in ({'width':20.01},{'fullEdgeInsets':dict(full,entries=full['entries'][:-1])},{'periodicityEnabled':False,'periodicity':[[0,1]]}):
   with self.assertRaises(ValueError):generate(dict(p,**patch))
  for mutation in (lambda x:x['entries'][0].update(inset=10.01),lambda x:x['entries'][0]['from'].__setitem__(0,1000.01),lambda x:x['entries'][0].update(line=0),lambda x:x['entries'][5]['from'].__setitem__(0,80.)):
   bad=copy.deepcopy(full);mutation(bad)
   with self.assertRaises(ValueError):generate(dict(p,fullEdgeInsets=bad))
  bad=copy.deepcopy(full);bad['entries'][5]['inset']=0
  with self.assertRaisesRegex(ValueError,'内边零内缩'):generate(dict(p,fullEdgeInsets=bad))
  from test_tessellation_woven_graph import BASE
  scaled=copy.deepcopy(BASE);scaled['graph']['vertices']=[[100*x,100*y] for x,y in scaled['graph']['vertices']];scaled['width']=8
  self.assertEqual(generate(scaled)['stats']['checks']['geometry']['status'],'passed')
  with self.assertRaises(ValueError):validate_woven(dict(family='woven-lines',mode='lines',width=16))

 def test_source_diagnostic_preserves_faces_and_original_0_to_10_range(self):
  r=woven_inset_separation_query(dict(params=source_params(),start=0,stop=10,count=21));self.assertEqual(r['faceCount'],34);self.assertEqual(len(r['separations']),21);self.assertTrue(r['uniformInset'])

if __name__=='__main__':unittest.main()
