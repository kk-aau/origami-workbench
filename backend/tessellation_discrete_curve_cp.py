"""Bounded finite N-point CP bridge; original numeric kernels unchanged."""
import math
import time
from collections import Counter

from tessellation_curved_discretization_generic import (query_discretization_generic,
                                                       validate_discretization_generic_query)
from tessellation_patterns import make_fold

FAMILY='discrete-curve-cp'
MIN_POINTS=3
MAX_POINTS=16
INTERNAL=((0,1),(1,2),(1,4),(1,7))
FACES=((0,3,4,1),(1,4,5,2),(0,1,7,6),(1,2,8,7))

def internal_edges(n):
    if n==3:return INTERNAL
    return tuple((i,i+1) for i in range(n-1))+tuple((i,n+i) for i in range(1,n-1))+tuple((i,2*n+i) for i in range(1,n-1))

def strip_faces(n):
    if n==3:return FACES
    return tuple((i,n+i,n+i+1,i+1) for i in range(n-1))+tuple((i,i+1,2*n+i+1,2*n+i) for i in range(n-1))

def source_preset(n=3):
    if isinstance(n,bool) or not isinstance(n,int) or not MIN_POINTS<=n<=MAX_POINTS:
        raise ValueError('有限示例点数须为 3…16 整数。')
    ray=lambda a:[math.cos(math.radians(a)),math.sin(math.radians(a))]
    return {'family':'discretization-generic-native','mode':'multipliers',
            'foldPoints':[[(i-1)*math.cos(math.pi/9),math.sin(math.pi/9) if i%2==0 else 0.] for i in range(n)],
            'leftRulings':[ray(100) for _ in range(n)],'rightRulings':[ray(260) for _ in range(n)]}

def validate_discrete_curve_cp(data):
    if not isinstance(data,dict) or data.get('family')!=FAMILY:
        raise ValueError('原离散纸带构造类型无效。')
    if set(data)-{'family','source','leftWidth','rightWidth','assignments'}:
        raise ValueError('原离散纸带含不支持的参数。')
    source=validate_discretization_generic_query(data.get('source',source_preset()))
    if source['mode']!='multipliers' or not MIN_POINTS<=len(source['foldPoints'])<=MAX_POINTS:
        raise ValueError('当前仅接 3…16 点原折角倍率输入；不把一般规则或任意解析曲线自动变成纸面。')
    n=len(source['foldPoints'])
    for key in ('foldPoints','leftRulings','rightRulings'):
        for vector in source[key]:
            if any(abs(value)>1000 for value in vector):
                raise ValueError('有限纸带原坐标和母线分量须在 ±1000 内。')
            if key!='foldPoints' and not 1e-6<=math.hypot(*vector)<=1000:
                raise ValueError('有限纸带母线长度须在 10⁻⁶…1000 内；不补造方向。')
    values={'family':FAMILY,'source':source}
    for key in ('leftWidth','rightWidth'):
        value=data.get(key,.4)
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not 1e-4<=value<=1000:
            raise ValueError('原母线系数须在 10⁻⁴…1000 内。')
        values[key]=float(value)
    assignments=data.get('assignments',['U']*(3*n-5))
    if not isinstance(assignments,list) or len(assignments)!=3*n-5 or any(not isinstance(a,str) or a not in ('U','M','V') for a in assignments):
        raise ValueError('内部边须依次提供全部折线段、内部左母线、内部右母线的 U/M/V 赋型；项数须为 3N−5。')
    values['assignments']=assignments.copy()
    return values

def _area(points):
    return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points,points[1:]+points[:1]))/2

def _strict_embedding(coords,edges,faces,incidence,span):
    """Finite disk embedding: convex faces, unique vertices and honest shared rays.

    Nonincident inclusive crossings are checked by the unchanged shared checker.
    Combined with a single simple boundary and consistent convex oriented cells,
    the connected disk has degree one: no overlapping or invented material.
    """
    epsilon=max(span*1e-8,math.ulp(max(abs(x) for p in coords for x in p))*4)
    area_epsilon=epsilon*span
    cross=lambda a,b,c:(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    if any(math.dist(a,b)<=epsilon for i,a in enumerate(coords) for b in coords[i+1:]):
        raise ValueError('不同原索引坍缩为同一点；不静默合并材料身份。')
    for face in faces:
        if any(cross(coords[face[i]],coords[face[(i+1)%4]],coords[face[(i+2)%4]])<=1e-10*span*span for i in range(4)):
            raise ValueError('有限 N 点纸带当前仅采用严格凸且同向的四边纸面。')
    for i,(a,b) in enumerate(edges):
        for c,d in edges[i+1:]:
            shared=set((a,b)).intersection((c,d))
            if not shared:continue
            v=next(iter(shared));x=b if a==v else a;y=d if c==v else c
            dot=sum((coords[x][k]-coords[v][k])*(coords[y][k]-coords[v][k]) for k in (0,1))
            if abs(cross(coords[v],coords[x],coords[y]))<=area_epsilon and dot>epsilon*epsilon:
                raise ValueError('共享原点的边同向重叠；不是无交叠纸域。')
    boundary=[e for e,count in incidence.items() if count==1]
    adjacency={}
    for a,b in boundary:adjacency.setdefault(a,[]).append(b);adjacency.setdefault(b,[]).append(a)
    if any(len(neighbors)!=2 for neighbors in adjacency.values()):
        raise ValueError('纸边并非单一闭合边界。')
    start=min(adjacency);walk=[];previous=None;current=start
    while current not in walk:
        walk.append(current);following=next(v for v in adjacency[current] if v!=previous)
        previous,current=current,following
    if current!=start or len(walk)!=len(boundary):
        raise ValueError('纸边分成多环或坍缩；不跨空白补线。')

def generate_discrete_curve_cp(params,check_geometry,check_local):
    started=time.perf_counter()
    params=validate_discrete_curve_cp(params)
    native=query_discretization_generic(params['source'])
    if not native['sample']['allMultipliersFinite']:
        raise ValueError('原倍率有零分母或非有限值，当前有限纸带不采用未定义原分支。')
    source=params['source'];points=[point.copy() for point in source['foldPoints']]
    n=len(points);references=strip_faces(n);internal=internal_edges(n)
    coords=points+[[p[k]+params['leftWidth']*d[k] for k in (0,1)]
                   for p,d in zip(points,source['leftRulings'])]+[
                 [p[k]+params['rightWidth']*d[k] for k in (0,1)]
                   for p,d in zip(points,source['rightRulings'])]
    span=max(max(p[k] for p in coords)-min(p[k] for p in coords) for k in (0,1))
    areas=[_area([coords[i] for i in face]) for face in references]
    if span<=1e-8 or any(abs(a)<=1e-10*span*span for a in areas) or any(a*areas[0]<=0 for a in areas):
        raise ValueError('纸带面退化或左右条带翻转；未跨空白补面。')
    faces=[list(face) if area>0 else list(reversed(face)) for face,area in zip(references,areas)]
    incidence=Counter(tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1]))
    edges=sorted(incidence)
    if len(edges)!=5*n-3 or sum(count==1 for count in incidence.values())!=2*n+2 or any(count not in (1,2) for count in incidence.values()):
        raise ValueError('有限纸带不是预期的闭合 2(N−1) 面拓扑。')
    kinds=['B' if incidence[edge]==1 else params['assignments'][internal.index(edge)] for edge in edges]
    if n>3:_strict_embedding(coords,edges,faces,incidence,span)
    fold=make_fold(coords,edges,kinds,faces)
    edge_index={edge:i for i,edge in enumerate(edges)}
    fold['faces_edges']=[[edge_index[tuple(sorted((a,b)))] for a,b in zip(face,face[1:]+face[:1])] for face in faces]
    fold['edges_faces']=[[f for f,edge_ids in enumerate(fold['faces_edges']) if e in edge_ids] for e in range(len(edges))]
    fold['faces_faces']=[[next((neighbor for neighbor in fold['edges_faces'][e] if neighbor!=f),None)
                         for e in edge_ids] for f,edge_ids in enumerate(fold['faces_edges'])]
    geometry=check_geometry(fold)
    if geometry['status']!='passed':
        raise ValueError('原离散纸带含交叉、重叠或退化边，拒绝作为 CP。')
    local=check_local(fold)
    from tessellation_lff import analyze_lff_graph
    lff=analyze_lff_graph(fold,geometry_status=geometry['status'])
    fold['file_creator']='折纸工作台 / Origamica finite discrete curve CP bridge'
    fold['frame_description']='原有限三点与母线的闭合二维纸带；边界宽度为本地输入，未指定山谷时仅CP。' if n==3 else f'原有限 {n} 点与母线的闭合二维纸带；未指定山谷时仅CP。'
    return {'preview':None,'fold':fold,'mother':None,'dual':None,
            'stats':{'vertices':3*n,'edges':5*n-3,'faces':2*n-2,'tiles':2*n-2,
                     'mountainEdges':kinds.count('M'),'valleyEdges':kinds.count('V'),
                     'boundaryEdges':kinds.count('B'),'unassignedEdges':kinds.count('U'),
                     'elapsedMs':round((time.perf_counter()-started)*1000),'parameters':params,
                     'checks':{'geometry':geometry,'local':local,'lff':lff,'layerOrder':{'status':'not_checked'}},
                     'foldability':'candidate','kind':FAMILY},
            'warnings':['原函数提供有序点、母线与倍率；纸边宽度、封边和四面装配是明确的本地构造。' if n==3 else f'原函数提供有序点、母线与倍率；纸边系数、封边和 {2*n-2} 面装配是明确的本地构造。',
                        '原倍率不唯一指定山谷；U 保持未指定，M/V 仅来自显式用户输入。',
                        '普通采用仍须局部及整片层序通过；仅CP不会载入折后位置或层序证书。',
                        '这是有限三点折线纸带，不是连续曲线、原保存数值 Out 或三维/运动/碰撞认证。' if n==3 else f'这是有限 {n} 点折线纸带，不是连续曲线、原保存数值 Out 或三维/运动/碰撞认证。'],
            'source':{'name':'折纸工作台','license':'GPL-3.0-only','algorithm':'Origamica discrete curve CP bridge',
                      'version':1,'output':'crease-pattern','parameters':params,'nativeDiscretization':native,
                      'assembly':'three-point-two-sided-strip-v1' if n==3 else 'finite-n-point-two-sided-strip-v1','localBoundaryWidths':True,
                      'internalEdgeOrder':[list(edge) for edge in internal],
                      'assignmentOrigin':'unspecified' if all(a=='U' for a in params['assignments']) else 'explicit-user',
                      'staticGlobalIsometryChecked':False,'continuousRigidPathChecked':False,
                      'selfCollisionChecked':False,'wolframExecuted':False,'continuousCurveEquivalent':False}}
