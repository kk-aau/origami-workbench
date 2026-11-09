"""Frozen finite straight-edge TGraph input, preserving source indices."""
import math
from collections import Counter,defaultdict
from tessellation_patterns import make_fold


def woven_graph_data(value,inset=.04,graph_source=None):
    if not isinstance(value,dict) or set(value)-{'vertices','edges','holeFaces','nestedSheets','ringHoles','curveHoles'} or not {'vertices','edges'}<=set(value):
        raise ValueError('有限母图需要 vertices 和 edges，不能附带自动重排的面列表。')
    if 'nestedSheets' in value and value['nestedSheets'] is not True:
        raise ValueError('嵌套独立纸片必须明确设置 nestedSheets=true；未猜测孔洞。')
    points,edges=value['vertices'],value['edges']
    if not isinstance(points,list) or not 3<=len(points)<=512 or any(not isinstance(p,list) or len(p)!=2 or any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) or abs(x)>1000 for x in p) for p in points):
        raise ValueError('有限母图需要 3–512 个有限二维点，坐标范围 −1000…1000。')
    if not isinstance(edges,list) or not 3<=len(edges)<=1024 or any(not isinstance(e,list) or len(e)!=2 or e[0]==e[1] or any(isinstance(v,bool) or not isinstance(v,int) or not 0<=v<len(points) for v in e) for e in edges):
        raise ValueError('有限母图需要 3–1024 条有效边，以原点编号引用。')
    source_info=None
    if graph_source is not None:
        from tessellation_woven_graph_source import match_graph_source
        source_info=match_graph_source(graph_source,value)
    span=max(max(p[k] for p in points)-min(p[k] for p in points) for k in (0,1))
    tol=1e-9*span+16*math.ulp(max(abs(x) for p in points for x in p))
    if any(math.dist(p,q)<=tol for i,p in enumerate(points) for q in points[i+1:]):raise ValueError('有限母图顶点重合；不能隐式焊接或重排源索引。')
    if len({tuple(sorted(e)) for e in edges})!=len(edges):raise ValueError('有限母图存在重复边。')
    def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    def on(p,a,b):return abs(cross(a,b,p))<=tol*math.dist(a,b) and min(a[0],b[0])-tol<=p[0]<=max(a[0],b[0])+tol and min(a[1],b[1])-tol<=p[1]<=max(a[1],b[1])+tol
    for i,(a,b) in enumerate(edges):
        p,q=points[a],points[b]
        if any(v not in (a,b) and on(r,p,q) for v,r in enumerate(points)):raise ValueError('有限母图有未拆分的点边交点；请先显式拆边，再设置内缩。')
        for c,d in edges[i+1:]:
            if {a,b}&{c,d}:continue
            r,s=points[c],points[d]
            if on(p,r,s) or on(q,r,s) or on(r,p,q) or on(s,p,q) or cross(p,q,r)*cross(p,q,s)<0 and cross(r,s,p)*cross(r,s,q)<0:
                raise ValueError('有限母图有未拆分交叉或重叠；不会自动 Intersectify。')
    neighbors=defaultdict(list)
    for a,b in edges:neighbors[a].append(b);neighbors[b].append(a)
    if any(not neighbors[v] for v in range(len(points))):raise ValueError('有限母图不能含孤点。')
    components=[];visited=set()
    for first in range(len(points)):
        if first in visited:continue
        component={first};visited.add(first);pending=[first]
        while pending:
            for v in neighbors[pending.pop()]:
                if v not in visited:visited.add(v);component.add(v);pending.append(v)
        components.append(sorted(component))
    curve_info={}
    if 'curveHoles' in value:
        from tessellation_woven_curve_holes import validate_curve_holes
        curve_info=validate_curve_holes(value,components)
    for v,ns in neighbors.items():ns.sort(key=lambda n:math.atan2(points[n][1]-points[v][1],points[n][0]-points[v][0]))
    # In[1278]: consume original Edges followed by their reversals, taking the
    # previous angular neighbor at each arrival. This fixes the source face IDs.
    halves=[tuple(e) for e in edges]+[tuple(reversed(e)) for e in edges];seen=set();faces=[];outer=[]
    for first in halves:
        if first in seen:continue
        cycle=[];u,v=first
        while (u,v) not in seen:
            seen.add((u,v));cycle.append(u);ns=neighbors[v];u,v=v,ns[(ns.index(u)-1)%len(ns)]
        if (u,v)!=first or len(set(cycle))!=len(cycle) or len(cycle)<3:raise ValueError('有限母图不能含桥边、悬挂边或重复绕行的面。')
        area=sum(cross([0,0],points[a],points[b]) for a,b in zip(cycle,cycle[1:]+cycle[:1]))
        if abs(area)<=tol*span:raise ValueError('有限母图存在退化面。')
        if area>0:faces.append(cycle)
        else:outer.append(cycle)
    if len(outer)!=len(components) or not faces or len(faces)>256 or len(points)-len(edges)+len(faces)!=len(components):raise ValueError('有限母图须形成至多 256 面、每个独立部件单边界的纸面。')
    # Independent pieces must be geometrically separate. A nested outline is
    # ambiguous with a hole and is not silently interpreted as another sheet.
    def inside(p,ring):
        result=False
        for a,b in zip(ring,ring[1:]+ring[:1]):
            x,y=points[a],points[b]
            if (x[1]>p[1])!=(y[1]>p[1]) and p[0]<(y[0]-x[0])*(p[1]-x[1])/(y[1]-x[1])+x[0]:result=not result
        return result
    if 'ringHoles' not in value and not value.get('nestedSheets') and any(inside(points[a[0]],b) or inside(points[b[0]],a) for i,a in enumerate(outer) for b in outer[i+1:]):raise ValueError('独立母图边界相互包含；请明确选择嵌套独立纸片，不能自动猜测孔洞。')
    hole_info={};face_holes=None
    if 'ringHoles' in value:
        from tessellation_woven_rings import prepare_ring_mother
        faces,face_holes,hole_info=prepare_ring_mother(value,faces,outer,edges,components)
    elif 'holeFaces' in value:
        from tessellation_woven_holes import select_mother_holes
        faces,hole_info=select_mother_holes(value['holeFaces'],faces,outer,edges,components)
    turns=[[cross(points[a],points[b],points[c]) for a,b,c in zip(f,f[1:]+f[:1],f[2:]+f[:2])] for f in faces]
    if any(abs(turn)<=tol*span for ts in turns for turn in ts):raise ValueError('有限母图存在冗余共线角，无法构造原式内缩交点。')
    concave_faces=[i for i,ts in enumerate(turns) if min(ts)<0]
    boundary={v for ring in [*outer,*hole_info.get('motherHoleCycles',[])] for v in ring};boundary_cycle=outer[0][::-1]
    if face_holes is not None:
        void_components={b['component'] for b in value['ringHoles']}
        boundary_cycle=next(r for r in outer if not any(r[0] in components[c] for c in void_components))[::-1]
    concave_boundary=any(cross(points[a],points[b],points[v])<-tol*span for ring in outer for a,b in zip(ring[::-1],ring[-2::-1]+ring[-1:]) for v in ring)
    if any(len(neighbors[v]) not in (2,3) if v in boundary else len(neighbors[v]) not in range(4,33,2) for v in range(len(points))):raise ValueError('当前有限母图仅接内点 4–32 度偶度、边界二或三度；其它奇度或超过当前认证容量的偶度尚未接入。')
    counts=Counter(tuple(sorted((a,b))) for fi,f in enumerate(faces) for ring in [f,*(face_holes[fi] if face_holes else [])] for a,b in zip(ring,ring[1:]+ring[:1]))
    kinds=['B' if counts[tuple(sorted(e))]==1 else 'U' for e in edges]
    if not any(k=='U' for k in kinds):raise ValueError('有限母图需要至少一条内部编织边。')
    internal_boundary_chords=any(k!='B' and a in boundary and b in boundary for (a,b),k in zip(edges,kinds))
    mesh=make_fold([p.copy() for p in points],[e.copy() for e in edges],kinds,[f[::-1] for f in faces])
    if face_holes is not None:mesh['faces_holes']=[[r[::-1] for r in rs] for rs in face_holes]
    return dict(mesh=mesh,
                edgeLines=[-1 if k=='B' else 0 for k in kinds],edgeWidths=[0 if k=='B' else 2*inset for k in kinds],lines=[],boundary=[points[v].copy() for v in boundary_cycle],sourceFaceCycles=faces,graphMode=True,concaveBoundary=concave_boundary,internalBoundaryChords=internal_boundary_chords,**hole_info,**({'curveHoleInfo':curve_info} if curve_info else {}),**({'motherComponents':components,'motherComponentFaces':[[f for f,face in enumerate(faces) if face[0] in comp] for comp in components]} if len(components)>1 and face_holes is None else {}),**({'concaveFaces':concave_faces} if concave_faces else {}),**({'graphSourceInfo':source_info} if source_info is not None else {}))
