import copy,json,math,unittest
from pathlib import Path
from tessellate import generate,dispatch_request
from tessellation_gore import query_gore_data,sphere_profile,validate_gore_paper

FIXTURE=Path(__file__).parents[1]/'tests/fixtures/gore-source-20261010.json'

class GoreOriginalTests(unittest.TestCase):
 def query(self,function='SingleGoreData',points=None,**kw):
  q=dict(family='gore-data-native',function=function,sectors=4,**kw)
  if not function.startswith('Sphere'):q['points']=points or [[0,0],[3,4],[3,7]]
  return query_gore_data(q)

 def test_fixed_original_four_graphic_groups(self):
  r=self.query();self.assertEqual(r['source']['arcLengths'],[0,5,8]);self.assertEqual(r['source']['halfWidths'],[0,3,3])
  self.assertEqual(r['data']['targetPolygons'][0],[[0,0,0],[3,3,4],[3,-3,4],[0,0,0]])
  self.assertEqual(r['data']['radialPolygons'][1],[[5,3,0],[8,3,0],[8,-3,0],[5,-3,0]])
  self.assertEqual(r['data']['cylindricalPolygons'][0],[[3,0,-3],[3,3,2],[3,-3,2],[3,0,-3]])
  line=[[0,0],[5,3],[8,3],[8,-3],[5,-3],[0,0]]
  self.assertEqual(r['data']['flatLines'],[line,line,line])

 def test_original_offset_then_reflect_and_degenerate_raw_preserved(self):
  r=self.query(points=[[2,0],[-1,4],[-1,4]])
  self.assertEqual(r['source']['arcLengths'],[0,5,5]);self.assertEqual(r['data']['flatLines'][0],[[0,0],[5,-3],[5,-3],[5,3],[5,3],[0,0]])
  self.assertEqual(len(r['data']['targetPolygons'][1]),4)
  with self.assertRaises(ValueError):generate(dict(family='gore-paper',profile='points',sectors=4,crossSection=[[2,0],[-1,4],[-1,4]]))

 def test_multiple_rotates_every_original_group_in_original_order(self):
  single=self.query()['data'];multiple=self.query('MultipleGoreData')['data']
  for key in single:
   self.assertEqual(len(multiple[key]),4);self.assertEqual(multiple[key][0],single[key])
   for j in range(4):
    self.assertEqual(len(multiple[key][j]),len(single[key]))
    for primitive,rotated in zip(single[key],multiple[key][j]):
     for p,v in zip(primitive,rotated):
      a=j*math.pi/2;expect=[math.cos(a)*p[0]-math.sin(a)*p[1],math.sin(a)*p[0]+math.cos(a)*p[1],*p[2:]]
      for x,y in zip(v,expect):self.assertAlmostEqual(x,y,places=12)

 def test_sphere_original_symbolic_endpoints_then_numeric_chords(self):
  p=sphere_profile(8);self.assertEqual(p[0],[0,0]);self.assertEqual(p[4],[1,1]);self.assertEqual(p[-1],[0,2])
  q=self.query('SphereSingleGoreData',divisions=8)
  self.assertAlmostEqual(q['source']['arcLengths'][-1],16*math.sin(math.pi/16),places=12)
  self.assertNotAlmostEqual(q['source']['arcLengths'][-1],math.pi,places=8)

 def test_public_query_fixtures_and_owned_parameters(self):
  fixture=json.loads(FIXTURE.read_text(encoding='utf8'))
  for c in fixture['helpers']:
   self.assertEqual(dispatch_request(dict(c['query'],operation='gore-data')),c['response'])
  for bad in [dict(family='gore-data-native',function='SphereSingleGoreData',sectors=True),dict(family='gore-data-native',function='SphereSingleGoreData',points=[[0,0],[1,1]]),dict(family='gore-data-native',function='SphereMultipleGoreData',sectors=32,divisions=64),dict(family='gore-data-native',function='foreign'),dict(family='gore-data-native',function='SingleGoreData',points=[[0,False],[1,1]])]:
   with self.subTest(bad=bad),self.assertRaises(ValueError):dispatch_request(dict(bad,operation='gore-data'))

 def test_all_public_papers_preserve_every_face_metric_and_original_rows(self):
  fixture=json.loads(FIXTURE.read_text(encoding='utf8'))
  for c in fixture['papers']:
   with self.subTest(params=c['params']):
    r=generate(c['params']);fold=r['fold'];s=r['source'];ff=s['foldedForm3D'];cp=fold['vertices_coords'];original=s['originalGoreData']
    self.assertEqual(fold,c['response']['fold']);self.assertEqual(s,c['response']['source']);self.assertEqual(r['stats']['checks']['geometry']['status'],'passed');self.assertEqual(r['stats']['checks']['layerOrder']['status'],'not_checked')
    self.assertFalse(s['continuousRigidPathChecked']);self.assertFalse(s['selfCollisionChecked'])
    for i,(plus,minus) in enumerate(s['radialRowVertices']):
     x,z=original['source']['inputPoints'][i];a=original['source']['arcLengths'][i];w=original['source']['halfWidths'][i]
     self.assertEqual(cp[plus],[a,w]);self.assertEqual(cp[minus],[a,-w]);self.assertEqual(ff[plus],[x,w,z]);self.assertEqual(ff[minus],[x,-w,z]);self.assertEqual(plus==minus,w==0)
    self.assertEqual(len(fold['faces_vertices']),len(s['radialRowVertices'])-1)
    for face in fold['faces_vertices']:
     for i,a in enumerate(face):
      for b in face[i+1:]:self.assertAlmostEqual(math.dist(cp[a],cp[b]),math.dist(ff[a],ff[b]),places=10)

 def test_paper_domain_rejects_pinches_repeats_foreign_or_conflicting_inputs(self):
  p=dict(family='gore-paper',profile='points',sectors=4,crossSection=[[0,0],[2,1],[0,2]])
  for bad in [dict(p,crossSection=[[0,0],[0,1],[2,2]]),dict(p,crossSection=[[0,0],[-1,1],[0,2]]),dict(p,crossSection=[[0,0],[2,1],[2,1]]),dict(p,divisions=8),dict(p,paper={}),dict(p,sectors=4.),dict(family='gore-paper',profile='sphere',crossSection=[[0,0],[1,1]])]:
   with self.subTest(bad=bad),self.assertRaises(ValueError):generate(bad)
  self.assertEqual(validate_gore_paper(p)['crossSection'],[[0,0],[2,1],[0,2]])

if __name__=='__main__':unittest.main()
