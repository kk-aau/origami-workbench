import copy,json,math,unittest
from fractions import Fraction
from pathlib import Path
from tessellation_woven_graph_source import woven_graph_preprocess_query
from tessellate import generate
SAVED=json.loads((Path(__file__).parents[1]/'tests/fixtures/woven-straight-mother-1010.json').read_text(encoding='utf-8'))

class WovenStraightMotherTests(unittest.TestCase):
 def test_exact_crosses_boundary_endpoints_and_skew_lines_keep_original_geometry_and_segment_coverage(self):
  for c in SAVED['cases']:
   with self.subTest(name=c['name']):
    query=copy.deepcopy(c['query']);before=copy.deepcopy(query);r=woven_graph_preprocess_query(query);self.assertEqual(query,before);self.assertEqual(r['graph'],c['preprocess']['graph']);self.assertEqual(r['welds'],[]);self.assertTrue(all(v is False for v in r['certificates'].values()))
    for point in query['inputGraph']['vertices']:self.assertIn(point,r['graph']['vertices'])
    for e,(a,b) in enumerate(query['inputGraph']['edges']):
     p,q=query['inputGraph']['vertices'][a],query['inputGraph']['vertices'][b];dx,dy=[Fraction(q[k])-Fraction(p[k]) for k in (0,1)];den=dx*dx+dy*dy;intervals=[]
     for i,(u,v) in enumerate(r['graph']['edges']):
      if r['originalEdgeForSegment'][i]!=e:continue
      pair=[]
      for vertex in (u,v):
       x,y=r['graph']['vertices'][vertex];rx,ry=Fraction(x)-Fraction(p[0]),Fraction(y)-Fraction(p[1]);self.assertEqual(dx*ry-dy*rx,0);pair.append((dx*rx+dy*ry)/den)
      intervals.append(sorted(pair))
     intervals.sort();self.assertEqual(intervals[0][0],0);self.assertEqual(intervals[-1][1],1)
     for previous,current in zip(intervals,intervals[1:]):self.assertEqual(previous[1],current[0])
 def test_actual_public_cp_for_all_four_inputs_keeps_raw_source_and_full_rigid_face_isometry(self):
  for c in SAVED['cases']:
   with self.subTest(name=c['name']):
    p=copy.deepcopy(c['params']);before=copy.deepcopy(p);r=generate(p);self.assertEqual(p,before);self.assertEqual(r['source']['graphSource']['inputGraph'],c['query']['inputGraph']);self.assertEqual(r['source']['originalEdgeForSegment'],c['preprocess']['originalEdgeForSegment']);self.assertEqual(r['stats']['checks']['geometry']['status'],'passed');self.assertLess(r['source']['closureError'],1e-8)
    for face in r['fold']['faces_vertices']:
     for i,a in enumerate(face):
      for b in face[i+1:]:self.assertLess(abs(math.dist(r['fold']['vertices_coords'][a],r['fold']['vertices_coords'][b])-math.dist(r['source']['foldedForm'][a],r['source']['foldedForm'][b])),1e-8)
 def test_native_primitive_api_rejects_material_roles_instead_of_silently_stripping_them(self):
  for key,value in [('holeFaces',[0]),('ringHoles',[dict(face=0,component=1)]),('nestedSheets',True),('curveHoles',[])]:
   query=copy.deepcopy(SAVED['cases'][0]['query']);query['inputGraph'][key]=value;before=copy.deepcopy(query)
   with self.subTest(key=key),self.assertRaises(ValueError):woven_graph_preprocess_query(query)
   self.assertEqual(query,before)

if __name__=='__main__':unittest.main()
