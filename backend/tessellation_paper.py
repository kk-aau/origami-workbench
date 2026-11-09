"""Extend boundary creases to a separate, closed sheet of paper.

This is deliberately limited to one connected perimeter whose fold terminals
have exactly one incident M/V crease. Extending that crease in a straight line
preserves its local 180-degree fold geometry. Merely drawing a second boundary
would leave the paper disconnected; all annular faces are rebuilt here.
"""

from collections import Counter, defaultdict
import math

from tessellation_patterns import make_fold, planar_faces


def _bounded_number(value, low, high):
    if isinstance(value,bool) or not isinstance(value,(int,float)):
        return None
    try:result=float(value)
    except (OverflowError,ValueError):return None
    return result if math.isfinite(result) and low<=result<=high else None


def validate_paper_spec(value):
    """Validate the public paper object before touching a construction."""
    if not isinstance(value,dict) or set(value)-{'shape','aspect','sides','margin','fit'}:
        raise ValueError('独立纸张参数须为含形状和边距的对象。')
    shape=value.get('shape')
    if shape not in ('square','rectangle','regular'):
        raise ValueError('纸张形状须为方形、矩形或正多边形。')
    fit=value.get('fit','extend')
    if fit not in ('extend','inscribed'):
        raise ValueError('纸张适配方式须为外延 extend 或内切 inscribed。')
    margin=value.get('margin')
    maximum=.45 if fit=='inscribed' else 1
    margin=_bounded_number(margin,.02,maximum)
    if margin is None:
        raise ValueError('内切纸张内缩须为 0.02–0.45。' if fit=='inscribed' else '纸张边距须为 0.02–1。')
    result={'shape':shape,'margin':margin}
    if 'fit' in value:result['fit']=fit
    if shape=='rectangle':
        if 'sides' in value:raise ValueError('矩形纸张不使用边数。')
        aspect=value.get('aspect',1)
        aspect=_bounded_number(aspect,.2,5)
        if aspect is None:
            raise ValueError('纸张宽高比须为 0.2–5。')
        if 'aspect' in value:result['aspect']=aspect
    elif shape=='regular':
        if 'aspect' in value:raise ValueError('正多边形纸张不使用宽高比。')
        sides=value.get('sides',6)
        if isinstance(sides,bool) or not isinstance(sides,int) or not 3<=sides<=12:
            raise ValueError('正多边形纸张须有 3–12 条边。')
        if 'sides' in value:result['sides']=sides
    elif 'aspect' in value or 'sides' in value:
        raise ValueError('方形纸张不使用宽高比或边数。')
    return result


def paper_polygon(coords, shape='square', aspect=1., sides=6, margin=.1,fit='extend'):
    if fit!='extend':
        raise ValueError('内切纸张须通过实际折痕裁剪入口生成。')
    if shape not in ('square', 'rectangle', 'regular'):
        raise ValueError('纸张形状须为方形、矩形或正多边形。')
    margin=_bounded_number(margin,.02,1)
    if margin is None:
        raise ValueError('纸张边距须为 0.02–1。')
    lo=[min(p[j] for p in coords) for j in (0,1)]
    hi=[max(p[j] for p in coords) for j in (0,1)]
    center=[(lo[j]+hi[j])/2 for j in (0,1)]
    span=max(hi[0]-lo[0],hi[1]-lo[1],1e-6)
    padding=span*margin
    if shape!='regular':
        if shape=='square':aspect=1.
        else:
            aspect=_bounded_number(aspect,.2,5)
            if aspect is None:raise ValueError('纸张宽高比须为 0.2–5。')
        height=max(hi[1]-lo[1]+2*padding,(hi[0]-lo[0]+2*padding)/aspect)
        width=aspect*height
        return [[center[0]-width/2,center[1]-height/2],
                [center[0]+width/2,center[1]-height/2],
                [center[0]+width/2,center[1]+height/2],
                [center[0]-width/2,center[1]+height/2]]
    if isinstance(sides,bool) or not isinstance(sides,int) or not 3 <= sides <= 12:
        raise ValueError('正多边形纸张须有 3–12 条边。')
    start=-math.pi/2
    unit=[[math.cos(start+2*math.pi*i/sides),math.sin(start+2*math.pi*i/sides)] for i in range(sides)]
    apothem=math.cos(math.pi/sides)
    radius=0.
    for a,b in zip(unit,unit[1:]+unit[:1]):
        normal=((b[1]-a[1]),-(b[0]-a[0]))
        length=math.hypot(*normal)
        nx,ny=normal[0]/length,normal[1]/length
        radius=max(radius,max(((p[0]-center[0])*nx+(p[1]-center[1])*ny+padding)/apothem for p in coords))
    return [[center[0]+radius*x,center[1]+radius*y] for x,y in unit]


def _boundary_cycle(fold):
    neighbors=defaultdict(list)
    owners=Counter()
    for face in fold['faces_vertices']:
        for a,b in zip(face,face[1:]+face[:1]):owners[tuple(sorted((a,b)))]+=1
    for (a,b),assignment in zip(fold['edges_vertices'],fold['edges_assignment']):
        if assignment=='B':
            if owners[tuple(sorted((a,b)))]!=1:
                raise ValueError('原外围边必须恰好连接一个纸面。')
            neighbors[a].append(b);neighbors[b].append(a)
    if not neighbors or any(len(v)!=2 for v in neighbors.values()):
        raise ValueError('独立纸张要求原外围是一条无分叉闭环。')
    cycle=[next(iter(neighbors))]
    previous=None
    while True:
        current=cycle[-1]
        following=next(v for v in neighbors[current] if v!=previous)
        if following==cycle[0]:break
        if following in cycle or len(cycle)>=len(neighbors):
            raise ValueError('原外围不是简单闭环。')
        previous=current
        cycle.append(following)
    if len(cycle)!=len(neighbors):
        raise ValueError('目前只支持一片连通、无孔的外围。')
    return cycle


def _cross(a,b,p):
    return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])


def _ray_to_convex_outline(point,direction,polygon):
    hits=[]
    for side,(a,b) in enumerate(zip(polygon,polygon[1:]+polygon[:1])):
        sx,sy=b[0]-a[0],b[1]-a[1]
        determinant=direction[0]*sy-direction[1]*sx
        if abs(determinant)<1e-12:continue
        ox,oy=a[0]-point[0],a[1]-point[1]
        t=(ox*sy-oy*sx)/determinant
        u=(ox*direction[1]-oy*direction[0])/determinant
        if t>1e-8 and -1e-8<=u<=1+1e-8:
            hits.append((t,side,min(1.,max(0.,u))))
    if not hits:raise ValueError('延伸折痕未能到达纸张边界。')
    return min(hits)


def _area(poly):
    return sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(poly,poly[1:]+poly[:1]))/2


def _is_convex_face(face,coords):
    sign=1 if _area([coords[i] for i in face])>0 else -1
    turns=[sign*_cross(coords[face[i-1]],coords[face[i]],coords[face[(i+1)%len(face)]])
           for i in range(len(face))]
    return min(turns)>=-1e-9


def _triangulate_face(face,coords):
    """Ear-clip one simple annular face, retaining each existing boundary edge."""
    remaining=list(face)
    sign=1 if _area([coords[i] for i in face])>0 else -1
    triangles=[]
    scale=max(1.,max(max(p[j] for p in coords)-min(p[j] for p in coords) for j in (0,1)))
    epsilon=scale*scale*1e-11
    while len(remaining)>3:
        for i in range(len(remaining)):
            a,b,c=remaining[i-1],remaining[i],remaining[(i+1)%len(remaining)]
            if sign*_cross(coords[a],coords[b],coords[c])<=epsilon:continue
            if any(v not in (a,b,c) and all(sign*_cross(coords[x],coords[y],coords[v])>=-epsilon
                                              for x,y in ((a,b),(b,c),(c,a))) for v in remaining):
                continue
            triangles.append([a,b,c]);remaining.pop(i)
            break
        else:
            raise ValueError('纸张补面不能稳定剖分成凸面。')
    triangles.append(remaining)
    return triangles


def paper_local_conditions(fold):
    """Kawasaki/Maekawa at real crease stars; zero-angle F seams are omitted."""
    coords=fold['vertices_coords']
    incident=defaultdict(list)
    border=set()
    for (a,b),assignment in zip(fold['edges_vertices'],fold['edges_assignment']):
        if assignment=='B':border.update((a,b))
        if assignment in ('M','V','U'):
            incident[a].append((b,assignment));incident[b].append((a,assignment))
    odd=[];kawasaki=[];maekawa=[];unknown=[]
    max_error=0.
    interior=0
    for vertex,neighbors in incident.items():
        if vertex in border:continue
        interior+=1
        if len(neighbors)<2 or len(neighbors)%2:
            odd.append(vertex);continue
        x,y=coords[vertex]
        angles=sorted(math.atan2(coords[v][1]-y,coords[v][0]-x) for v,_ in neighbors)
        sectors=[(angles[(i+1)%len(angles)]-angle)%math.tau for i,angle in enumerate(angles)]
        error=math.degrees(abs(sum(sectors[::2])-math.pi))
        max_error=max(max_error,error)
        if error>.001:kawasaki.append({'vertex':vertex,'errorDeg':error})
        assignments=[assignment for _,assignment in neighbors]
        if 'U' in assignments:unknown.append(vertex)
        elif abs(assignments.count('M')-assignments.count('V'))!=2:maekawa.append(vertex)
    status='not_applicable' if not interior else 'failed' if odd or kawasaki or maekawa else 'incomplete' if unknown else 'passed'
    return {'status':status,'interiorVertices':interior,'oddDegreeVertices':odd,
            'kawasakiViolations':kawasaki,'maekawaViolations':maekawa,
            'unknownAssignmentVertices':unknown,'maxKawasakiErrorDeg':max_error,'toleranceDeg':.001}


def envelope_paper(fold, shape='square', aspect=1., sides=6, margin=.1):
    """Return one sheet with old boundary creases extended to the new edge.

    Rejects intersections and branching terminals instead of inventing folds.
    Caller must still run local flat-fold and layer checks before adoption.
    """
    from tessellate import check_geometry

    if check_geometry(fold)['status']!='passed':
        raise ValueError('原折痕几何未通过检查，无法外包纸张。')
    cycle=_boundary_cycle(fold)
    original_coords=fold['vertices_coords']
    outline=paper_polygon(original_coords,shape,aspect,sides,margin)
    coords=[list(p) for p in original_coords]+[list(p) for p in outline]
    edges=[list(edge) for edge in fold['edges_vertices']]
    assignments=['F' if assignment=='B' else assignment for assignment in fold['edges_assignment']]
    original_boundary_edges=[i for i,assignment in enumerate(fold['edges_assignment']) if assignment=='B']
    incident=defaultdict(list)
    for (a,b),assignment in zip(edges,assignments):
        if assignment in ('M','V'):
            incident[a].append((b,assignment));incident[b].append((a,assignment))
    ray_hits=defaultdict(list)
    ray_extensions=[]
    for vertex in cycle:
        creases=incident[vertex]
        if len(creases)>1:
            raise ValueError('原外围顶点有多条山谷线，无法保真延长到独立纸张。')
        if not creases:continue
        other,assignment=creases[0]
        direction=[coords[vertex][j]-coords[other][j] for j in (0,1)]
        length=math.hypot(*direction)
        if length<1e-9:raise ValueError('外围折痕退化，无法延长。')
        direction=[v/length for v in direction]
        t,side,u=_ray_to_convex_outline(coords[vertex],direction,outline)
        hit=[coords[vertex][j]+t*direction[j] for j in (0,1)]
        first=len(original_coords)+side
        second=len(original_coords)+(side+1)%len(outline)
        if u<1e-8:target=first
        elif u>1-1e-8:target=second
        else:
            target=len(coords)
            coords.append(hit)
            ray_hits[side].append((u,target))
        edges.append([vertex,target]);assignments.append(assignment)
        ray_extensions.append({'boundaryVertex':vertex,'interiorVertex':other,
                               'targetVertex':target,'paperSide':side})
    if not ray_hits and len(edges)==len(fold['edges_vertices']):
        raise ValueError('原外围没有可延长折痕，无法连接新纸张与原纸面。')
    for side in range(len(outline)):
        vertices=[len(original_coords)+side]+[v for _,v in sorted(ray_hits[side])]+[len(original_coords)+(side+1)%len(outline)]
        for a,b in zip(vertices,vertices[1:]):
            edges.append([a,b]);assignments.append('B')
    interim=make_fold(coords,edges,assignments,[])
    geometry=check_geometry(interim)
    if geometry['status']!='passed':
        raise ValueError('延伸折痕与原结构或彼此相交，无法构成独立纸张。')
    faces=planar_faces(coords,edges)
    original_faces={frozenset(face) for face in fold['faces_vertices']}
    subdivided=[]
    edge_set={tuple(sorted(edge)) for edge in edges}
    for face in faces:
        if frozenset(face) in original_faces or _is_convex_face(face,coords):
            subdivided.append(face)
            continue
        triangles=_triangulate_face(face,coords)
        boundary_edges={tuple(sorted((a,b))) for a,b in zip(face,face[1:]+face[:1])}
        for triangle in triangles:
            for a,b in zip(triangle,triangle[1:]+triangle[:1]):
                key=tuple(sorted((a,b)))
                if key not in boundary_edges and key not in edge_set:
                    edges.append([a,b]);assignments.append('F');edge_set.add(key)
        subdivided.extend(triangles)
    faces=subdivided
    result=make_fold(coords,edges,assignments,faces)
    if check_geometry(result)['status']!='passed':
        raise ValueError('纸张补面的辅助分割线与原结构相交。')
    ownership=Counter(tuple(sorted((a,b))) for face in faces for a,b in zip(face,face[1:]+face[:1]))
    if any(ownership[tuple(sorted(edge))]!=(1 if assignment=='B' else 2)
           for edge,assignment in zip(edges,assignments)):
        raise ValueError('纸张补面未闭合或折痕面邻接不一致。')
    if not original_faces.issubset({frozenset(face) for face in faces}):
        raise ValueError('外包纸张改变了原有折痕面。')
    paper_area=abs(_area(outline))
    face_area=sum(abs(_area([coords[i] for i in face])) for face in faces)
    if abs(face_area-paper_area)>paper_area*1e-7:
        raise ValueError('纸张补面存在空洞或重叠。')
    result['zhezhi_paper_outline']=[coords[len(original_coords)+i] for i in range(len(outline))]
    result['zhezhi_paper_original_boundary']=len(cycle)
    result['zhezhi_paper_recipe']={'originalVertices':len(original_coords),'originalEdges':len(fold['edges_vertices']),
                                    'originalBoundaryVertices':cycle,'originalBoundaryEdges':original_boundary_edges,
                                    'outlineVertices':len(outline),'rayExtensions':ray_extensions,
                                    'shape':shape,'aspect':aspect,'sides':sides,'margin':margin}
    if fold.get('zhezhi_preview') is not None:
        result['zhezhi_preview']=fold['zhezhi_preview']
    return result
