"""Literal finite numeric P43 Gore data and certified radial single-gore paper.

The four raw graphic groups are original In[3448]/[3450]/[3452]/[3454]
outputs. Building an indexed single sheet from the radial group is explicit
application behavior, not a claim that the original helper returns FOLD.
"""
import math,time
import numpy as np
from tessellation_patterns import make_fold
from tessellation_flasher_solver import _assign_fold_types
from tessellation_flasher_candidate import _verify_spatial_faces

FUNCTIONS={'SingleGoreData':'In[3448]','MultipleGoreData':'In[3450]',
           'SphereSingleGoreData':'In[3452]','SphereMultipleGoreData':'In[3454]'}

def _number(value,label,lo=-1000,hi=1000):
 if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not lo<=value<=hi:raise ValueError(label+'须为范围内有限数值。')
 return float(value)
def _integer(value,label,lo,hi):
 if type(value) is not int or not lo<=value<=hi:raise ValueError(f'{label}须为 {lo}–{hi} 的整数。')
 return value
def sphere_profile(n):
 # The original Table evaluates symbolic Sin[0]/Sin[Pi] BEFORE //N.
 return [[0.,0.] if i==0 else [0.,2.] if i==n else [1.,1.] if 2*i==n else [math.sin(math.pi*i/n),1-math.cos(math.pi*i/n)] for i in range(n+1)]
def validate_gore_query(data):
 if not isinstance(data,dict) or data.get('family')!='gore-data-native':raise ValueError('原 Gore 数据查询类型无效。')
 function=data.get('function','SphereSingleGoreData')
 if function not in FUNCTIONS:raise ValueError('Gore 原函数无效。')
 spherical=function.startswith('Sphere');allowed={'family','function','sectors','divisions' if spherical else 'points'}
 if set(data)-allowed:raise ValueError('Gore 查询含不支持的参数。')
 m=_integer(data.get('sectors',6),'瓣数 m',3,32);q=dict(family='gore-data-native',function=function,sectors=m)
 if spherical:
  n=_integer(data.get('divisions',16),'球面分段 n',2,64);q['divisions']=n;points=sphere_profile(n)
 else:
  points=data.get('points',[[0.,0.],[1.,1.],[1.,2.],[0.,3.]])
  if not isinstance(points,list) or not 2<=len(points)<=65 or any(not isinstance(p,list) or len(p)!=2 for p in points):raise ValueError('Gore pts须为 2–65 个二维剖面点。')
  points=[[_number(x,'剖面坐标') for x in p] for p in points];q['points']=points
 copies=m if 'Multiple' in function else 1
 if copies*(2*len(points)**2+12*(len(points)-1))>65536:raise ValueError('原Gore完整图形数据超过65536点预算，请减少n或m；未删除重复线。')
 return q,points

def single_gore_data(points,m):
 t=1. if m==4 else math.tan(math.pi/m)
 r=[0.]
 for a,b in zip(points,points[1:]):r.append(r[-1]+math.dist(a,b))
 widths=[t*p[0] for p in points];maximum=max(p[0] for p in points);height=[s+1-r[-1]/2 for s in r]
 target=[[p[0],w,p[1]] for p,w in zip(points,widths)]
 radial=[[s,w,0.] for s,w in zip(r,widths)]
 cylinder=[[maximum,w,z] for w,z in zip(widths,height)]
 def panels(b):return [[b[i],b[i+1],[b[i+1][0],-b[i+1][1],b[i+1][2]],[b[i][0],-b[i][1],b[i][2]]] for i in range(len(b)-1)]
 # Literal c=b[[{3,2}]]; subtract c[[1]], THEN reflect {1,-1}.
 c=[[s,widths[i]-widths[0]] for i,s in enumerate(r)]
 outline=[*c,*[[p[0],-p[1]] for p in reversed(c)]]
 return dict(targetPolygons=panels(target),radialPolygons=panels(radial),cylindricalPolygons=panels(cylinder),flatLines=[[p.copy() for p in outline] for _ in points]),r,widths

def _rotate(p,a):
 c,s=math.cos(a),math.sin(a);return [c*p[0]-s*p[1],s*p[0]+c*p[1],*p[2:]]
def query_gore_data(data):
 q,points=validate_gore_query(data);single,r,w=single_gore_data(points,q['sectors'])
 if 'Multiple' in q['function']:
  groups={key:[[[ _rotate(p,2*math.pi*j/q['sectors']) for p in primitive] for primitive in value] for j in range(q['sectors'])] for key,value in single.items()}
 else:groups=single
 return dict(schema='origamica-gore-data-v1',query=q,source=dict(function=q['function'],definitionCell=FUNCTIONS[q['function']],singleDefinitionCell='In[3448]',inputPoints=points,arcLengths=r,halfWidths=w,originalOutputOrder=['t3d','r3d','c3d','u2d'],repeatedFlatLinesPreserved=True,wolframExecuted=False),data=groups)

def validate_gore_paper(data):
 if not isinstance(data,dict) or data.get('family')!='gore-paper':raise ValueError('单瓣Gore纸张类型无效。')
 allowed={'family','profile','sectors','crossSection','divisions','typeMinimumAngleDeg','petals'}
 if set(data)-allowed:raise ValueError('Gore纸张含不支持的参数。')
 profile=data.get('profile','sphere');m=_integer(data.get('sectors',6),'瓣数 m',3,32)
 if profile not in ('sphere','points'):raise ValueError('Gore剖面方式无效。')
 q=dict(family='gore-paper',profile=profile,sectors=m,typeMinimumAngleDeg=_number(data.get('typeMinimumAngleDeg',0.5),'赋型阈值',0,90))
 if 'petals' in data:
  if data['petals']!='multiple':raise ValueError('Gore材料方式须为明确的 multiple；省略表示原单瓣。')
  q['petals']='multiple'
 if profile=='sphere':
  if 'crossSection' in data:raise ValueError('球面Gore使用n，不接冲突的手工剖面。')
  q['divisions']=_integer(data.get('divisions',16),'球面分段 n',2,64);points=sphere_profile(q['divisions'])
 else:
  if 'divisions' in data:raise ValueError('手工Gore不接球面n。')
  _,points=validate_gore_query(dict(family='gore-data-native',function='SingleGoreData',sectors=m,points=data.get('crossSection',[[0,0],[1,1],[1,2],[0,3]])))
  q['crossSection']=points
 if any(p[0]<0 for p in points) or any(p[0]==0 for p in points[1:-1]):raise ValueError('可采用单瓣纸张需要非负半径，内部半径须为正；原帮助数据查询仍保负半径原输出。')
 if any(math.dist(a,b)<=1e-8 for a,b in zip(points,points[1:])):raise ValueError('Gore纸张剖面相邻点重复或过近。')
 if q.get('petals')=='multiple':
  if m*(len(points)-1)>600:raise ValueError('多瓣Gore材料集合超过600面预算，请减少n或m。')
  query=dict(family='gore-data-native',function='SphereMultipleGoreData' if profile=='sphere' else 'MultipleGoreData',sectors=m)
  query['divisions' if profile=='sphere' else 'points']=q['divisions'] if profile=='sphere' else points
  validate_gore_query(query)
 return q

def generate_gore_paper(params,check_geometry):
 begin=time.perf_counter();params=validate_gore_paper(params)
 if params.get('petals')=='multiple':return generate_multiple_gore_paper(params,check_geometry)
 query=dict(family='gore-data-native',function='SphereSingleGoreData' if params['profile']=='sphere' else 'SingleGoreData',sectors=params['sectors'])
 query['divisions' if params['profile']=='sphere' else 'points']=params['divisions'] if params['profile']=='sphere' else params['crossSection']
 original=query_gore_data(query);points=original['source']['inputPoints'];r=original['source']['arcLengths'];w=original['source']['halfWidths']
 cp=[];ff=[];rows=[]
 for i,(p,s,width) in enumerate(zip(points,r,w)):
  plus=len(cp);cp.append([s,width]);ff.append([p[0],width,p[1]])
  if width==0:minus=plus
  else:minus=len(cp);cp.append([s,-width]);ff.append([p[0],-width,p[1]])
  rows.append([plus,minus])
 faces=[]
 for a,b in zip(rows,rows[1:]):
  face=[a[1],b[1],b[0],a[0]];face=[v for i,v in enumerate(face) if v!=face[i-1]]
  if len(face)<3:raise ValueError('Gore纸面退化，原帮助数据仍可单独查询。')
  faces.append(face)
 edges,angles,kinds=_assign_fold_types(np.asarray(cp),np.asarray(ff),faces,params['typeMinimumAngleDeg'])
 fold=make_fold(cp,edges,kinds,faces);fold['edges_foldAngle']=[None if k=='B' else math.degrees(a) for k,a in zip(kinds,angles)]
 geometry=check_geometry(fold)
 if geometry['status']!='passed':raise ValueError('原径向Gore展开未通过完整CP几何检查。')
 distance,plane=_verify_spatial_faces(cp,ff,faces)
 fold['file_creator']='折纸工作台 / Origamica SingleGoreData radial paper'
 return dict(preview=None,fold=fold,mother=None,dual=None,stats=dict(vertices=len(cp),edges=len(edges),faces=len(faces),tiles=len(faces),mountainEdges=kinds.count('M'),valleyEdges=kinds.count('V'),boundaryEdges=kinds.count('B'),unassignedEdges=kinds.count('U'),elapsedMs=round(1000*(time.perf_counter()-begin)),parameters=params,checks=dict(geometry=geometry,local=dict(status='not_applicable',kind='spatial-not-flat-foldable',maximumError=max(distance,plane)),layerOrder=dict(status='not_checked')),foldability='static-spatial-state',kind='gore-paper'),warnings=['原Gore帮助函数的径向图已建立实际单瓣纸面，静态逐面等距通过；原四组图形数据完整保留。','这是明确的径向单瓣材料；原二维u2d线和柱面图为原帮助输出，不代替径向纸面。','没有认证连续刚性路径、自碰撞或多瓣粘合。'],source=dict(name='折纸工作台',license='GPL-3.0-only',algorithm='Origamica P43 SingleGoreData radial sheet',version=1,output='spatial-3d',spatialKind='origamica-single-gore',foldedForm3D=ff,maximumFaceDistanceError=distance,maximumFacePlaneError=plane,staticGlobalIsometryChecked=True,continuousRigidPathChecked=False,selfCollisionChecked=False,originalGoreData=original,radialRowVertices=rows,derivedIndexedPaper=True))

def generate_multiple_gore_paper(params,check_geometry):
 """In[3450] rotations with disjoint indexed material identities, never glue.

 CP intersections between separate petals are placements of independent
 sheets. The ordinary full geometry check still runs on EVERY rotated petal;
 it is not replaced by a claim that the collection is a single sheet.
 """
 begin=time.perf_counter();single_params={k:v for k,v in params.items() if k!='petals'}
 single=generate_gore_paper(single_params,check_geometry);template=single['fold'];m=params['sectors']
 query=dict(family='gore-data-native',function='SphereMultipleGoreData' if params['profile']=='sphere' else 'MultipleGoreData',sectors=m)
 query['divisions' if params['profile']=='sphere' else 'points']=params['divisions'] if params['profile']=='sphere' else params['crossSection']
 original=query_gore_data(query);cp=[];ff=[];edges=[];kinds=[];angles=[];faces=[];materials=[];checks=[];distance=0.;plane=0.
 for j in range(m):
  a=2*math.pi*j/m;v0=len(cp);e0=len(edges);f0=len(faces)
  flat=[_rotate(p,a) for p in template['vertices_coords']]
  spatial=[_rotate(p,a) for p in single['source']['foldedForm3D']]
  local=check_geometry({**template,'vertices_coords':flat})
  if local['status']!='passed':raise ValueError(f'原多瓣Gore第{j+1}瓣未通过完整CP几何检查。')
  d,p=_verify_spatial_faces(flat,spatial,template['faces_vertices']);distance=max(distance,d);plane=max(plane,p)
  cp.extend(flat);ff.extend(spatial);edges.extend([[x+v0,y+v0] for x,y in template['edges_vertices']])
  kinds.extend(template['edges_assignment']);angles.extend(template['edges_foldAngle']);faces.extend([[v+v0 for v in face] for face in template['faces_vertices']])
  materials.append(dict(id=f'gore-petal-{j}',petalIndex=j,rotationRad=a,vertices=list(range(v0,len(cp))),edges=list(range(e0,len(edges))),faces=list(range(f0,len(faces))),radialRowVertices=[[v+v0 for v in row] for row in single['source']['radialRowVertices']]))
  checks.append(dict(petalIndex=j,geometry=local,maximumFaceDistanceError=d,maximumFacePlaneError=p))
 fold=make_fold(cp,edges,kinds,faces);fold['edges_foldAngle']=angles
 fold['file_creator']='折纸工作台 / Origamica MultipleGoreData independent radial materials'
 geometry=dict(status='passed',kind='independent-material-collection',materialCount=m,materials=checks,interMaterialIntersections='independent-sheets-not-welded')
 return dict(preview=None,fold=fold,mother=None,dual=None,stats=dict(vertices=len(cp),edges=len(edges),faces=len(faces),tiles=len(faces),materials=m,mountainEdges=kinds.count('M'),valleyEdges=kinds.count('V'),boundaryEdges=kinds.count('B'),unassignedEdges=kinds.count('U'),elapsedMs=round(1000*(time.perf_counter()-begin)),parameters=params,checks=dict(geometry=geometry,local=dict(status='not_applicable',kind='spatial-not-flat-foldable',maximumError=max(distance,plane)),layerOrder=dict(status='not_checked')),foldability='static-spatial-state',kind='gore-paper'),warnings=['原MultipleGoreData旋转的径向CP和静态三维已逐瓣完整几何与逐面等距核验。','每瓣为独立材料；极点或接缝坐标相同也不焊接，不表示已粘合的单张纸。','原四组数据及重复u2d线完整保留；没有认证连续刚性路径、自碰撞、层序或多瓣粘合。'],source=dict(name='折纸工作台',license='GPL-3.0-only',algorithm='Origamica P43 MultipleGoreData independent radial materials',version=1,output='spatial-3d',spatialKind='origamica-multiple-gore',foldedForm3D=ff,maximumFaceDistanceError=distance,maximumFacePlaneError=plane,staticGlobalIsometryChecked=True,continuousRigidPathChecked=False,selfCollisionChecked=False,layerOrderChecked=False,originalGoreData=original,paperParameters=params,derivedIndexedPaper=True,independentMaterials=materials,standardSingleSheetFold=False,coordinateWeldingApplied=False,gluingApplied=False))
