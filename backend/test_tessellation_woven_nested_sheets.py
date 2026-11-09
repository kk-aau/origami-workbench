import copy,json,math,unittest
from pathlib import Path
from tessellate import generate
from tessellation_woven_graph import woven_graph_data
SAVED=json.loads((Path(__file__).parents[1]/'tests/fixtures/woven-nested-sheets-1008.json').read_text(encoding='utf-8'))
class NestedMotherSheetsTests(unittest.TestCase):
 def test_nested_independent_sheet_can_retain_its_own_explicit_hole(self):
  c=json.loads((Path(__file__).parents[1]/'tests/fixtures/woven-nested-hole-sheet-1008.json').read_text(encoding='utf-8'));r=generate(c['params']);self.assertEqual(r['source']['graph'],c['params']['graph']);self.assertEqual(r['source']['wovenMotherHoles']['faceIds'],[8]);self.assertEqual(len(r['source']['wovenIndependentMother']['vertices']),2);self.assertEqual(r['stats']['checks']['geometry']['status'],'passed');self.assertLess(r['source']['closureError'],1e-8)
 def test_nested_contours_need_explicit_independent_sheet_choice(self):
  graph=copy.deepcopy(SAVED['cases'][0]['params']['graph']);original=copy.deepcopy(graph);data=woven_graph_data(graph)
  self.assertEqual(graph,original);self.assertEqual(data['motherComponents'],[list(range(5)),list(range(5,10))]);self.assertEqual(len(data['sourceFaceCycles']),8);self.assertNotIn('motherHoleCycles',data)
  del graph['nestedSheets']
  with self.assertRaisesRegex(ValueError,'明确选择'):woven_graph_data(graph)
 def test_choice_does_not_relax_intersection_duplicate_or_invalid_flag_checks(self):
  graph=copy.deepcopy(SAVED['cases'][0]['params']['graph'])
  for value in (False,None,1,'true'):
   with self.subTest(flag=value),self.assertRaises(ValueError):woven_graph_data(dict(graph,nestedSheets=value))
  graph['vertices'][5]=graph['vertices'][0].copy()
  with self.assertRaisesRegex(ValueError,'重合'):woven_graph_data(graph)
  graph=copy.deepcopy(SAVED['cases'][0]['params']['graph']);graph['vertices'][6]=[9,2.5]
  with self.assertRaisesRegex(ValueError,'交叉|交点'):woven_graph_data(graph)
 def test_public_generation_keeps_source_indices_all_faces_and_each_folded_frame(self):
  for c in SAVED['cases']:
   with self.subTest(name=c['name']):
    p=copy.deepcopy(c['params']);before=copy.deepcopy(p);r=generate(p);self.assertEqual(p,before);self.assertEqual(r['source']['graph'],p['graph']);self.assertEqual(r['mother']['vertices_coords'],p['graph']['vertices']);self.assertEqual(r['mother']['edges_vertices'],p['graph']['edges']);self.assertEqual(len(r['mother']['faces_vertices']),8);self.assertEqual(r['stats']['checks']['geometry']['status'],'passed');self.assertLess(r['source']['closureError'],1e-8)
    proof=r['source']['wovenIndependentMother'];self.assertEqual(proof['vertices'],[list(range(5)),list(range(5,10))]);self.assertEqual(len(proof['foldRoots']),2);self.assertNotIn('wovenMotherHoles',r['source'])
    cp=r['fold']['vertices_coords'];ff=r['source']['foldedForm']
    for face in r['fold']['faces_vertices']:
     for i,a in enumerate(face):
      for b in face[i+1:]:self.assertLess(abs(math.dist(cp[a],cp[b])-math.dist(ff[a],ff[b])),1e-8)
if __name__=='__main__':unittest.main()
