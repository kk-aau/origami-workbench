"""Woven ribbons by inverse flat unfolding of an inset line arrangement.

The mathematical construction uses a checkerboard coloring of the cells and
one sliding corner on an offset edge per face/vertex incidence. The application
owns the topology, numerical solve, boundary validation and unfolding code; it
does not evaluate or translate Wolfram code.
"""
import math
from collections import defaultdict,deque
import numpy as np
from scipy.optimize import least_squares
from tessellation_woven_merit import MeritBudget, MeritBudgetExceeded, MeritLineSearchStalled, solve_merit
from scipy.sparse import lil_matrix

from tessellation_line_groups import arrangement,inset_faces,line_frame
from tessellation_patterns import make_fold,planar_faces,canonical_fold


def _graph_inset_faces(data,border_inset):
    """Literal adjacent offset-line intersections for a simple reflex cell.

    In[3428] uses the local intersections; a reflex polygon is not the
    intersection of all its interior half-planes. Keep the frozen convex
    implementation and reject collapsed/self-crossed local offsets instead.
    """
    mesh=data['mesh'];coords=mesh['vertices_coords'];concave=set(data.get('concaveFaces',()))
    lookup={tuple(sorted(edge)):i for i,edge in enumerate(mesh['edges_vertices'])};result=[]
    def cross(a,b):return a[0]*b[1]-a[1]*b[0]
    for fi,original in enumerate(mesh['faces_vertices']):
        if fi not in concave:
            result.extend(inset_faces(dict(data,mesh=dict(mesh,faces_vertices=[original])),border_inset));continue
        face=original[::-1];equations=[]
        for a,b in zip(face,face[1:]+face[:1]):
            p,q=coords[a],coords[b];length=math.dist(p,q);normal=[-(q[1]-p[1])/length,(q[0]-p[0])/length]
            e=lookup[tuple(sorted((a,b)))];h=data['effectiveEdgeInsets'][e] if 'effectiveEdgeInsets' in data else border_inset if data['edgeLines'][e]<0 else data['edgeWidths'][e]/2
            equations.append((normal,sum(x*n for x,n in zip(p,normal))+h))
        polygon=[]
        for (a,da),(b,db) in zip(equations[-1:]+equations[:-1],equations):
            det=cross(a,b)
            if abs(det)<1e-10:raise ValueError('边界有冗余共线点，无法构造稳定内缩角。')
            polygon.append([(da*b[1]-a[1]*db)/det,(a[0]*db-da*b[0])/det])
        segments=list(zip(polygon,polygon[1:]+polygon[:1]));span=max(math.dist(a,b) for a,b in segments);eps=1e-10*span
        for k,(a,b) in enumerate(segments):
            old_a,old_b=coords[face[k]],coords[face[(k+1)%len(face)]]
            if math.dist(a,b)<1e-6 or sum((b[j]-a[j])*(old_b[j]-old_a[j]) for j in (0,1))<=0:
                raise ValueError('条带宽度使凹面内缩边退化或反向。')
        def side(a,b,p):return cross([b[j]-a[j] for j in (0,1)],[p[j]-a[j] for j in (0,1)])
        def on(a,b,p):return abs(side(a,b,p))<=eps*math.dist(a,b) and all(min(a[j],b[j])-eps<=p[j]<=max(a[j],b[j])+eps for j in (0,1))
        for i,(a,b) in enumerate(segments):
            for j,(c,d) in enumerate(segments[i+1:],i+1):
                if j==i+1 or i==0 and j==len(segments)-1:continue
                if on(a,b,c) or on(a,b,d) or on(c,d,a) or on(c,d,b) or side(a,b,c)*side(a,b,d)<0 and side(c,d,a)*side(c,d,b)<0:
                    raise ValueError('条带宽度使凹面局部内缩自交。')
        if sum(cross(a,b) for a,b in segments)<=0:raise ValueError('条带宽度使凹面内缩分区消失。')
        result.append(polygon)
    return result


def _topology(data,parity,border_inset,probe_override=None,area_rechecks=None):
    mesh=data['mesh'];vertices=np.asarray(mesh['vertices_coords'],dtype=float);faces=[f[::-1] for f in mesh['faces_vertices']]
    from tessellation_woven_rings import face_rings
    rings=[[r[::-1] for r in rs] for rs in face_rings(mesh)]
    edge_ids={tuple(sorted(edge)):i for i,edge in enumerate(mesh['edges_vertices'])};edge_faces=defaultdict(list)
    for f,rs in enumerate(rings):
        for face in rs:
            for a,b in zip(face,face[1:]+face[:1]):edge_faces[tuple(sorted((a,b)))].append(f)
    neighbors=defaultdict(list)
    for fs in edge_faces.values():
        if len(fs)==2:a,b=fs;neighbors[a].append(b);neighbors[b].append(a)
    color={}
    for first in range(len(faces)):
        if first in color:continue
        color[first]=parity;queue=deque([first])
        while queue:
            a=queue.popleft()
            for b in neighbors[a]:
                if b in color:
                    if color[b]==color[a]:raise ValueError('线组分区不能二着色。')
                else:color[b]=-color[a];queue.append(b)
    old_boundary={v for edge,owner in zip(mesh['edges_vertices'],data['edgeLines']) if owner<0 for v in edge}
    insets=_graph_inset_faces(data,border_inset) if data.get('concaveFaces') else inset_faces(data,border_inset)
    if 'sourceFaceHoles' in data:
        from tessellation_woven_rings import ring_insets
        all_insets=ring_insets(data,border_inset)
    else:all_insets=[[inset] for inset in insets]
    bases=[];directions=[];variable=[];boundary_variable=[];corners={};anchors={}
    for f,(rs,ris) in enumerate(zip(rings,all_insets)):
      for face,inset in zip(rs,ris):
        for k,v in enumerate(face):
            prev,nex=face[k-1],face[(k+1)%len(face)]
            ep=vertices[v]-vertices[prev];ep/=np.linalg.norm(ep)
            en=vertices[nex]-vertices[v];en/=np.linalg.norm(en)
            ie=edge_ids[tuple(sorted((prev,v)))];oe=edge_ids[tuple(sorted((v,nex)))]
            bp,bo=data['edgeLines'][ie]<0,data['edgeLines'][oe]<0
            sine=abs(ep[0]*en[1]-ep[1]*en[0]);q=np.asarray(inset[k])
            if sine<1e-7:raise ValueError('编织交角过小。')
            corners[f,v]=len(bases)
            if bp and bo:
                bases.append(q);directions.append(np.zeros(2));variable.append(-1);continue
            # Displacement remains exactly on an inset side. Its scale makes
            # the scalar bound a pleat-width bound even at an oblique crossing.
            if bp:direction=ep*data['edgeWidths'][oe]/(2*sine)
            elif bo:direction=-en*data['edgeWidths'][ie]/(2*sine)
            elif color[f]>0:direction=-en*data['edgeWidths'][ie]/(2*sine)
            else:direction=ep*data['edgeWidths'][oe]/(2*sine)
            bases.append(q);directions.append(direction);variable.append(len(boundary_variable));boundary_variable.append(bp or bo)
            if bp or bo:
                anchors[f,v]=len(bases);bases.append(q);directions.append(np.zeros(2));variable.append(-1)
    edges={}
    def add(a,b,kind):
        if a==b:return
        key=tuple(sorted((a,b)))
        if key in edges and edges[key]!=kind and kind!='B' and edges[key]!='B':raise ValueError('编织邻接的山谷指派冲突。')
        if key not in edges or kind=='B':edges[key]=kind
    for f,rs in enumerate(rings):
      for face in rs:
        for a,b in zip(face,face[1:]+face[:1]):
            # In[3428] beqv tests both endpoints against BoundaryVertices.
            # An internal mother chord can therefore create an original B
            # edge with two incident faces. Do not silently relabel it M.
            # The explicit original TGraph path carries internal cut semantics.
            # Existing generated line arrangements retain their verified
            # single-sheet boundary classification until that path is migrated.
            boundary_edge=(a in old_boundary and b in old_boundary) if data.get('graphMode') else len(edge_faces[tuple(sorted((a,b)))])==1
            add(corners[f,a],corners[f,b],'B' if boundary_edge else 'M')
    for (a,b),fs in edge_faces.items():
        if len(fs)!=2:continue
        left=next(f for f in fs if any(x==a and y==b for ring in rings[f] for x,y in zip(ring,ring[1:]+ring[:1])))
        # Every original edge becomes one ribbon. Its two ends have opposite
        # crease signs; the cell coloring chooses the over/under alternation.
        right=next(f for f in fs if f!=left)
        for v,other,kind in ((a,b,'M' if color[left]>0 else 'V'),(b,a,'V' if color[left]>0 else 'M')):
            if v not in old_boundary:
                if kind=='M':
                    add(corners[fs[0],v],corners[fs[1],v],'M')
                    # The valley crosses the two other collinear half-edges
                    # at the junction, joining the next sliding corners.
                    ends=[]
                    for f in fs:
                        face=next(r for r in rings[f] if v in r);k=face.index(v)
                        n=next(x for x in (face[k-1],face[(k+1)%len(face)]) if x!=other)
                        ends.append(anchors.get((f,n),corners[f,n]))
                    add(*ends,'V')
            else:
                if any((f,v) not in anchors for f in fs):raise ValueError('原全局边界分支缺少第二角点；不能将其替换成内部顶点。')
                for f in fs:add(corners[f,v],anchors[f,v],'B')
                add(anchors[fs[0],v],anchors[fs[1],v],'B')
                if kind=='V':
                    for f in fs:add(anchors[f,v],anchors.get((f,other),corners[f,other]),'V')
    base=np.asarray(bases);directions=np.asarray(directions);variable=np.asarray(variable)
    edge_list=list(edges);kinds=list(edges.values())
    boundary={v for (a,b),kind in edges.items() if kind=='B' for v in (a,b)}
    adjacency=defaultdict(list)
    for a,b in edge_list:adjacency[a].append(b);adjacency[b].append(a)
    for v,ns in adjacency.items():
        if v not in boundary and len(ns)!=4:raise ValueError('编织交叉分子不是四度顶点。')
    # The probe only selects planar incidence before the nonlinear solve.
    # A fixed .1 can cross a narrow but valid inset cell. Conversely, a very
    # small probe can leave unequal-width sliding corners nearly coincident.
    # Check both the historical spacing and progressively smaller spacings.
    clearance=min(math.dist(point,inset[(k+1)%len(inset)])
                  for inset in insets for k,point in enumerate(inset))
    excursion=max((float(np.linalg.norm(direction)) for direction in directions),default=0.)
    close_probe=min(.1,.1*clearance/excursion) if excursion else .1
    probes=dict.fromkeys((.1,.05,.025,.0125,close_probe)) if probe_override is None else (probe_override,)
    for probe in probes:
        if isinstance(probe,tuple):
            di,db=probe
            offsets=np.asarray([db if v>=0 and boundary_variable[v] else di for v in variable])
            initial=base-offsets[:,None]*directions
        else:initial=base-probe*directions
        plane_faces=planar_faces(initial.tolist(),edge_list)
        if area_rechecks is not None and data.get('graphMode') and float(np.max(np.ptp(initial,axis=0)))<.01 and not any(data.get(k) for k in ('sourceFaceHoles','curveHoleInfo')) and (data.get('motherHoleCycles') or not data.get('motherComponents')):
            # Store this already attempted affine negative chart. A later
            # failed-only area recheck creates no new di/db probe or vertices.
            area_rechecks.append({'initial':initial.copy(),'probe':probe,'graph':dict(base=base,directions=directions,variable=variable,
                boundaryVariable=boundary_variable,edges=edge_list,assignments=kinds,corners=corners,anchors=anchors,colors=color,
                originalFaces=faces,originalRings=rings),
                **({'cellHoleData':data} if data.get('motherHoleCycles') else {})})
        if data.get('motherHoleCycles'):
            from tessellation_woven_holes import without_hole_faces
            try:plane_faces=without_hole_faces(plane_faces,data,corners,anchors)
            except ValueError:continue
        counts=defaultdict(int)
        for face in plane_faces:
            for a,b in zip(face,face[1:]+face[:1]):counts[tuple(sorted((a,b)))]+=1
        ring_hole_count=sum(map(len,data.get('sourceFaceHoles',[])))
        if len(initial)-len(edge_list)+len(plane_faces)-ring_hole_count!=len(data.get('motherComponents',[None]))-len(data.get('motherHoleCycles',[])):continue
        main_faces=[]
        for f,face in enumerate(faces):
            target={corners[f,v] for v in face}
            matches=[i for i,poly in enumerate(plane_faces) if set(poly)==target]
            if len(matches)!=1:break
            main_faces.append(matches[0])
        if len(main_faces)==len(faces):
            if 'sourceFaceHoles' in data:
                from tessellation_woven_rings import bind_generated_holes
                plane_holes=bind_generated_holes(plane_faces,main_faces,data,corners)
                for rs in plane_holes:
                    for ring in rs:
                        for a,b in zip(ring,ring[1:]+ring[:1]):counts[tuple(sorted((a,b)))]+=1
            else:plane_holes=None
            if any(counts[e] not in ((1,2) if kind=='B' else (2,)) for e,kind in edges.items()):continue
            break
    else:raise ValueError('条带间距不足以构造连续编织纸面，请减小宽度。')
    cycles=[]
    for v,ns in adjacency.items():
        # Origamica builds vertex equations from degree four, even when a
        # vertex touches an internally assigned B edge.
        if len(ns)!=4:continue
        ns.sort(key=lambda n:math.atan2(*(initial[n]-initial[v])[::-1]))
        cycles.append([v,*ns])
    return dict(base=base,directions=directions,variable=variable,boundaryVariable=boundary_variable,
                edges=edge_list,assignments=kinds,faces=plane_faces,cycles=np.asarray(cycles,dtype=int).reshape(-1,5),
                mainFaces=main_faces,corners=corners,anchors=anchors,colors=color,originalFaces=faces,originalRings=rings,topologyProbe=probe,**({'faceHoles':plane_holes} if plane_holes is not None else {}))


def _face_winding(points,face):
    """In[1159] total wrapped edge-angle change, not polygon area sign."""
    angles=[]
    for a,b in zip(face,face[1:]+face[:1]):
        delta=points[b]-points[a]
        if float(np.linalg.norm(delta))==0:raise ValueError('编织平折面存在重复相邻顶点。')
        angles.append(math.atan2(delta[1],delta[0]))
    turns=[(a-b+math.pi)%(2*math.pi)-math.pi for a,b in zip(angles,angles[-1:]+angles[:-1])]
    return round(math.fsum(turns)/(2*math.pi))


def _edge_face_restoration(points,edges,faces,holes=None):
    """In[1323] EdgeFaceAngles2D; B labels do not determine the angle."""
    incidence=defaultdict(list)
    for f,face in enumerate(faces):
        for ring in [face,*(holes[f] if holes else [])]:
            for a,b in zip(ring,ring[1:]+ring[:1]):incidence[tuple(sorted((a,b)))].append(f)
    winding=[_face_winding(points,face) for face in faces]
    owners=[incidence[tuple(sorted(edge))] for edge in edges]
    angles=[0 if len(fs)==1 or winding[fs[0]]==winding[fs[1]] else 180 for fs in owners]
    return owners,winding,angles


def _unfold(points,edges,faces,start,extra_roots=(),*,return_residuals=False,holes=None):
    incidence=defaultdict(list)
    for f,face in enumerate(faces):
        for ring in [face,*(holes[f] if holes else [])]:
            for a,b in zip(ring,ring[1:]+ring[:1]):incidence[tuple(sorted((a,b)))].append(f)
    adjacent=defaultdict(list)
    for edge,fs in incidence.items():
        if len(fs)==2:
            a,b=fs;adjacent[a].append((b,edge));adjacent[b].append((a,edge))
    winding=[_face_winding(points,face) for face in faces]
    roots=[start,*extra_roots];transforms={f:(np.eye(2),np.zeros(2)) for f in roots};queue=deque(roots);coords={};error=0.;residuals=[]
    while queue:
        f=queue.popleft();matrix,offset=transforms[f]
        for v in [*faces[f],*(v for ring in holes[f] for v in ring)] if holes else faces[f]:
            p=matrix@points[v]+offset
            if v in coords:
                delta=p-coords[v];error=max(error,float(np.linalg.norm(delta)));residuals.extend(delta)
            else:coords[v]=p
        for g,(a,b) in adjacent[f]:
            if g in transforms:continue
            x,y=matrix@points[a]+offset,matrix@points[b]+offset
            tangent=y-x;length=np.linalg.norm(tangent)
            if length<1e-8:raise ValueError('编织求解产生零长褶线。')
            tangent/=length
            # UnfoldGraph2D reads EdgeFaceAngles2D: equal FF winding means
            # zero rotation, opposite winding means a pi reflection.
            reflection=2*np.outer(tangent,tangent)-np.eye(2) if winding[f]!=winding[g] else np.eye(2)
            transforms[g]=(reflection@matrix,reflection@offset+x-reflection@x);queue.append(g)
    if len(transforms)!=len(faces):raise ValueError('编织面邻接不连通，不能按原固定面展开。')
    if return_residuals:return np.asarray(residuals)
    if error>2e-6:raise ValueError(f'编织展开未闭合（误差 {error:.3g}），请调整线组或宽度。')
    return [coords[i].tolist() for i in range(len(points))],error


def _woven_solution(data,parity=1,min_pleat=1,min_border=.01,border_inset=0,stationary=0,periodicity=None,*,initial_lengths=(),probe_override=None,seen_topologies=None,optimization='legacy',merit_budget=None,prepared_topology=None,recover_near_feasible=False,area_rechecks=None):
    if any(owner>=0 and width==0 for owner,width in zip(data['edgeLines'],data['edgeWidths'])):
        raise ValueError('内边零内缩使原编织顶点位移为零、分子退化；无法生成非退化 CP。')
    try:graph=prepared_topology if prepared_topology is not None else _topology(data,parity,border_inset,probe_override,area_rechecks)
    except ValueError as exc:
        if 'sourceFaceCycles' in data:raise ValueError(f'有限母图拓扑／内缩阶段失败：{exc}（尚未进入数值求解，无方程残差）。') from exc
        raise
    if seen_topologies is not None:
        # A cyclic rotation or reversal gives the same four-reflection equation.
        def canonical(cycle):
            values=list(cycle);rev=values[::-1]
            return min(tuple(q[i:]+q[:i]) for q in (values,rev) for i in range(len(q)))
        signature=(tuple((int(row[0]),canonical([int(v) for v in row[1:]])) for row in graph['cycles']),tuple(sorted(tuple(sorted(f)) for f in graph['faces'])))
        if signature in seen_topologies:raise _RepeatedTopology()
        seen_topologies.add(signature)
    if not 0<=stationary<len(graph['mainFaces']):raise ValueError('固定面编号超出母结构面数。')
    base=graph['base'];directions=graph['directions'];var=graph['variable'];mask=var>=0
    component_roots=[graph['mainFaces'][fs[0]] for fs in data.get('motherComponentFaces',[]) if stationary not in fs]
    cycles=graph['cycles'];nv=len(graph['boundaryVariable'])
    period_points=[];period_directions=[]
    original=np.asarray(data['mesh']['vertices_coords'])
    if periodicity and border_inset:raise ValueError('周期编织不能内缩边界。')
    period_records=[]
    if optimization=='origamica-merit' and periodicity:
        from tessellation_woven_period import original_period_records
        period_records=original_period_records(data,graph,periodicity)
        period_points=[(*r['corners'],np.asarray(r['delta'])) for r in period_records]
    else:
        for pair in periodicity or []:
            if not isinstance(pair,list) or len(pair)!=2 or any(isinstance(v,bool) or not isinstance(v,int) or not 0<=v<len(original) for v in pair) or pair[0]==pair[1]:raise ValueError('周期配对需要两个不同的有效母结构顶点编号。')
            a,b=pair;delta=original[b]-original[a]
            for color in (-1,1):
                fa=[f for (f,v) in graph['anchors'] if v==a and graph['colors'][f]==color]
                fb=[f for (f,v) in graph['anchors'] if v==b and graph['colors'][f]==color]
                if len(fa)!=1 or len(fb)!=1:raise ValueError('周期配对必须连接边界上的条带端点。')
                fa,fb=fa[0],fb[0];pa,pb=graph['corners'][fa,a],graph['corners'][fb,b];qa,qb=graph['anchors'][fa,a],graph['anchors'][fb,b]
                if np.linalg.norm(base[qb]-base[qa]-delta)>1e-6:raise ValueError('周期两端条带宽度或交替相位不一致，请扩大周期。')
                period_points.extend([(pa,pb,delta),(qa,qb,delta)])
                ends=[]
                for f,v in ((fa,a),(fb,b)):
                    face=next(r for r in graph['originalRings'][f] if v in r);k=face.index(v)
                    n=next((n for n in (face[k-1],face[(k+1)%len(face)]) if tuple(sorted((v,n))) in {tuple(e) for e,a in zip(data['mesh']['edges_vertices'],data['mesh']['edges_assignment']) if a!='B'}),None)
                    if n is None:raise ValueError('周期端点没有内部条带。')
                    ends.append(graph['corners'][f,n])
                period_directions.append((pa,ends[0],pb,ends[1]))
    lower=np.array([min_border if boundary else min_pleat for boundary in graph['boundaryVariable']])
    if optimization=='legacy':lower+=1e-5
    def positions(x):
        values=np.zeros(len(base));values[mask]=x[var[mask]]
        return base+directions*values[:,None]
    # A multiply connected mother has noncontractible loops. Local four-ray
    # equations alone do not close their global translation/rotation. Include
    # the actual repeated-corner unfold discrepancies in the legacy solve;
    # the strict final _unfold and CP gates remain authoritative.
    ring_voids=set(data.get('motherRingVoidFaceIds',[]))
    # A hole wholly inside one rigid mother face adds no hinge/dual cycle.
    # It contributes new single-owner corners, not repeated unfold vertices.
    # Excision across mother cells still requires the full closure equations.
    global_closure=bool(data.get('motherHoleCycles')) and (not ring_voids or any(f not in ring_voids for f in data['motherHoleFaceIds']))
    hole_closure_rows=2*(sum(map(len,graph['faces']))+sum(len(r) for rs in graph.get('faceHoles',[]) for r in rs)-len(base)) if global_closure else 0
    closure_scale=max(float(np.ptp(original,axis=0).max()),1e-12)
    def residual(x):
        p=positions(x);v=p[cycles[:,1:]]-p[cycles[:,0,None]]
        z=v[:,:,0]+1j*v[:,:,1];z/=np.maximum(np.abs(z),1e-12)
        # Composition of four reflections is identity iff this product is real.
        out=[(z[:,0]*z[:,2]*np.conjugate(z[:,1]*z[:,3])).imag]
        # Origamica's periodicity condition constrains displacement normal to
        # the old period vector. The unfolded repeat pitch may change along
        # that vector as pleats open; fixing both components overconstrains it.
        for a,b,delta in period_points:
            shift=p[b]-p[a]-delta
            out.append(np.array([(shift[0]*delta[1]-shift[1]*delta[0])/np.linalg.norm(delta)]))
        for a,b,c,d in period_directions:
            u=p[b]-p[a];v=p[d]-p[c]
            out.append(np.array([(u[0]*v[1]-u[1]*v[0])/max(np.linalg.norm(u)*np.linalg.norm(v),1e-12)]))
        if hole_closure_rows:out.append(_unfold(p,graph['edges'],graph['faces'],graph['mainFaces'][stationary],component_roots,return_residuals=True,holes=graph.get('faceHoles'))/closure_scale)
        return np.concatenate(out)
    sparse=lil_matrix((len(cycles)+len(period_points)+len(period_directions)+hole_closure_rows,nv),dtype=int)
    for row,cycle in enumerate(cycles):
        for v in cycle:
            if var[v]>=0:sparse[row,var[v]]=1
    row=len(cycles)
    for a,b,_ in period_points:
        for v in (a,b):
            if var[v]>=0:sparse[row,var[v]]=1
        row+=1
    for ends in period_directions:
        for v in ends:
            if var[v]>=0:sparse[row,var[v]]=1
        row+=1
    if hole_closure_rows:sparse[row:,:]=1
    if optimization not in ('legacy','origamica-merit'):
        raise ValueError('未知的编织优化方式。')
    from tessellate import check_geometry
    # Reflection equations have several branches. A zero algebraic residual
    # alone does not certify a planar sheet; reject crossed developments and
    # keep the complete CP geometry gate below.
    failure='当前条带宽度与最小褶宽约束没有找到稳定展开解。';best_residual=math.inf;failure_stage='反射／周期方程'
    if optimization=='origamica-merit':
        closure_system=None
        if global_closure:
            from tessellation_woven_holonomy import UnfoldClosureSystem
            closure_system=UnfoldClosureSystem(graph,[graph['mainFaces'][stationary],*component_roots],closure_scale,positions(lower),_face_winding)
        result,folded,merit_report=solve_merit(graph,lower,merit_budget or MeritBudget(),period_records=period_records,closure_system=closure_system,recover_near_feasible=recover_near_feasible)
        maximum_residual=merit_report['maximumResidual'];best_residual=maximum_residual
        try:cp,error=_unfold(folded,graph['edges'],graph['faces'],graph['mainFaces'][stationary],component_roots,holes=graph.get('faceHoles'))
        except ValueError as e:raise ValueError(f'原版平方和优化得到的平折展开无效：{e}') from e
        fold=make_fold(cp,graph['edges'],graph['assignments'],graph['faces'])
        if 'faceHoles' in graph:
            from tessellation_woven_rings import validate_generated_holes
            fold['faces_holes']=validate_generated_holes(cp,graph['faces'],graph['faceHoles'])
        if check_geometry(fold)['status']!='passed':
            raise ValueError('原版平方和优化得到的 CP 几何校验失败。')
        selected_method='origamica-merit'
    else:
        for interior_start,border_start in dict.fromkeys((*initial_lengths,(1.2,.2),(2.,.4),(1.6,1.),(3.,.6))):
            start=np.maximum(lower+.02,np.array([border_start if b else interior_start for b in graph['boundaryVariable']]))
            result=least_squares(residual,start,bounds=(lower,np.maximum(lower+2,50)),jac_sparsity=sparse.tocsr(),
                                 ftol=1e-12,xtol=1e-12,gtol=1e-12,max_nfev=200)
            maximum_residual=float(np.max(np.abs(residual(result.x)),initial=0));best_residual=min(best_residual,maximum_residual)
            if maximum_residual>1e-7:continue
            folded=positions(result.x)
            try:cp,error=_unfold(folded,graph['edges'],graph['faces'],graph['mainFaces'][stationary],component_roots,holes=graph.get('faceHoles'))
            except ValueError as e:failure=str(e);failure_stage='平折展开';continue
            fold=make_fold(cp,graph['edges'],graph['assignments'],graph['faces'])
            if 'faceHoles' in graph:
                from tessellation_woven_rings import validate_generated_holes
                try:fold['faces_holes']=validate_generated_holes(cp,graph['faces'],graph['faceHoles'])
                except ValueError as exc:failure=str(exc);failure_stage='CP 环孔包含校验';continue
            if check_geometry(fold)['status']=='passed':
                selected_method='legacy';break
            failure='编织展开产生交叉，请减小条带宽度或更改最小褶宽。';failure_stage='CP 几何校验'
        else:
            if 'sourceFaceCycles' in data:raise ValueError(f'有限母图{failure_stage}阶段失败（最小方程最大残差 {best_residual:.3g}）：{failure}')
            raise ValueError(failure)
    period_vectors={}
    for a,b,delta in period_points:
        key=tuple(round(float(x),7) for x in delta);vector=np.asarray(cp[b])-np.asarray(cp[a])
        if key in period_vectors and np.linalg.norm(vector-period_vectors[key])>2e-5:raise ValueError('周期展开后的边界尚未吻合，请调整线组或周期配对。')
        period_vectors[key]=vector
    owners,winding,restore_angles=_edge_face_restoration(folded,graph['edges'],graph['faces'],graph.get('faceHoles'))
    internal_cuts=[i for i,(kind,fs) in enumerate(zip(graph['assignments'],owners)) if kind=='B' and len(fs)==2]
    cut_details={}
    if internal_cuts:
        cut_details['wovenCutTopology']=dict(schema='origamica-woven-internal-boundary-v1',
            internalBoundaryEdges=internal_cuts,edgeFaceIncidence=owners,foldedFaceWinding=winding,
            edgeRestoreAnglesDeg=restore_angles,boundaryAssignmentIsFaceIncidence=False,
            standardSingleSheetFold=False,originalFunctions=['MakeSimpleWovenTessellation','EdgeFaceAngles2D','UnfoldGraph2D'])
    solved=dict(closureError=error,solveEvaluations=getattr(result,'nfev',getattr(result,'nit',0)),pleatFactors=result.x.tolist(),
                stationaryFace=stationary,stationaryFoldFace=graph['mainFaces'][stationary],
                                    periodVectors=[v.tolist() for v in period_vectors.values()],**cut_details,**({'topologyProbe':list(graph['topologyProbe']) if isinstance(graph['topologyProbe'],tuple) else [graph['topologyProbe']]*2} if seen_topologies is not None else {}))
    if component_roots:
        solved['wovenIndependentMother']=dict(schema='zhezhi-woven-independent-mother-v1',vertices=data['motherComponents'],faces=data['motherComponentFaces'],foldRoots=[graph['mainFaces'][stationary],*component_roots])
    if data.get('curveHoleInfo'):
        solved['wovenMotherCurveHoles']=data['curveHoleInfo']
    if data.get('motherHoleCycles'):
        solved['wovenMotherHoles']=dict(schema='zhezhi-woven-mother-holes-v1',faceIds=data['motherHoleFaceIds'],cycles=data['motherHoleCycles'],retainedFaceIds=data['motherRetainedFaceIds'])
    if 'sourceFaceHoles' in data:
        solved['wovenMotherRingHoles']=dict(schema='zhezhi-woven-mother-rings-v1',bindings=data['motherRingHoleBindings'],voidFaceIds=data['motherRingVoidFaceIds'],physicalComponents=data['motherComponents'])
    if selected_method=='origamica-merit':
        solved.update(optimization='origamica-merit',merit=float(np.dot(result.x,result.x)),meritReport=merit_report)
        if 'areaTopologyProof' in graph:solved['topologyAreaRecovery']={**graph['areaTopologyProof'],
            'sourceCoordinatesChanged':False,'newNegativeProbesAdded':False,'originalObjectiveChanged':False,
            'finalGeometryToleranceChanged':False,'allOriginalConstraintsRetained':True}
    return fold,folded.tolist(),solved


class _RepeatedTopology(Exception):
    pass


def _higher_even_mother(data):
    if not data.get('graphMode'):return False
    degree=defaultdict(int)
    for a,b in data['mesh']['edges_vertices']:degree[a]+=1;degree[b]+=1
    border={v for edge,kind in zip(data['mesh']['edges_vertices'],data['mesh']['edges_assignment']) if kind=='B' for v in edge}
    return any(degree[v]>4 for v in degree if v not in border)


def _general_boundary_mother(data):
    if not data.get('graphMode'):return False
    # The frozen In[3437] source already has its own verified initial chart;
    # keep that public result and its metadata byte-for-byte unchanged.
    return (data.get('concaveBoundary',False) and 'graphSourceInfo' not in data) or data.get('internalBoundaryChords',False) or bool(data.get('concaveFaces'))


# In[3428] evaluates the same affine newverts with negative di/db to discover
# CP cyclic order. Higher even mother degree can need a different negative
# initial embedding; source points, edges and assignments are never changed.
# This bounded search is numerical bootstrap, not a claim of mathematical
# insolvability when no chart/root passes the complete CP checks.
_EVEN_PROBE_LEVELS=(.1,.5,1.,2.,3.,5.,8.,10.,12.,16.,20.,30.,50.)


def woven_pattern(data,parity=1,min_pleat=1,min_border=.01,border_inset=0,stationary=0,periodicity=None,*,initial_lengths=(),optimization='legacy'):
    merit_budget=MeritBudget() if optimization=='origamica-merit' else None
    args=(data,parity,min_pleat,min_border,border_inset,stationary,periodicity)
    if not (_higher_even_mother(data) or _general_boundary_mother(data)):
        try:return _woven_solution(*args,initial_lengths=initial_lengths,optimization=optimization,merit_budget=merit_budget)
        except MeritBudgetExceeded:raise
        except ValueError:
            # Preserve every already successful four-degree/source result.
            # A failed finite mother can still need the original negative
            # di/db topology chart even when its outer border is convex.
            if not data.get('graphMode'):raise
    failures=[];seen=set();attempts=0;budget=1+len(_EVEN_PROBE_LEVELS)**2;deferred=[];area_rechecks=[]
    for probe in (None,*((a,b) for a in _EVEN_PROBE_LEVELS for b in _EVEN_PROBE_LEVELS)):
        attempts+=1
        try:
            fold,flat,solved=_woven_solution(*args,initial_lengths=initial_lengths,probe_override=probe,seen_topologies=seen,optimization=optimization,merit_budget=merit_budget,
                area_rechecks=area_rechecks if optimization=='origamica-merit' else None)
            solved.update(topologyProbeBudget=budget,topologyProbeAttempts=attempts,topologyChartsSolved=len(seen))
            return fold,flat,solved
        except MeritBudgetExceeded:raise
        except _RepeatedTopology:continue
        except ValueError as exc:
            failures.append(str(exc))
            if isinstance(exc,MeritLineSearchStalled):deferred.append(exc.graph)
    # Successful historical charts, roots and output remain unchanged. Only
    # after the entire original search fails, recover cached near-feasible
    # charts without adding or altering any negative di/db topology probe.
    for recovery_attempt,graph in enumerate(deferred,1):
        try:
            fold,flat,solved=_woven_solution(*args,initial_lengths=initial_lengths,
                optimization=optimization,merit_budget=merit_budget,
                prepared_topology=graph,recover_near_feasible=True)
            solved.update(topologyProbeBudget=budget,topologyProbeAttempts=attempts,
                          topologyChartsSolved=len(seen),numericalRecoveryAttempts=recovery_attempt)
            return fold,flat,solved
        except MeritBudgetExceeded:raise
        except ValueError as exc:failures.append(str(exc))
    # Reclassify recorded raw charts only after every original chart/root and
    # existing near-feasible recovery failed. Area signs must remain separated
    # from 32-epsilon coordinate uncertainty; no zero/noise face is admitted.
    if area_rechecks and (_higher_even_mother(data) or data.get('motherHoleCycles')):
        from tessellation_woven_area_topology import restore_recorded_topology
        area_seen=set()
        for recheck,record in enumerate(area_rechecks,1):
            try:
                graph=restore_recorded_topology(record,merit_budget)
                fold,flat,solved=_woven_solution(*args,initial_lengths=initial_lengths,optimization=optimization,
                    merit_budget=merit_budget,prepared_topology=graph,seen_topologies=area_seen)
                solved.update(topologyProbeBudget=budget,topologyProbeAttempts=attempts,
                    topologyChartsSolved=len(seen)+len(area_seen),topologyAreaRecheckAttempts=recheck)
                return fold,flat,solved
            except MeritBudgetExceeded:raise
            except _RepeatedTopology:continue
            except ValueError as exc:failures.append(str(exc))
    # Report the deepest actual failed phase, preserving its measured residual.
    def rank(message):
        if 'CP 几何校验' in message:return 3
        if '平折展开阶段' in message or '平折展开无效' in message:return 2
        if '反射／周期方程阶段' in message or '平方和优化未找到' in message or '反射分子存在退化' in message:return 1
        return 0
    message=max(failures,key=rank) if failures else '有限母图拓扑初值未找到有效图。'
    raise ValueError(f'{message} 已尝试 {attempts} 轮有界负初值候选、{len(seen)} 个不同拓扑；当前算法预算未找到有效 CP，不构成数学无解证明。')


BOX=[[-1,-1],[1,-1],[1,1],[-1,1]]


def validate_woven(data):
    from tessellation_advanced import number
    from tessellation_line_groups import convex_boundary
    mode=data.get('mode','lines')
    if mode not in ('lines','chord','random','graph'):raise ValueError('线组编织方式无效。')
    allowed={'family','mode','width','parity','minPleat','minBorderPleat','borderInset','stationaryFace','periodicity','periodicityEnabled','fullEdgeInsets','optimization','wovenVersion'}|({'graph','graphSource'} if mode=='graph' else {'boundary','segmentInsets'}|({'count','minDistance','seed','maxTries','randomVersion','samePtTolerance','intersectionTolerance'} if mode=='random' else {'lines'}|({'order'} if mode=='chord' else set())))
    if set(data)-allowed:raise ValueError('含当前线组编织方式不支持的参数。')
    courteous=data.get('randomVersion') in ('original-courteous','original-courteous-graph')
    if 'randomVersion' in data and not courteous:raise ValueError('原随机线接受规则版本无效。')
    courteous_graph=data.get('randomVersion')=='original-courteous-graph'
    if any(k in data for k in ('samePtTolerance','intersectionTolerance')) and not courteous_graph:
        raise ValueError('两项原Graph公差仅适用于原随机母图模式。')
    out=dict(family='woven-lines',mode=mode,width=number(data,'width',.035 if mode=='chord' else .04 if mode=='random' else .08,.005,20 if mode=='graph' else .2),
             parity=number(data,'parity',1,-1,1,True),minPleat=number(data,'minPleat',1,.1,6),
             minBorderPleat=number(data,'minBorderPleat',.01,.001,2),stationaryFace=number(data,'stationaryFace',0,0,255,True))
    if not out['parity']:raise ValueError('编织奇偶必须是 1 或 -1。')
    border=data.get('borderInset','auto')
    if border not in ('auto','none'):raise ValueError('边界内缩必须为自动或关闭。')
    out['borderInset']=border
    optimization=data.get('optimization','legacy')
    if optimization not in ('legacy','origamica-merit'):raise ValueError('编织优化方式无效。')
    if 'optimization' in data:out['optimization']=optimization
    if 'wovenVersion' in data:
        if data['wovenVersion']!='original-old' or mode!='graph' or border!='auto' or any(k in data for k in ('periodicity','periodicityEnabled','fullEdgeInsets','segmentInsets')) or 'optimization' in data and optimization!='origamica-merit':
            raise ValueError('原版本（d/dd）仅接原有限母图与统一内缩；不接受新版周期／逐边内缩／兼容目标。')
        if not isinstance(data.get('graph'),dict) or set(data['graph'])!={'vertices','edges'}:raise ValueError('原版本只接原直线TGraph，工作台孔洞／纸片角色须用当前版本。')
        out['wovenVersion']='original-old'
    if mode!='graph' and ('boundary' in data or mode!='chord'):
        value=data.get('boundary',BOX)
        if mode=='chord':
            from tessellation_advanced import points
            out['boundary']=points(value,-10,10,1,32)
        else:
            out['boundary']=convex_boundary(value)
            if courteous:out['boundary']=[[float(x),float(y)] for x,y in value]
    if mode=='graph':
        from tessellation_woven_graph import woven_graph_data
        woven_graph_data(data.get('graph'),graph_source=data.get('graphSource'))
        out['graph']=data['graph']
        if 'graphSource' in data:
            from tessellation_woven_graph_source import read_graph_source
            out['graphSource']=read_graph_source(data['graphSource'])
    elif mode=='random':
        out.update(count=number(data,'count',5,1,24,True),minDistance=number(data,'minDistance',.15,.001,2),seed=number(data,'seed',0 if courteous else 12,0,999999,True),maxTries=number(data,'maxTries',20000 if courteous else 500,1,20000 if courteous else 5000,True))
        if courteous:out['randomVersion']=data['randomVersion']
        if courteous_graph:
            out.update(samePtTolerance=number(data,'samePtTolerance',1e-6,0,.1),intersectionTolerance=number(data,'intersectionTolerance',1e-6,0,.1))
    else:
        lines=data.get('lines',[[0,.4,1]] if mode=='chord' else [[0,-.25,1],[90,-.25,1.5],[45,.4,.7]])
        if not isinstance(lines,list) or not 1<=len(lines)<=32:raise ValueError('需要 1–32 组直线。')
        result=[]
        for row in lines:
            if not isinstance(row,list) or len(row)!=3:raise ValueError('每组直线需要角度、距离和宽度倍率。')
            values=dict(zip(('angle','distance','ratio'),row))
            result.append([number(values,'angle',0,-360,360),number(values,'distance',0,-10,10),number(values,'ratio',1,.2,5)])
        out['lines']=result
        if mode=='chord':
            out['order']=number(data,'order',7,1,12,True)
            if len(result)*out['order']>32:raise ValueError('旋转后最多支持 32 条线。')
    if 'periodicity' in data:
        pairs=data['periodicity']
        if not isinstance(pairs,list) or len(pairs)>64 or any(not isinstance(p,list) or len(p)!=2 or any(isinstance(i,bool) or not isinstance(i,int) or not 0<=i<=2047 for i in p) or p[0]==p[1] for p in pairs):raise ValueError('周期配对编号无效。')
        out['periodicity']=pairs
    if 'periodicityEnabled' in data:
        if not isinstance(data['periodicityEnabled'],bool) or data['periodicityEnabled'] is False and out.get('periodicity'):
            raise ValueError('周期启用标志须为布尔值；关闭周期不能同时保留非空配对。')
        out['periodicityEnabled']=data['periodicityEnabled']
    if 'segmentInsets' in data:
        entries=data['segmentInsets']
        if not isinstance(entries,list) or len(entries)>128:
            raise ValueError('逐段内缩设置最多允许 128 条。')
        out['segmentInsets']=[]
        for entry in entries:
            if not isinstance(entry,dict) or set(entry)!={'line','from','to','inset'}:
                raise ValueError('逐段内缩需要线编号、两个端点及内缩量。')
            line=entry['line'];inset=entry['inset']
            if isinstance(line,bool) or not isinstance(line,int) or not 0<=line<32 or isinstance(inset,bool) or not isinstance(inset,(int,float)) or not math.isfinite(inset) or not .0025<=inset<=1:
                raise ValueError('逐段内缩编号或内缩量无效。')
            endpoints=[]
            for key in ('from','to'):
                point=entry[key]
                if not isinstance(point,list) or len(point)!=2 or any(isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or abs(value)>10 for value in point):
                    raise ValueError('逐段内缩端点坐标无效。')
                endpoints.append([float(value) for value in point])
            out['segmentInsets'].append({'line':line,'from':endpoints[0],'to':endpoints[1],'inset':float(inset)})
    if 'fullEdgeInsets' in data:
        if 'segmentInsets' in data:raise ValueError('完整逐边列表不能与逐段覆盖同时指定。')
        from tessellation_line_groups import validate_full_edge_insets
        out['fullEdgeInsets']=validate_full_edge_insets(data['fullEdgeInsets'],mode=='graph')
    return out


def construct_woven(params,*,initial_lengths=()):
    if params.get('wovenVersion')=='original-old':
        from tessellation_woven_old import construct_original_old
        return construct_original_old(params)
    from tessellation_line_groups import chord_lines,random_lines
    mode=params['mode'];info={};boundary=params.get('boundary')
    if mode=='graph':
        from tessellation_woven_graph import woven_graph_data
        data=woven_graph_data(params['graph'],params['width']/2,params.get('graphSource'))
    elif mode=='random':
        lines,info=random_lines(params['count'],params['minDistance'],boundary,params['seed'],params['maxTries'],params['width'],**({'original_courteous':True} if params.get('randomVersion') in ('original-courteous','original-courteous-graph') else {}))
    else:
        lines=[[a,d,params['width']*ratio] for a,d,ratio in params['lines']]
        if mode=='chord':lines,boundary=chord_lines(lines,params['order'],boundary)
    if params.get('randomVersion')=='original-courteous-graph':
        from tessellation_courteous_graph import courteous_graph_data
        data,info=courteous_graph_data(lines,info,boundary,params['width'],params['samePtTolerance'],params['intersectionTolerance'])
    elif mode!='graph':data=arrangement(lines,boundary)
    periodicity=params.get('periodicity',[])
    periodic_enabled=params.get('periodicityEnabled') is True or bool(periodicity)
    if params.get('segmentInsets'):
        from tessellation_line_groups import apply_segment_insets
        apply_segment_insets(data,params['segmentInsets'])
    inset=params['width']/2 if params['borderInset']=='auto' and not periodic_enabled else 0
    if 'fullEdgeInsets' in params:
        from tessellation_line_groups import apply_full_edge_insets
        apply_full_edge_insets(data,params['fullEdgeInsets'],params['borderInset']=='none' or periodic_enabled)
    fold,flat,solved=woven_pattern(data,params['parity'],params['minPleat'],params['minBorderPleat'],inset,params['stationaryFace'],periodicity,initial_lengths=initial_lengths,optimization=params.get('optimization','legacy'))
    if params.get('graphSource',{}).get('invertFoldType'):
        fold['edges_assignment']=[{'M':'V','V':'M'}.get(kind,kind) for kind in fold['edges_assignment']]
        fold['edges_foldAngle']=[-angle if angle is not None else None for angle in fold['edges_foldAngle']]
    source=dict(name='折纸工作台',license='GPL-3.0-only',algorithm='woven ribbons / inverse isometry constraints',version=1,
                lines=data['lines'],edgeLines=data['edgeLines'],edgeWidths=data['edgeWidths'],foldedForm=flat,
                segmentInsets=params.get('segmentInsets',[]),
                **({'fullEdgeInsets':params['fullEdgeInsets'],
                    'requestedEdgeInsets':data['requestedEdgeInsets'],
                    'effectiveEdgeInsets':data['effectiveEdgeInsets']} if 'fullEdgeInsets' in params else {}),
                borderInset=inset,**({'periodicityEnabled':periodic_enabled} if 'periodicityEnabled' in params else {}),**info,**solved)
    if mode=='graph':
        if 'sourceFaceHoles' in data:source['sourceFaceHoles']=data['sourceFaceHoles']
        source.pop('lines');source.pop('segmentInsets')
        source.update(graph=params['graph'],sourceFaceCycles=data['sourceFaceCycles'],defaultInset=params['width']/2,edgeOwnerMeaning='boundary=-1;finite-interior=0')
    if 'graphSource' in params:
        source.update(graphSource=params['graphSource'],originalEdgeForSegment=data['graphSourceInfo']['originalEdgeForSegment'],invertFoldType=params['graphSource']['invertFoldType'])
    return fold,data['mesh'],None,len(data['mesh']['faces_vertices']),source
