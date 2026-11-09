import copy
import math
import unittest
from tessellate import generate
from tessellation_woven import validate_woven
from tessellation_woven_graph import woven_graph_data
from tessellation_line_groups import arrangement,apply_full_edge_insets,inset_faces
from tessellation_woven_inset_separation import woven_inset_separation_query

GRAPH=dict(vertices=[[.001,.001],[1,0],[0,1],[-1,0],[0,-1]],edges=[[1,2],[2,3],[3,4],[4,1],[0,1],[0,2],[0,3],[0,4]])
BASE=dict(family='woven-lines',mode='graph',graph=GRAPH,width=.08,parity=1,minPleat=1,minBorderPleat=.01,borderInset='auto',stationaryFace=0)
def full_source(graph=GRAPH):
 data=woven_graph_data(graph)
 return dict(edgeCount=len(graph['edges']),entries=[dict(edge=i,line=data['edgeLines'][i],**{'from':graph['vertices'][a].copy()},to=graph['vertices'][b].copy(),inset=[.015,.02,.025,.03][i] if i<4 else .04) for i,(a,b) in enumerate(graph['edges'])])
def fixtures():
 full=full_source()
 params=[BASE,dict(BASE,fullEdgeInsets=full),dict(BASE,fullEdgeInsets=full,width=.10),dict(BASE,fullEdgeInsets=full,borderInset='none'),dict(BASE,fullEdgeInsets=full,periodicityEnabled=True,periodicity=[]),dict(BASE,parity=-1,stationaryFace=3)]
 data=arrangement([[0,-.4,.06],[0,.4,.06],[90,-.4,.06],[90,.4,.06]],[[-1,-1],[1,-1],[1,1],[-1,1]])['mesh']
 graph=dict(vertices=copy.deepcopy(data['vertices_coords']),edges=[list(e) for e in data['edges_vertices']]);graph['vertices'][3][0]+=.001
 params.append(dict(BASE,graph=graph,width=.06))
 return [dict(params=p,response=generate(p)) for p in params]

class WovenGraphTests(unittest.TestCase):
 def test_integer_coordinates_generate_same_real_cp_ff_as_float_coordinates(self):
  graph=dict(vertices=[[0,0],[10,0],[0,10],[-10,0],[0,-10]],edges=copy.deepcopy(GRAPH['edges']))
  integer=generate(dict(BASE,graph=graph))
  floating=generate(dict(BASE,graph=dict(graph,vertices=[[float(x) for x in p] for p in graph['vertices']])))
  self.assertEqual(integer['mother']['vertices_coords'],graph['vertices'])
  self.assertEqual(integer['source']['graph'],graph)
  self.assertEqual(integer['fold'],floating['fold'])
  self.assertEqual(integer['source']['foldedForm'],floating['source']['foldedForm'])
  for key in ('geometry','local','lff'):
   self.assertEqual(integer['stats']['checks'][key]['status'],'passed')
  for face in integer['fold']['faces_vertices']:
   for a in face:
    for b in face:
     self.assertLess(abs(math.dist(integer['fold']['vertices_coords'][a],integer['fold']['vertices_coords'][b])-math.dist(integer['source']['foldedForm'][a],integer['source']['foldedForm'][b])),1e-8)

 def test_source_order_original_halfedge_face_ids_and_independent_isometry(self):
  for case in fixtures():
   p,r=case['params'],case['response'];self.assertEqual(r['mother']['vertices_coords'],p['graph']['vertices']);self.assertEqual(r['mother']['edges_vertices'],p['graph']['edges'])
   self.assertEqual(r['source']['graph'],p['graph']);self.assertNotIn('lines',r['source']);self.assertNotIn('segmentInsets',r['source'])
   self.assertEqual(r['stats']['checks']['geometry']['status'],'passed');self.assertEqual(r['stats']['checks']['local']['status'],'passed');self.assertEqual(r['stats']['checks']['lff']['status'],'passed')
   self.assertEqual(r['source']['stationaryFace'],p['stationaryFace'])
   cp,ff=r['fold']['vertices_coords'],r['source']['foldedForm']
   for f in r['fold']['faces_vertices']:
    for i,a in enumerate(f):
     for b in f[i+1:]:self.assertLess(abs(math.dist(cp[a],cp[b])-math.dist(ff[a],ff[b])),1e-7)
  d=woven_graph_data(GRAPH);self.assertEqual(d['sourceFaceCycles'],[[1,2,0],[2,3,0],[3,4,0],[4,1,0]])
  permutation=dict(GRAPH,edges=GRAPH['edges'][1:]+GRAPH['edges'][:1]);d=woven_graph_data(permutation)
  self.assertEqual(d['mesh']['edges_vertices'],permutation['edges']);self.assertEqual(d['sourceFaceCycles'],[[2,3,0],[3,4,0],[4,1,0],[0,1,2]])
  self.assertEqual(validate_woven(BASE),BASE)

 def test_full_list_original_edge_stamp_width_none_empty_period_and_insetpoly(self):
  full=full_source();a=generate(dict(BASE,fullEdgeInsets=full));b=generate(dict(BASE,fullEdgeInsets=full,width=.10));self.assertEqual(a['fold'],b['fold'])
  self.assertNotEqual(generate(BASE)['fold'],generate(dict(BASE,width=.10))['fold'])
  none=generate(dict(BASE,fullEdgeInsets=full,borderInset='none'));empty=generate(dict(BASE,fullEdgeInsets=full,periodicityEnabled=True,periodicity=[]));self.assertEqual(none['fold'],empty['fold'])
  self.assertEqual(empty['source']['requestedEdgeInsets'],[e['inset'] for e in full['entries']]);self.assertEqual(empty['source']['effectiveEdgeInsets'][:4],[0]*4)
  data=woven_graph_data(GRAPH);apply_full_edge_insets(data,full)
  edge_index={tuple(sorted(e)):i for i,e in enumerate(GRAPH['edges'])}
  for face,actual in zip(data['sourceFaceCycles'],inset_faces(data)):
   lines=[]
   for u,v in zip(face,face[1:]+face[:1]):
    x,y=GRAPH['vertices'][u],GRAPH['vertices'][v];dx,dy=y[0]-x[0],y[1]-x[1];h=full['entries'][edge_index[tuple(sorted((u,v)))]]['inset'];length=math.hypot(dx,dy)
    # Literal shifted line equations: n.x = n.p + h; solve their intersection.
    nx,ny=-dy/length,dx/length;lines.append((nx,ny,nx*x[0]+ny*x[1]+h))
   for i,p in enumerate(actual):
    a,b,c=lines[i-1];d,e,f=lines[i];det=a*e-b*d;expected=((c*e-b*f)/det,(a*f-c*d)/det)
    self.assertLess(math.dist(p,expected),1e-12)

 def test_wrong_source_and_mixed_line_parameters_reject_without_reordering(self):
  for patch in ({'lines':[[0,0,1]]},{'boundary':[[-1,-1],[1,-1],[1,1]]},{'segmentInsets':[]},{'graph':dict(GRAPH,faces=[[0,1,2]])}):
   with self.assertRaises(ValueError):validate_woven(dict(BASE,**patch))
  full=full_source()
  for mutate in (lambda x:x['entries'].pop(),lambda x:x['entries'][0].update(line=0),lambda x:x['entries'][4]['from'].__setitem__(0,.002)):
   bad=copy.deepcopy(full);mutate(bad)
   with self.assertRaises(ValueError):generate(dict(BASE,fullEdgeInsets=bad))
  reordered=dict(GRAPH,edges=GRAPH['edges'][1:]+GRAPH['edges'][:1])
  with self.assertRaisesRegex(ValueError,'几何戳'):generate(dict(BASE,graph=reordered,fullEdgeInsets=full))

 def test_unsplit_crossing_duplicates_bridges_and_unconnected_reject(self):
  cases=[dict(GRAPH,edges=GRAPH['edges']+[[1,3]]),dict(GRAPH,edges=GRAPH['edges']+[[2,1]]),dict(GRAPH,vertices=GRAPH['vertices']+[[2,2]]),dict(GRAPH,vertices=GRAPH['vertices']+[[2,2]],edges=GRAPH['edges']+[[1,5]])]
  for graph in cases:
   with self.assertRaises(ValueError):woven_graph_data(graph)
  cross=dict(vertices=[[-1,-1],[1,1],[-1,1],[1,-1]],edges=[[0,1],[2,3],[0,2],[2,1],[1,3],[3,0]])
  with self.assertRaisesRegex(ValueError,'交叉'):woven_graph_data(cross)

 def test_remaining_valid_tgraph_domain_is_reported_as_current_kernel_limit(self):
  graph=copy.deepcopy(GRAPH);graph['vertices'][0]=[.01,.01];self.assertEqual(len(woven_graph_data(graph)['sourceFaceCycles']),4)
  # The historical small negative chart failed here. Original di/db chart
  # bootstrap now produces a real uncrossed CP, without changing the mother.
  result=generate(dict(BASE,graph=graph));self.assertEqual(result['mother']['vertices_coords'],graph['vertices'])
  self.assertGreater(result['source']['topologyProbeAttempts'],1)
  self.assertEqual(result['stats']['checks']['geometry']['status'],'passed')
  cp,ff=result['fold']['vertices_coords'],result['source']['foldedForm']
  for face in result['fold']['faces_vertices']:
   for a in face:
    for b in face:self.assertLess(abs(math.dist(cp[a],cp[b])-math.dist(ff[a],ff[b])),1e-8)
  for n in (3,5,34):
   points=[[0,0]]+[[math.cos(2*math.pi*i/n),math.sin(2*math.pi*i/n)] for i in range(n)]
   graph=dict(vertices=points,edges=[[1+i,1+(i+1)%n] for i in range(n)]+[[0,1+i] for i in range(n)])
   with self.assertRaisesRegex(ValueError,'当前有限母图'):woven_graph_data(graph)
  n=10
  points=[[0,0]]+[[math.cos(2*math.pi*i/n),math.sin(2*math.pi*i/n)] for i in range(n)]
  graph=dict(vertices=points,edges=[[1+i,1+(i+1)%n] for i in range(n)]+[[0,1+i] for i in range(n)])
  self.assertEqual(len(woven_graph_data(graph)['sourceFaceCycles']),10)

 def test_graph_uniform_inset_diagnostic_reuses_frozen_faces(self):
  result=woven_inset_separation_query(dict(params=BASE,start=0,stop=.1,count=11))
  self.assertEqual(result['faceCount'],4);self.assertEqual(result['insetPointCount'],12);self.assertEqual(len(result['separations']),11);self.assertTrue(result['uniformInset'])

if __name__=='__main__':unittest.main()
