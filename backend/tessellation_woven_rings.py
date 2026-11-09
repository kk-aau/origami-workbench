"""Explicit multi-ring mother cells. No bridges, welding or inferred voids."""
from collections import defaultdict
import math


def face_rings(graph):
    holes=graph.get('faces_holes',[[] for _ in graph['faces_vertices']])
    return [[face,*holes[f]] for f,face in enumerate(graph['faces_vertices'])]


def prepare_ring_mother(value,faces,outer,edges,components):
    bindings=value['ringHoles']
    if not isinstance(bindings,list) or not 1<=len(bindings)<=32 or any(not isinstance(b,dict) or set(b)!={'face','component'} or any(isinstance(b[k],bool) or not isinstance(b[k],int) for k in b) or not 0<=b['face']<len(faces) or not 0<=b['component']<len(components) for b in bindings):
        raise ValueError('环孔需要1–32组原面编号和原独立轮廓部件编号。')
    if len({b['component'] for b in bindings})!=len(bindings):raise ValueError('一个轮廓不能同时绑定到多个环孔母面。')
    points=value['vertices'];vertex_component={v:c for c,vs in enumerate(components) for v in vs}
    component_faces=[[f for f,face in enumerate(faces) if vertex_component[face[0]]==c] for c in range(len(components))]
    component_outer={vertex_component[ring[0]]:ring for ring in outer}
    def inside(p,ring):
        result=False
        for a,b in zip(ring,ring[1:]+ring[:1]):
            x,y=points[a],points[b]
            if (x[1]>p[1])!=(y[1]>p[1]) and p[0]<(y[0]-x[0])*(p[1]-x[1])/(y[1]-x[1])+x[0]:result=not result
        return result
    old_holes=value.get('holeFaces',[])
    if 'holeFaces' in value and (not isinstance(old_holes,list) or not 1<=len(old_holes)<=32 or any(isinstance(f,bool) or not isinstance(f,int) or not 0<=f<len(faces) for f in old_holes) or len(set(old_holes))!=len(old_holes)):
        raise ValueError('母图孔洞需要1–32个不重复的原半边面编号。')
    voids=[];holes_by_face=defaultdict(list);parent=list(range(len(components)))
    for b in bindings:
        f,c=b['face'],b['component'];p=vertex_component[faces[f][0]]
        if p==c or len(component_faces[c])!=1 or len([e for e in edges if vertex_component[e[0]]==c])!=len(components[c]):
            raise ValueError('环孔轮廓必须是另一个完整的简单独立闭环，内部不能有未被材料使用的源边。')
        if not all(inside(points[v],faces[f]) for v in components[c]):raise ValueError('环孔轮廓必须严格位于所绑定原面的内部。')
        voids.extend(component_faces[c]);holes_by_face[f].append(component_outer[c]);parent[c]=p
    removed=set(old_holes+voids)
    if len(removed)!=len(old_holes)+len(voids) or any(b['face'] in removed for b in bindings):raise ValueError('环孔不能绑定到已移除的面或另一个孔洞轮廓内部。')
    border={v for c,ring in component_outer.items() if c not in {b['component'] for b in bindings} for v in ring}
    if any(border.intersection(faces[f]) for f in old_holes) or any(set(faces[f]).intersection(faces[g]) for i,f in enumerate(old_holes) for g in old_holes[i+1:]):raise ValueError('内部单元孔洞不能接触外边界或其他孔洞。')
    for rings in holes_by_face.values():
        if any(inside(points[a[0]],b) or inside(points[b[0]],a) for i,a in enumerate(rings) for b in rings[i+1:]):raise ValueError('同一母面的环孔不能相互包含或重叠。')
    # All unassigned containment remains ambiguous unless the user explicitly
    # chooses independent sheets. A declared ring hole only joins its parent.
    if not value.get('nestedSheets'):
        for a,ra in component_outer.items():
            for b,rb in component_outer.items():
                if a<b and (inside(points[ra[0]],rb) or inside(points[rb[0]],ra)) and parent[a]!=parent[b]:raise ValueError('未声明的嵌套轮廓不能自动当作纸片或孔洞。')
    kept_ids=[f for f in range(len(faces)) if f not in removed];kept=[faces[f] for f in kept_ids];holes=[holes_by_face[f] for f in kept_ids]
    owners=defaultdict(list)
    for f,rings in enumerate([[face,*holes[f]] for f,face in enumerate(kept)]):
        for ring in rings:
            for a,b in zip(ring,ring[1:]+ring[:1]):owners[tuple(sorted((a,b)))].append(f)
    if any(len(owners[tuple(sorted(e))]) not in (1,2) for e in edges):raise ValueError('多环母图存在未被材料使用的源边或非流形边。')
    physical=[];physical_faces=[]
    for c in range(len(components)):
        if parent[c]!=c:continue
        vertices=sorted(v for j,vs in enumerate(components) if parent[j]==c for v in vs)
        fs=[f for f,old in enumerate(kept_ids) if vertex_component[faces[old][0]]==c]
        if not fs:raise ValueError('孔洞不能移除整个母图纸片。')
        adjacent=defaultdict(list)
        for os in owners.values():
            if len(os)==2:a,b=os;adjacent[a].append(b);adjacent[b].append(a)
        reached={fs[0]};queue=list(reached)
        for f in queue:
            for other in adjacent[f]:
                if other not in reached:reached.add(other);queue.append(other)
        if reached!=set(fs):raise ValueError('多环纸片的面关联断开，不能通过点接触代替材料连接。')
        physical.append(vertices);physical_faces.append(fs)
    hole_cycles=[faces[f] for f in [*old_holes,*voids]]
    info=dict(sourceFaceHoles=[[list(r) for r in rs] for rs in holes],motherHoleCycles=[list(r) for r in hole_cycles],motherHoleFaceIds=[*old_holes,*voids],motherRetainedFaceIds=kept_ids,
              motherComponents=physical,motherComponentFaces=physical_faces,motherRingHoleBindings=[dict(b) for b in bindings],motherRingVoidFaceIds=voids)
    return kept,holes,info


def ring_insets(data,border_inset):
    """Adjacent signed offset intersections, with each ring's own direction."""
    graph=data['mesh'];coords=graph['vertices_coords'];lookup={tuple(sorted(e)):i for i,e in enumerate(graph['edges_vertices'])};output=[]
    for rings in face_rings(graph):
        result=[]
        for source in rings:
            ring=source[::-1];equations=[]
            for a,b in zip(ring,ring[1:]+ring[:1]):
                p,q=coords[a],coords[b];length=math.dist(p,q);nx,ny=-(q[1]-p[1])/length,(q[0]-p[0])/length;e=lookup[tuple(sorted((a,b)))];h=data['effectiveEdgeInsets'][e] if 'effectiveEdgeInsets' in data else border_inset if data['edgeLines'][e]<0 else data['edgeWidths'][e]/2
                equations.append((nx,ny,nx*p[0]+ny*p[1]+h))
            inset=[]
            for (a,b,c),(d,e,f) in zip(equations[-1:]+equations[:-1],equations):
                det=a*e-b*d
                if abs(det)<1e-10:raise ValueError('环孔内缩有退化或冗余共线角。')
                inset.append([(c*e-b*f)/det,(a*f-c*d)/det])
            if any(not math.isfinite(x) for p in inset for x in p):raise ValueError('环孔内缩产生非有限坐标。')
            for k,(a,b) in enumerate(zip(inset,inset[1:]+inset[:1])):
                p,q=coords[ring[k]],coords[ring[(k+1)%len(ring)]]
                if math.dist(a,b)<1e-8 or sum((b[j]-a[j])*(q[j]-p[j]) for j in (0,1))<=0:raise ValueError('环孔内缩边消失或反向。')
            result.append(inset)
        output.append(result)
    return output


def bind_generated_holes(plane_faces,main_faces,data,corners):
    holes=[[] for _ in plane_faces]
    for f,rings in enumerate(data['sourceFaceHoles']):
        for ring in rings:
            # The retained CP outer is clockwise. Hole winding is opposite.
            holes[main_faces[f]].append([corners[f,v] for v in ring[::-1]])
    return holes


def validate_generated_holes(coords,faces,holes):
    """Validate actual material containment and normalize boundary orientation."""
    def area(ring):
        o=coords[ring[0]]
        return math.fsum((coords[a][0]-o[0])*(coords[b][1]-o[1])-(coords[a][1]-o[1])*(coords[b][0]-o[0]) for a,b in zip(ring,ring[1:]+ring[:1]))
    def inside(p,ring):
        hit=False
        for a,b in zip(ring,ring[1:]+ring[:1]):
            x,y=coords[a],coords[b];cross=(y[0]-x[0])*(p[1]-x[1])-(y[1]-x[1])*(p[0]-x[0])
            if cross==0 and all(min(x[k],y[k])<=p[k]<=max(x[k],y[k]) for k in (0,1)):return False
            if (x[1]>p[1])!=(y[1]>p[1]) and p[0]<(y[0]-x[0])*(p[1]-x[1])/(y[1]-x[1])+x[0]:hit=not hit
        return hit
    result=[]
    for f,rs in enumerate(holes):
        loops=[]
        for ring in rs:
            signed=area(ring)
            if not signed or not all(inside(coords[v],faces[f]) for v in ring):raise ValueError('生成环孔未严格包含在实际材料面内；未填孔或补桥。')
            loops.append(ring.copy() if signed*area(faces[f])<0 else ring[::-1])
        if any(inside(coords[a[0]],b) or inside(coords[b[0]],a) for i,a in enumerate(loops) for b in loops[i+1:]):raise ValueError('生成环孔相互包含或重叠。')
        result.append(loops)
    return result
