"""Literal In[3437] source and original tolerant preprocessing."""
import copy,math
import numpy as np
INPUT={'vertices': [[1.2423, 1.1112], [1.2423, 353.20419999999996], [77.6633, 1.1112], [77.6633, 353.20419999999996], [144.0843, 1.1112], [144.0843, 353.20419999999996], [210.50530000000003, 1.1112], [210.50530000000003, 353.20419999999996], [276.92530000000005, 1.1112], [276.92530000000005, 353.20419999999996], [353.34630000000004, 1.1112], [353.34630000000004, 353.20419999999996], [1.2424000000000335, 77.5322], [353.34540000000004, 77.5222], [1.2415000000000336, 143.9532], [353.34450000000004, 143.94320000000002], [1.2403000000000335, 210.37420000000003], [353.34330000000006, 210.36420000000004], [1.2394000000000336, 276.7952], [353.34240000000005, 276.78520000000003], [39.001500000000036, 353.21520000000004], [353.34650000000005, 32.00220000000007]], 'edges': [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [0, 10], [12, 13], [14, 15], [16, 17], [18, 19], [1, 11], [20, 21]]}
def in3437_source():
 return dict(kind='origamica-in3437',inputGraph=copy.deepcopy(INPUT),intersectionTolerance=2,samePtTolerance=2,invertFoldType=True)
def read_graph_source(value):
 if isinstance(value,dict) and value.get('kind')=='origamica-intersectify-native':
  return read_native_intersection_source(value)
 if isinstance(value,dict):
  g=value.get('inputGraph')
  if not isinstance(g,dict) or set(g)!={'vertices','edges'} or not isinstance(g.get('vertices'),list) or not isinstance(g.get('edges'),list) or any(not isinstance(p,list) or len(p)!=2 or any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) for x in p) for p in g['vertices']) or any(not isinstance(e,list) or len(e)!=2 or any(isinstance(v,bool) or not isinstance(v,int) for v in e) for e in g['edges']):
   raise ValueError('In[3437] 原输入必须为完整有限点列和整数边索引。')
 if not isinstance(value,dict) or set(value)!={'kind','inputGraph','intersectionTolerance','samePtTolerance','invertFoldType'} or value['kind']!='origamica-in3437' or isinstance(value['intersectionTolerance'],bool) or value['intersectionTolerance']!=2 or isinstance(value['samePtTolerance'],bool) or value['samePtTolerance']!=2 or value['invertFoldType'] is not True or value['inputGraph']!=INPUT:
  raise ValueError('In[3437] 来源须完整保留原22点/13边、两种容差2及折痕倒置；未知或修改来源不受支持。')
 return copy.deepcopy(value)
def medial(p1,p2,q1,q2):
 # In[179] SegmentSegmentMedialInfo: line-line candidate, four point-point
 # and four point-line candidates. Keep parameters in [0,1], sort half-distance.
 p1,p2,q1,q2=map(np.asarray,(p1,p2,q1,q2));dp=p2-p1;dq=q2-q1;aa=float(dp@dp);bb=float(dp@dq);cc=float(dq@dq);det=bb*bb-aa*cc;candidate=[]
 def add(tp,tq):
  if 0<=tp<=1 and 0<=tq<=1:
   rp=p1+tp*dp;rq=q1+tq*dq;candidate.append(((rp+rq)/2,float(np.linalg.norm(rp-rq))/2,(float(tp),float(tq))))
 if abs(det)<=1e-10:
  low,high=sorted((float((q1-p1)@dp/aa),float((q2-p1)@dp/aa)))
  if low<=1 and high>=0:
   tp=(max(0,low)+min(1,high))/2;rp=p1+tp*dp;add(tp,float((rp-q1)@dq/cc));return candidate[0]
 else:
  dqp=q1-p1;ap=float(dp@dqp);cq=float(dq@dqp);add((bb*cq-ap*cc)/det,(aa*cq-bb*ap)/det)
 for tp,tq in ((0,0),(0,1),(1,0),(1,1)):add(tp,tq)
 add(0,float((p1-q1)@dq/cc));add(1,float((p2-q1)@dq/cc));add(float((q1-p1)@dp/aa),0);add(float((q2-p1)@dp/aa),1)
 return min(candidate,key=lambda r:r[1])

def intersectify(graph,itol=2.,ptol=2.,*,native=False):
 # In[1117] -> In[1122] -> In[1094]. First encountered representative point;
 # no averaging during Indexify and no preserved original point ordering.
 points,edges=graph['vertices'],graph['edges'];epts=[[(points[a],0.),(points[b],1.)] for a,b in edges];pairs=[]
 for i,(a,b) in enumerate(edges):
  for j,(c,d) in enumerate(edges[i+1:],i+1):
   if native and any(max(points[a][k],points[b][k])<min(points[c][k],points[d][k])-itol or max(points[c][k],points[d][k])<min(points[a][k],points[b][k])-itol for k in (0,1)):
    continue # In[1117] first applies BoundingBoxesIntersectQ, with opts.
   p,dist,(t,u)=medial(points[a],points[b],points[c],points[d])
   accepted=(0. if abs(dist)<1e-10 else dist)<=itol/2 if native else dist<=itol/2+1e-10
   if accepted:
    pairs.append(dict(edges=[i,j],halfDistance=dist,parameters=[t,u],point=p.tolist()))
    if min(abs(t),abs(t-1))>1e-10:epts[i].append((p.tolist(),t))
    if min(abs(u),abs(u-1))>1e-10:epts[j].append((p.tolist(),u))
 embedded=[];owners=[]
 for i,items in enumerate(epts):
  ordered=[p for p,t in sorted(items,key=lambda v:v[1])]
  for a,b in zip(ordered,ordered[1:]):embedded.append([a,b]);owners.append(i)
 unique=[];indexed=[];actualOwners=[];welds=[]
 for edge,owner in zip(embedded,owners):
  ids=[]
  for p in edge:
   matches=[i for i,q in enumerate(unique) if sum((x-y)**2 for x,y in zip(p,q))<=ptol**2] if native else [i for i,q in enumerate(unique) if math.dist(p,q)<=ptol]
   if matches:
    i=matches[0]
    if math.dist(p,unique[i])>1e-12:welds.append(dict(point=p,representative=unique[i],distance=math.dist(p,unique[i]),id=i))
   else:i=len(unique);unique.append(list(p))
   ids.append(i)
  if ids[0]!=ids[1]:indexed.append(ids);actualOwners.append(owner)
 return dict(vertices=unique,edges=indexed),dict(pairwiseMedials=pairs,originalEdgeForSegment=actualOwners,welds=welds,indexification=f'In[1094] first encountered representative, Euclidean SamePtTolerance={ptol:g}' if native else 'In[1094] first encountered representative, Euclidean SamePtTolerance=2')


def recompute_graph_source(value):
 source=read_graph_source(value)
 graph,info=intersectify(source['inputGraph'],source['intersectionTolerance'],source['samePtTolerance'],native=source['kind']=='origamica-intersectify-native')
 if 'motherSelection' in source:
  selection=source['motherSelection']
  if not same_geometry(graph,selection['geometry']):raise ValueError('母图区域声明的点边戳与源线网重算不一致；请重新拆分并选择区域。')
  graph.update(copy.deepcopy(region_roles(selection)))
 return graph,info

def region_roles(value):
 return {k:value[k] for k in ('holeFaces','ringHoles','nestedSheets') if k in value}

def same_geometry(expected,graph):
 if not isinstance(graph,dict) or not {'vertices','edges'}<=set(graph) or graph['edges']!=expected['edges'] or not isinstance(graph['vertices'],list) or len(graph['vertices'])!=len(expected['vertices']):return False
 points=expected['vertices'];span=max(max(p[k] for p in points)-min(p[k] for p in points) for k in (0,1));tol=1e-9*span+16*math.ulp(max(abs(x) for p in points for x in p))
 try:return all(isinstance(q,list) and len(q)==2 and all(not isinstance(x,bool) and isinstance(x,(int,float)) and math.isfinite(x) for x in q) and math.dist(p,q)<=tol for p,q in zip(points,graph['vertices']))
 except (TypeError,ValueError):return False

def match_graph_source(source,graph):
 expected,info=recompute_graph_source(source)
 if not isinstance(graph,dict) or set(graph)!=set(expected) or not same_geometry(expected,graph):raise ValueError('Intersectify 实际母图端点、点/边数或源索引与重算来源不一致。')
 if region_roles(graph)!=region_roles(expected):raise ValueError('Intersectify 实际母图区域声明与来源不一致。')
 return info


def read_native_intersection_source(value):
 """Explicit In[1117]/In[1122] input; it is never a provenance label."""
 required={'kind','inputGraph','intersectionTolerance','samePtTolerance','invertFoldType'}
 if not isinstance(value,dict) or not required<=set(value) or set(value)-required-{'motherSelection'} or value.get('kind')!='origamica-intersectify-native':
  raise ValueError('通用 Intersectify 来源须保留原输入、两种容差和折痕倒置设置。')
 graph=value['inputGraph']
 if not isinstance(graph,dict) or set(graph)!={'vertices','edges'}:raise ValueError('Intersectify 原图需要 vertices 与 edges。')
 points,edges=graph['vertices'],graph['edges']
 if not isinstance(points,list) or not 2<=len(points)<=512 or any(not isinstance(p,list) or len(p)!=2 or any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) or abs(x)>1000 for x in p) for p in points):
  raise ValueError('Intersectify 需要 2–512 个有限二维点，范围 −1000…1000。')
 if not isinstance(edges,list) or not 1<=len(edges)<=128 or any(not isinstance(e,list) or len(e)!=2 or e[0]==e[1] or any(isinstance(v,bool) or not isinstance(v,int) or not 0<=v<len(points) for v in e) for e in edges):
  raise ValueError('Intersectify 需要 1–128 条有效原边。')
 if any(points[a]==points[b] for a,b in edges):raise ValueError('Intersectify 原输入有零长线段。')
 for key in ('intersectionTolerance','samePtTolerance'):
  v=value[key]
  if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not 0<=v<=100:raise ValueError('Intersectify 两种容差须在 0…100 内。')
 if not isinstance(value['invertFoldType'],bool):raise ValueError('Intersectify 折痕倒置须为布尔值。')
 if 'motherSelection' in value:
  s=value['motherSelection']
  if not isinstance(s,dict) or 'geometry' not in s or len(s)<2 or set(s)-{'geometry','holeFaces','ringHoles','nestedSheets'}:raise ValueError('母图区域选择需要点边戳和明确区域声明。')
  g=s['geometry']
  if not isinstance(g,dict) or set(g)!={'vertices','edges'} or not isinstance(g['vertices'],list) or not 3<=len(g['vertices'])<=512 or any(not isinstance(p,list) or len(p)!=2 or any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) or abs(x)>1000 for x in p) for p in g['vertices']) or not isinstance(g['edges'],list) or not 3<=len(g['edges'])<=1024 or any(not isinstance(e,list) or len(e)!=2 or e[0]==e[1] or any(isinstance(v,bool) or not isinstance(v,int) or not 0<=v<len(g['vertices']) for v in e) for e in g['edges']) or len({tuple(sorted(e)) for e in g['edges']})!=len(g['edges']):raise ValueError('母图区域点边戳格式无效。')
  if 'nestedSheets' in s and s['nestedSheets'] is not True:raise ValueError('独立纸片声明须明确为 true。')
  if 'holeFaces' in s:
   h=s['holeFaces']
   if not isinstance(h,list) or not 1<=len(h)<=32 or any(isinstance(f,bool) or not isinstance(f,int) or not 0<=f<256 for f in h) or len(set(h))!=len(h):raise ValueError('母图孔洞原面编号无效。')
  if 'ringHoles' in s:
   h=s['ringHoles']
   if not isinstance(h,list) or not 1<=len(h)<=32 or any(not isinstance(b,dict) or set(b)!={'face','component'} or any(isinstance(b[k],bool) or not isinstance(b[k],int) or not 0<=b[k]<limit for k,limit in [('face',256),('component',512)]) for b in h) or len({b['component'] for b in h})!=len(h):raise ValueError('母图环孔关联无效。')
 return copy.deepcopy(value)


def woven_graph_preprocess_query(value):
 """Expose the original split/indexify stage separately from CP solving."""
 if not isinstance(value,dict) or set(value)-{'family','inputGraph','intersectionTolerance','samePtTolerance','invertFoldType'} or value.get('family')!='woven-graph-preprocess-native':
  raise ValueError('通用编织预处理请求格式无效。')
 source=read_native_intersection_source(dict(kind='origamica-intersectify-native',inputGraph=value.get('inputGraph'),
  intersectionTolerance=value.get('intersectionTolerance',0.),samePtTolerance=value.get('samePtTolerance',1e-6),invertFoldType=value.get('invertFoldType',False)))
 graph,info=recompute_graph_source(source)
 from tessellation_woven_graph import woven_graph_data
 try:
  data=woven_graph_data(graph,.01,source)
  ready=dict(status='accepted',sourceFaceCycles=data['sourceFaceCycles'],edgeLines=data['edgeLines'])
 except ValueError as exc:ready=dict(status='not_ready',reason=str(exc))
 return dict(family='origamica-native-woven-intersectify',source=source,graph=graph,**info,
  diagnostics=dict(inputVertices=len(source['inputGraph']['vertices']),inputEdges=len(source['inputGraph']['edges']),
                   outputVertices=len(graph['vertices']),outputEdges=len(graph['edges']),wovenInput=ready),
  original=dict(functions=['EmbeddedIntersectify','Intersectify','Indexify'],cells=[1117,1122,1094],
                boundingBoxTolerance=source['intersectionTolerance'],chopTolerance=1e-10,
                samePointSquaredDistance=True,firstEncounteredRepresentative=True,averagesRepresentatives=False),
  certificates=dict(creasePatternConstructed=False,flatFoldComputed=False,globalLayerOrder=False,adoptAsFold=False))
