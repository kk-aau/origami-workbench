import json,math,unittest
from pathlib import Path
from tessellate import dispatch_request,generate
from tessellation_test_pleat import query_test_pleat
class TestPleatOriginalTests(unittest.TestCase):
 def query(self,points,angle):return query_test_pleat(dict(family='test-pleat-native',points=points,angleDeg=angle))
 def test_original_right_angle_four_graphic_structure_and_styles(self):
  r=self.query([[0,0],[1,0]],90);g=r['data']['graphics'];self.assertEqual(len(g),4);self.assertEqual([p['primitive'] for p in g],['Polygon','Line','Line','Line']);self.assertEqual([p['style'] for p in g],[{'Opacity':.1},'Black','Red','Blue'])
  expected=[[[0,1.8],[1,1.8],[1,0],[0,0]],[[0,0],[1,0]],[[0,0],[0,1.8]],[[1,0],[1,1.8]]]
  for primitive,pts in zip(g,expected):
   for a,b in zip(primitive['points'],pts):
    for x,y in zip(a,b):self.assertAlmostEqual(x,y,places=12)
 def test_source_formula_independently_normalizes_before_rotation(self):
  for a,b,angle in [([2,3],[5,7],27),([5,7],[2,3],27),([0,0],[1e-12,2e-12],36)]:
   r=self.query([a,b],angle);delta=[a[k]-b[k] for k in range(2)];d=math.dist(a,b);normal=[v/d for v in delta];t=-math.radians(angle);direction=[math.cos(t)*normal[0]-math.sin(t)*normal[1],math.sin(t)*normal[0]+math.cos(t)*normal[1]];dab=sum(u*v for u,v in zip(delta,direction))/2;pa=[a[k]+(1.8*d-dab)*direction[k] for k in range(2)];pb=[b[k]+(1.8*d+dab)*direction[k] for k in range(2)]
   for raw,expected in [(r['source']['direction'],direction),(r['source']['pa'],pa),(r['source']['pb'],pb)]:
    for x,y in zip(raw,expected):self.assertAlmostEqual(x,y,places=11)
   self.assertEqual(r['data']['graphics'][0]['points'][2:],[b,a]);self.assertEqual(r['data']['graphics'][1]['points'],[a,b])
 def test_degenerate_angles_keep_four_original_corners_and_three_lines(self):
  for angle in [0,180,360,-180,36000]:
   r=self.query([[0,0],[1,0]],angle);self.assertEqual(len(r['data']['graphics']),4);self.assertEqual(len(r['data']['graphics'][0]['points']),4);self.assertEqual(r['data']['graphics'][1]['points'],[[0,0],[1,0]]);self.assertNotIn('fold',r);self.assertFalse(r['source']['paperCertification'])
 def test_public_dispatch_matches_every_frozen_original_result(self):
  cases=json.loads((Path(__file__).parents[1]/'tests/fixtures/test-pleat-source-20261010.json').read_text(encoding='utf8'))['cases']
  for c in cases:self.assertEqual(dispatch_request(dict(c['query'],operation='test-pleat')),c['response'])
 def test_rejects_zero_normalization_foreign_options_and_invalid_literal_inputs(self):
  p=dict(family='test-pleat-native',points=[[0,0],[1,0]],angleDeg=36)
  for bad in [dict(p,points=[[0,0],[0,0]]),dict(p,points=[[0,False],[1,0]]),dict(p,points=None),dict(p,angleDeg=True),dict(p,angleDeg=float('inf')),dict(p,angleDeg=36001),dict(p,opts={}),dict(p,paper={})]:
   with self.subTest(bad=bad),self.assertRaises(ValueError):dispatch_request(dict(bad,operation='test-pleat'))
  with self.assertRaises(ValueError):generate(p)
if __name__=='__main__':unittest.main()
