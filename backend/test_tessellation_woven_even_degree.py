"""In[3428] higher even mother degree: source formula, geometry and budget."""
import copy,json,math,re,unittest
from collections import Counter,defaultdict
from functools import lru_cache
from pathlib import Path
from unittest.mock import patch
from tessellate import generate
from tessellation_woven_graph import woven_graph_data
from tessellation_woven_graph_source import in3437_source

FIXTURE=Path(__file__).resolve().parents[1]/'tests/fixtures/woven-even-degree-20261001.json'
SAVED=json.loads(FIXTURE.read_text(encoding='utf-8'))

def fan(n,ratio=1):
 return dict(vertices=[[0,0]]+[[math.cos(2*math.pi*i/n),ratio*math.sin(2*math.pi*i/n)] for i in range(n)],edges=[[i+1,(i+1)%n+1] for i in range(n)]+[[0,i+1] for i in range(n)])

@lru_cache(None)
def fixtures():return [dict(name=c['name'],params=c['params'],response=generate(c['params'])) for c in SAVED['cases']]

def literal_ff(params,source):
 """Independent scalar line intersections + literal In[3428] makeverts."""
 graph=params['graph'];points=graph['vertices'];lookup={tuple(sorted(e)):i for i,e in enumerate(graph['edges'])}
 owners=source['edgeLines'];hs=source.get('effectiveEdgeInsets',[source['borderInset'] if o<0 else w/2 for o,w in zip(owners,source['edgeWidths'])])
 factors=iter(source['pleatFactors']);result=[]
 for f,face in enumerate(source['sourceFaceCycles']):
  lines=[]
  for a,b in zip(face,face[1:]+face[:1]):
   p,q=points[a],points[b];length=math.dist(p,q);nx,ny=-(q[1]-p[1])/length,(q[0]-p[0])/length
   lines.append((nx,ny,nx*p[0]+ny*p[1]+hs[lookup[tuple(sorted((a,b)))]]))
  for k,v in enumerate(face):
   prev,nex=face[k-1],face[(k+1)%len(face)];p=points[v];a,b,c=lines[k-1];d,e,g=lines[k];det=a*e-b*d;q=[(c*e-b*g)/det,(a*g-c*d)/det]
   ep=[(p[j]-points[prev][j])/math.dist(p,points[prev]) for j in (0,1)];en=[(points[nex][j]-p[j])/math.dist(points[nex],p) for j in (0,1)]
   ie,oe=lookup[tuple(sorted((prev,v)))],lookup[tuple(sorted((v,nex)))];bp,bo=owners[ie]<0,owners[oe]<0;s=abs(ep[0]*en[1]-ep[1]*en[0])
   if bp and bo:result.append(q);continue
   # Boundary cases are the literal original branches, not a rotated fan.
   if bp:direction=[x*hs[oe]/s for x in ep]
   elif bo:direction=[-x*hs[ie]/s for x in en]
   elif params['parity']*(-1)**f>0:direction=[-x*hs[ie]/s for x in en]
   else:direction=[x*hs[oe]/s for x in ep]
   factor=next(factors);result.append([q[j]+factor*direction[j] for j in (0,1)])
   if bp or bo:result.append(q)
 return result

class WovenEvenDegreeTests(unittest.TestCase):
 def test_real_six_and_eight_degree_keep_source_order_mv_and_cp_four_degree(self):
  for c in fixtures():
   with self.subTest(c=c['name']):
    p,r=c['params'],c['response'];n=len(p['graph']['vertices'])-1
    self.assertEqual(r['mother']['vertices_coords'],p['graph']['vertices']);self.assertEqual(r['mother']['edges_vertices'],p['graph']['edges']);self.assertEqual(r['source']['graph'],p['graph'])
    self.assertEqual(r['source']['sourceFaceCycles'],woven_graph_data(p['graph'])['sourceFaceCycles'])
    self.assertEqual((r['stats']['vertices'],r['stats']['edges'],r['stats']['faces']),(5*n,8*n,3*n+1))
    self.assertEqual(Counter(r['fold']['edges_assignment']),dict(B=4*n,M=5*n//2,V=3*n//2))
    incidence=defaultdict(list);border=set()
    for (a,b),kind in zip(r['fold']['edges_vertices'],r['fold']['edges_assignment']):
     incidence[a].append(kind);incidence[b].append(kind)
     if kind=='B':border.update((a,b))
    inside=[v for v in incidence if v not in border];self.assertEqual(len(inside),n)
    for v in inside:self.assertEqual(Counter(incidence[v]),dict(M=3,V=1))
    for check in ('geometry','local','lff'):self.assertEqual(r['stats']['checks'][check]['status'],'passed')
    self.assertNotIn('lines',r['source']);self.assertNotIn('segmentInsets',r['source'])
    self.assertEqual(r['source']['stationaryFace'],p['stationaryFace']);self.assertEqual(r['source']['topologyProbeBudget'],170)
    self.assertLessEqual(r['source']['topologyProbeAttempts'],170);self.assertLessEqual(max(r['source']['topologyProbe']),50)

 def test_independent_original_inset_intersections_displacements_and_face_isometry(self):
  for c in fixtures():
   with self.subTest(c=c['name']):
    p,r=c['params'],c['response'];actual=r['source']['foldedForm'];literal=literal_ff(p,r['source'])
    self.assertEqual(len(actual),len(literal));self.assertLess(max(math.dist(a,b) for a,b in zip(actual,literal)),1e-12)
    cp=r['fold']['vertices_coords']
    for face in r['fold']['faces_vertices']:
     for i,a in enumerate(face):
      for b in face[i+1:]:self.assertLess(abs(math.dist(cp[a],cp[b])-math.dist(actual[a],actual[b])),1e-8)
    self.assertLess(r['source']['closureError'],1e-8)

 def test_full_absolute_h_none_empty_period_and_fixed_face_preserve_source(self):
  cases={c['name']:c for c in fixtures()}
  self.assertEqual(cases['six-full']['response']['fold'],cases['six-full-width']['response']['fold'])
  self.assertEqual(cases['six-none']['response']['fold'],cases['six-empty-period']['response']['fold'])
  self.assertNotEqual(cases['six-regular']['response']['fold'],cases['six-wide']['response']['fold'])
  self.assertEqual(cases['six-fixed-F6']['response']['source']['stationaryFace'],5)
  self.assertEqual(cases['six-empty-period']['response']['source']['borderInset'],0)
  bad=copy.deepcopy(cases['six-full']['params']);bad['fullEdgeInsets']['entries'][0]['from'][0]+=.001
  with self.assertRaisesRegex(ValueError,'几何戳'):generate(bad)
  bad=copy.deepcopy(cases['six-full']['params']);bad['fullEdgeInsets']['entries'][6]['line']=-1
  with self.assertRaisesRegex(ValueError,'几何戳'):generate(bad)
  bad=dict(cases['six-regular']['params'],graphSource=in3437_source())
  with self.assertRaisesRegex(ValueError,'来源|重算|点|边'):generate(bad)

 def test_old_four_degree_and_original_in3437_outputs_are_unchanged(self):
  for c in SAVED['baseline']:
   with self.subTest(c=c['name']):
    r=generate(c['params']);r=json.loads(json.dumps(r))
    for key in ('fold','mother','source'):self.assertEqual(r[key],c['response'][key])
    self.assertNotIn('topologyProbeBudget',r['source'])

 def test_actual_crossed_root_and_exhausted_topology_budget_keep_phase_diagnostics(self):
  regular=copy.deepcopy(SAVED['cases'][0]['params']);regular['graph']=fan(8)
  with self.assertRaisesRegex(ValueError,r'CP 几何校验阶段失败.*残差 [0-9.e+-]+.*170 轮.*不构成数学无解证明'):generate(regular)
  reverse=copy.deepcopy(next(c['params'] for c in SAVED['cases'] if c['name']=='eight-ellipse'));reverse['parity']=-1
  with self.assertRaisesRegex(ValueError,r'拓扑／内缩阶段失败.*无方程残差.*170 轮.*不构成数学无解证明'):generate(reverse)
  # A valid six-degree example fails if its necessary bootstrap candidates
  # are withheld: algorithm budget must never be reported as mathematical ban.
  with patch('tessellation_woven._EVEN_PROBE_LEVELS',(.1,)):
   with self.assertRaisesRegex(ValueError,r'拓扑／内缩阶段失败.*2 轮.*不构成数学无解证明'):generate(SAVED['cases'][0]['params'])

 def test_odd_degree_higher_even_degree_and_original_geometry_gates_still_reject(self):
  for n in (3,5,9,11,34,36):
   with self.subTest(n=n):
    with self.assertRaisesRegex(ValueError,'当前有限母图'):woven_graph_data(fan(n))
  # Concave outer boundaries with convex cells are a source-supported input.
  # This distorted fan now reaches topology bootstrap rather than a convex
  # boundary gate; it must keep its original points and face order.
  bad=fan(6);bad['vertices'][3]=[-.15,.3];parsed=woven_graph_data(bad)
  self.assertTrue(parsed['concaveBoundary']);self.assertEqual(parsed['mesh']['vertices_coords'],bad['vertices'])
  p=copy.deepcopy(SAVED['cases'][0]['params']);p['width']=2
  with self.assertRaisesRegex(ValueError,'拓扑／内缩阶段失败.*内缩分区已消失.*无方程残差'):generate(p)

if __name__=='__main__':unittest.main()
