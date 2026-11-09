import json,math,unittest
from pathlib import Path
from tessellate import dispatch_request
from tessellation_three_cycle_native import query_three_cycle
E=[[[0,-1],[0,3]],[[-3,0],[0,-3]],[[-3,2],[0,2]]]
class ThreeCycleNativeTests(unittest.TestCase):
 def query(self,edges=E,check=True):return query_three_cycle(dict(family='three-cycle-critical-native',edges=edges,checkHalfPlane=check))
 def test_same_halfplane_true_and_false_are_real_different_original_branches(self):
  a=self.query();b=self.query(check=False);self.assertEqual(a['data']['anglesDeg'],[90,270]);expected=[39.8055710922652,101.30993247402021]
  for x,y in zip(b['data']['anglesDeg'],expected):self.assertAlmostEqual(x,y,places=10)
  self.assertTrue(all(e['halfPlaneEarlyReturnUsed'] for e in a['data']['evaluations']));self.assertFalse(any(e['halfPlaneEarlyReturnUsed'] for e in b['data']['evaluations']))
 def test_false_scalar_contraction_independently_matches_source_tensor(self):
  def ccw(edges):
   a,b,c=edges;sub=lambda a,b:[a[i]-b[i] for i in range(2)];dot=lambda a,b:sum(x*y for x,y in zip(a,b));right=lambda p:[p[1],-p[0]];cross=lambda a,b:a[0]*b[1]-a[1]*b[0]
   s1,s2,s3=[sub(e[1],e[0]) for e in edges]
   def direction(p,other,own):
    a=[p[0]*right(own)[i]+p[1]*own[i] for i in range(2)];b=[-p[0]*own[i]+p[1]*right(own)[i] for i in range(2)];return[dot(other,a),dot(other,b)]
   def hit(p,u,q,v):t=cross(sub(q,p),v)/cross(u,v);return[p[i]+t*u[i] for i in range(2)]
   p12=sub(b[1],a[1]);p23=sub(c[1],b[1]);t12=hit(a[1],direction(p12,s2,s1),b[1],direction(p12,s1,s2));t23=hit(b[1],direction(p23,s3,s2),c[1],direction(p23,s2,s3));u=right(sub(t12,t23));return math.atan(dot(u,right(s2))/dot(u,s2))
  r=self.query(check=False);self.assertAlmostEqual(r['data']['anglesRad'][0],ccw(E),places=12);self.assertAlmostEqual(r['data']['anglesRad'][1],math.pi+ccw([e[::-1] for e in E]),places=12)
 def test_clockwise_triangle_keeps_original_signed_arctan_branch(self):
  edges=[[[0,0],[0,1]],[[0,1],[1,0]],[[1,0],[0,0]]];r=self.query(edges,False);self.assertAlmostEqual(r['data']['anglesDeg'][0],-26.56505117707799,places=10);self.assertAlmostEqual(r['data']['anglesDeg'][1],206.56505117707798,places=10)
 def test_singular_false_inputs_report_numeric_incomplete_without_mathematical_no_solution(self):
  edges=[[[0,0],[0,0]]]*3;a=self.query(edges,True);b=self.query(edges,False);self.assertEqual(a['data']['anglesDeg'],[90,270]);self.assertEqual(b['data']['anglesDeg'],[None,None]);self.assertEqual(b['data']['status'],'numeric-evaluation-incomplete');self.assertTrue(b['data']['noMathematicalInfeasibilityClaim']);self.assertFalse(b['source']['symbolicExpressionRuntime']);self.assertFalse(b['source']['paperCertification'])
 def test_public_dispatch_preserves_every_frozen_query_and_source_trace(self):
  data=json.loads((Path(__file__).parents[1]/'tests/fixtures/three-cycle-checkhalfplane-20261010.json').read_text(encoding='utf8'))
  for c in data['cases']:self.assertEqual(dispatch_request(dict(c['query'],operation='three-cycle-critical')),c['response'])
 def test_rejects_foreign_or_nonboolean_options_and_invalid_edges(self):
  q=dict(family='three-cycle-critical-native',edges=E,checkHalfPlane=False)
  for bad in [dict(q,checkHalfPlane=0),dict(q,checkHalfPlane='False'),dict(q,edges=E[:2]),dict(q,edges=[[[True,0],[1,0]]]*3),dict(q,edges=[[[1001,0],[1,0]]]*3),dict(q,opts={}),dict(q,paper={})]:
   with self.subTest(bad=bad),self.assertRaises(ValueError):dispatch_request(dict(bad,operation='three-cycle-critical'))
if __name__=='__main__':unittest.main()
