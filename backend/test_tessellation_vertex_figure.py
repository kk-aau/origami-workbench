import unittest,math,json
from pathlib import Path
from tessellate import dispatch_request,generate
from tessellation_vertex_figure import query_vertex_figure
class VertexFigureTests(unittest.TestCase):
 def query(self,sides):return query_vertex_figure(dict(family='archimedean-vertex-figure-native',vertexType=sides))
 def test_original_square_vertices_rotations_and_default_group_nesting(self):
  r=self.query([4]*4);groups,point=r['data']['graphics'];self.assertEqual(len(groups),4);self.assertEqual(point,dict(primitive='Point',point=[0,0],style=dict(AbsolutePointSize=5)))
  expected=[[[0,0],[1,0],[1,1],[0,1]],[[0,0],[0,1],[-1,1],[-1,0]],[[0,0],[-1,0],[-1,-1],[0,-1]],[[0,0],[0,-1],[1,-1],[1,0]]]
  for i,g in enumerate(groups):
   self.assertAlmostEqual(r['source']['rotationsRad'][i],i*math.pi/2,places=12);self.assertEqual(len(g),1);self.assertEqual(len(g[0]),4)
   for j,l in enumerate(g[0]):
    self.assertEqual(l['primitive'],'Line');self.assertEqual(l['style'],'TilingLine')
    for p,q in zip(l['points'],[expected[i][j],expected[i][(j+1)%4]]):
     for a,b in zip(p,q):self.assertAlmostEqual(a,b,places=12)
  self.assertEqual(r['source']['renderTileDefaults']['TilePolys'],False)
 def test_arbitrary_open_overlapping_and_empty_inputs_preserve_original_output(self):
  for sides in [[],[3],[3,5,24],[12]*16]:
   r=self.query(sides);self.assertEqual(len(r['data']['graphics'][0]),len(sides));self.assertEqual(sum(len(g[0]) for g in r['data']['graphics'][0]),sum(sides))
   self.assertAlmostEqual(r['source']['totalInteriorAngleRad'],sum(math.pi-2*math.pi/n for n in sides),places=11)
   self.assertFalse(r['source']['paperCertification']);self.assertNotIn('fold',r)
 def test_original_unit_edges_origin_and_cumulative_angle(self):
  sides=[3,4,6,4];r=self.query(sides);theta=0
  for n,g,rot in zip(sides,r['data']['graphics'][0],r['source']['rotationsRad']):
   self.assertAlmostEqual(rot,theta,places=12);self.assertEqual(g[0][0]['points'][0],[0,0]);self.assertAlmostEqual(g[0][0]['points'][1][0],math.cos(theta),places=12);self.assertAlmostEqual(g[0][0]['points'][1][1],math.sin(theta),places=12)
   for line in g[0]:self.assertAlmostEqual(math.dist(*line['points']),1,places=12)
   theta+=math.pi-2*math.pi/n
  self.assertAlmostEqual(theta,2*math.pi,places=12)
 def test_public_dispatch_matches_all_real_fixtures(self):
  d=json.loads((Path(__file__).parents[1]/'tests/fixtures/vertex-figure-source-20261010.json').read_text(encoding='utf8'))
  for c in d['cases']:self.assertEqual(dispatch_request(dict(c['query'],operation='archimedean-vertex-figure')),c['response'])
 def test_owned_parameters_and_public_budget(self):
  q=dict(family='archimedean-vertex-figure-native',vertexType=[3,4,6,4])
  for bad in [dict(q,vertexType=None),dict(q,vertexType=[True]),dict(q,vertexType=[4.]),dict(q,vertexType=[2]),dict(q,vertexType=[25]),dict(q,vertexType=[3]*17),dict(q,paper={}),dict(q,function='MakeArchimedeanVertexFigure')]:
   with self.subTest(bad=bad),self.assertRaises(ValueError):dispatch_request(dict(bad,operation='archimedean-vertex-figure'))
  with self.assertRaises(ValueError):generate(q)
if __name__=='__main__':unittest.main()
