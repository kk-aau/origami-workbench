"""Straight-line arrangements for woven designs, independent of fold topology.

Line angles describe their tangent, with signed distance along the left normal.
Whole-line widths are defaults; a stamped mother-edge override can change one
segment while rejecting stale references after arrangement geometry changes.
"""
import math
import random
from collections import defaultdict

from tessellation_meshes import clip_half_plane,polygon_mesh


def _cross(a,b):return a[0]*b[1]-a[1]*b[0]


def convex_boundary(points):
    if not isinstance(points,list) or not 3<=len(points)<=32:
        raise ValueError('边界需要 3–32 个凸多边形顶点。')
    p=[]
    for point in points:
        if not isinstance(point,list) or len(point)!=2 or any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or abs(v)>10 for v in point):
            raise ValueError('边界坐标必须为 -10 至 10 的有限数字。')
        p.append([float(v) for v in point])
    if any(math.dist(a,b)<1e-7 for i,a in enumerate(p) for b in p[i+1:]):raise ValueError('边界顶点重复。')
    area=sum(_cross(a,b) for a,b in zip(p,p[1:]+p[:1]))
    if area<0:p.reverse()
    for a,b in zip(p,p[1:]+p[:1]):
        if any(_cross([b[0]-a[0],b[1]-a[1]],[q[0]-a[0],q[1]-a[1]]) < -1e-9 for q in p):
            raise ValueError('边界必须为凸多边形。')
    if abs(area)<1e-7:raise ValueError('边界退化。')
    return p


def normalize_lines(specs):
    if not isinstance(specs,list) or not 1<=len(specs)<=32:raise ValueError('需要 1–32 组直线。')
    result=[]
    for spec in specs:
        if not isinstance(spec,list) or len(spec)!=3:raise ValueError('每组直线需要角度、距离和条带宽度。')
        if any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in spec):raise ValueError('直线参数必须为有限数字。')
        angle,distance,width=spec
        if not -360<=angle<=360 or abs(distance)>10 or not .001<=width<=2:raise ValueError('直线角度、距离或宽度超出范围。')
        angle%=360
        if angle>=180:angle-=180;distance=-distance
        if any(abs(angle-a)<1e-7 and abs(distance-d)<1e-7 for a,d,_ in result):raise ValueError('直线重合，请合并后指定同一条带宽度。')
        result.append([float(angle),float(distance),float(width)])
    return result


def line_frame(spec):
    theta=math.radians(spec[0]);t=[math.cos(theta),math.sin(theta)];return t,[-t[1],t[0]]


def clipped_line(spec,boundary):
    tangent,normal=line_frame(spec);base=[x*spec[1] for x in normal];low,high=-math.inf,math.inf
    for a,b in zip(boundary,boundary[1:]+boundary[:1]):
        edge=[b[0]-a[0],b[1]-a[1]];slope=_cross(edge,tangent);value=_cross(edge,[base[0]-a[0],base[1]-a[1]])
        if abs(slope)<1e-10:
            if value < -1e-9:return None
        elif slope>0:low=max(low,-value/slope)
        else:high=min(high,-value/slope)
    if high-low<1e-7:return None
    return [[base[k]+x*tangent[k] for k in (0,1)] for x in (low,high)]


def chord_lines(specs,order,boundary=None):
    if isinstance(order,bool) or not isinstance(order,int) or not 1<=order<=12:raise ValueError('旋转阶数必须为 1–12。')
    source=normalize_lines(specs)
    if len(source)*order>32:raise ValueError('旋转复制后最多 32 条直线。')
    lines=[];ends=[]
    for angle,distance,width in source:
        if boundary is None and not 1e-7<abs(distance)<1:raise ValueError('圆弦距离必须非零且绝对值小于 1。')
        for i in range(order):
            rotated=[(angle+360*i/order)%360,distance,width]
            # Symmetric seed sets may generate the same complete line twice.
            candidate=normalize_lines([rotated])[0]
            if any(abs(candidate[0]-a)<1e-7 and abs(candidate[1]-d)<1e-7 for a,d,_ in lines):continue
            lines.append(candidate)
            if boundary is None:
                tangent,normal=line_frame(candidate);extent=math.sqrt(1-distance*distance)
                ends.extend([[candidate[1]*normal[k]+s*extent*tangent[k] for k in (0,1)] for s in (-1,1)])
    if boundary is None:
        from scipy.spatial import ConvexHull,QhullError
        try:boundary=[ends[i] for i in ConvexHull(ends).vertices]
        except QhullError:raise ValueError('弦线不能形成有面积的边界，请增加方向或旋转阶数。') from None
    else:
        from scipy.spatial import ConvexHull
        if not isinstance(boundary,list) or not 1<=len(boundary)<=32 or any(not isinstance(p,list) or len(p)!=2 or any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) or abs(x)>10 for x in p) for p in boundary):raise ValueError('旋转边界需要 1–32 个有效坐标。')
        p=boundary
        rotated=[[x*math.cos(2*math.pi*i/order)-y*math.sin(2*math.pi*i/order),x*math.sin(2*math.pi*i/order)+y*math.cos(2*math.pi*i/order)] for i in range(order) for x,y in p]
        from scipy.spatial import QhullError
        try:boundary=[rotated[i] for i in ConvexHull(rotated).vertices]
        except QhullError:raise ValueError('旋转后的边界不能形成多边形。') from None
    return lines,convex_boundary(boundary)


def arrangement(specs,boundary):
    boundary=convex_boundary(boundary);lines=normalize_lines(specs);active=[];cells=[boundary]
    for spec in lines:
        if clipped_line(spec,boundary) is None:continue
        _,normal=line_frame(spec);new=[]
        for cell in cells:
            distances=[sum(x*n for x,n in zip(p,normal))-spec[1] for p in cell]
            if min(distances)<-1e-8 and max(distances)>1e-8:
                new.extend([clip_half_plane(cell,normal,spec[1]),clip_half_plane(cell,[-n for n in normal],-spec[1])])
            else:new.append(cell)
        if len(new)>256:raise ValueError('线组交叉过多，最多支持 256 个分区。')
        if len(new)>len(cells):active.append(spec)
        cells=new
    if not active:raise ValueError('没有穿过边界的直线。')
    mesh=polygon_mesh(cells);coords=mesh['vertices_coords'];edge_lines=[];widths=[];incident=defaultdict(list);border=set()
    for e,((a,b),assignment) in enumerate(zip(mesh['edges_vertices'],mesh['edges_assignment'])):
        if assignment=='B':border.update((a,b));edge_lines.append(-1);widths.append(0);continue
        matching=[]
        for i,spec in enumerate(active):
            _,normal=line_frame(spec)
            if max(abs(sum(x*n for x,n in zip(coords[v],normal))-spec[1]) for v in (a,b))<1e-7:matching.append(i)
        if len(matching)!=1:raise ValueError('分段不能唯一归属到共线条带。')
        i=matching[0];edge_lines.append(i);widths.append(active[i][2]);incident[a].append(i);incident[b].append(i)
    for v,ids in incident.items():
        if v not in border and (len(ids)!=4 or len(set(ids))!=2):raise ValueError('内点必须是两条直线的四度交叉，不能三线共点。')
    return dict(mesh=mesh,lines=active,edgeLines=edge_lines,edgeWidths=widths,boundary=boundary)


def random_lines(count,min_distance,boundary,seed,max_tries=500,width=.05,*,original_courteous=False):
    if original_courteous:
        from tessellation_courteous_anarchy import courteous_lines
        return courteous_lines(count,min_distance,boundary,seed,max_tries,width)
    if isinstance(count,bool) or not isinstance(count,int) or not 1<=count<=24:raise ValueError('随机目标数必须为 1–24。')
    if not math.isfinite(min_distance) or min_distance<=0:raise ValueError('交点最小间距必须大于零。')
    if isinstance(seed,bool) or not isinstance(seed,int) or not 0<=seed<=999999:raise ValueError('随机种子无效。')
    if isinstance(max_tries,bool) or not isinstance(max_tries,int) or not 1<=max_tries<=5000:raise ValueError('尝试次数必须为 1–5000。')
    boundary=convex_boundary(boundary);rng=random.Random(seed);lines=[];attempts=0
    for attempts in range(1,max_tries+1):
        angle=rng.uniform(0,180);_,normal=line_frame([angle,0,width]);ds=[sum(x*n for x,n in zip(p,normal)) for p in boundary]
        candidate=[angle,rng.uniform(min(ds),max(ds)),width]
        try:
            data=arrangement(lines+[candidate],boundary);coords=data['mesh']['vertices_coords']
            # Also keep new intersections away from corners and strip endpoints.
            if any(math.dist(a,b)<min_distance for i,a in enumerate(coords) for b in coords[i+1:]):continue
        except ValueError:continue
        lines.append(candidate)
        if len(lines)==count:break
    if not lines:raise ValueError('未找到符合最小间距的随机线，请减小间距或增加尝试次数。')
    return lines,dict(requested=count,generated=len(lines),attempts=attempts,seed=seed)


def apply_segment_insets(data, overrides):
    """Apply per-mother-edge half-widths by line and two endpoint coordinates.

    Geometric stamps deliberately reject an old edit after a line intersection
    moves or changes the segment split; an edge number alone could silently
    assign the inset to another piece of the arrangement.
    """
    if not isinstance(overrides,list) or len(overrides)>128:
        raise ValueError('逐段内缩设置最多允许 128 条。')
    coords=data['mesh']['vertices_coords']
    if len(data['edgeLines'])!=len(data['mesh']['edges_vertices']) or len(data['edgeWidths'])!=len(data['edgeLines']):
        raise ValueError('线组分段元数据与母结构不一致。')
    used=set()
    for item in overrides:
        if not isinstance(item,dict) or set(item)!={'line','from','to','inset'}:
            raise ValueError('逐段内缩需要线编号、两个端点及内缩量。')
        line=item['line'];inset=item['inset']
        if isinstance(line,bool) or not isinstance(line,int) or not 0<=line<len(data['lines']):
            raise ValueError('逐段内缩线编号无效。')
        if isinstance(inset,bool) or not isinstance(inset,(int,float)) or not math.isfinite(inset) or not .0025<=inset<=1:
            raise ValueError('逐段内缩量须为 0.0025–1 的有限数字。')
        ends=[]
        for key in ('from','to'):
            point=item[key]
            if not isinstance(point,list) or len(point)!=2 or any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) or abs(x)>10 for x in point):
                raise ValueError('逐段内缩端点须为有效二维坐标。')
            ends.append(point)
        if math.dist(*ends)<1e-7:raise ValueError('逐段内缩的两个端点不能相同。')
        found=[]
        for edge,(a,b) in enumerate(data['mesh']['edges_vertices']):
            if data['edgeLines'][edge]!=line:continue
            p,q=coords[a],coords[b]
            if min(max(math.dist(p,ends[0]),math.dist(q,ends[1])),
                   max(math.dist(p,ends[1]),math.dist(q,ends[0])))<1e-7:found.append(edge)
        if len(found)!=1 or found[0] in used:
            raise ValueError('逐段内缩引用的母结构边已变化或重复，请重新选择该边。')
        edge=found[0];used.add(edge);data['edgeWidths'][edge]=2*float(inset)
    return data


def validate_full_edge_insets(value,graph_mode=False):
    if not isinstance(value,dict) or set(value)!={'edgeCount','entries'}:
        raise ValueError('完整逐边内缩需要全边数和有序边列表。')
    count=value['edgeCount'];entries=value['entries']
    if isinstance(count,bool) or not isinstance(count,int) or not 3<=count<=1024 or not isinstance(entries,list) or len(entries)!=count:
        raise ValueError('完整逐边内缩列表长度须等于全体母结构边数。')
    for i,item in enumerate(entries):
        if not isinstance(item,dict) or set(item)!={'edge','line','from','to','inset'} or isinstance(item['edge'],bool) or item['edge']!=i:
            raise ValueError('完整逐边内缩须按每个全边索引依次保存，不可遗漏或重复。')
        line,h=item['line'],item['inset']
        if isinstance(line,bool) or not isinstance(line,int) or not -1<=line<=31 or isinstance(h,bool) or not isinstance(h,(int,float)) or not math.isfinite(h) or not 0<=h<=(10 if graph_mode else 1):
            raise ValueError('完整逐边内缩编号或非负内缩量无效。')
        for key in ('from','to'):
            p=item[key]
            if not isinstance(p,list) or len(p)!=2 or any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) or abs(x)>(1000 if graph_mode else 10) for x in p):
                raise ValueError('完整逐边内缩的端点几何戳无效。')
        if math.dist(item['from'],item['to'])==0:raise ValueError('完整逐边内缩的端点不得重合。')
    return value


def apply_full_edge_insets(data,value,boundary_zero=False):
    source=validate_full_edge_insets(value,data.get('graphMode',False))
    mesh=data['mesh'];coords=mesh['vertices_coords'];edges=mesh['edges_vertices']
    if source['edgeCount']!=len(edges):raise ValueError('完整逐边内缩的全边数已变化，请重新选择母结构。')
    span=max(max(p[k] for p in coords)-min(p[k] for p in coords) for k in (0,1))
    # Relative to actual graph extent, plus coordinate ULP for translations.
    tolerance=1e-9*span+16*math.ulp(max(abs(x) for p in coords for x in p))
    requested=[]
    for item,(a,b),owner in zip(source['entries'],edges,data['edgeLines']):
        p,q=coords[a],coords[b]
        if item['line']!=owner or min(max(math.dist(p,item['from']),math.dist(q,item['to'])),max(math.dist(p,item['to']),math.dist(q,item['from'])))>tolerance:
            raise ValueError('完整逐边内缩的边索引或端点几何戳已变化，请重新选择该图。')
        requested.append(float(item['inset']))
    effective=[0. if owner<0 and boundary_zero else h for h,owner in zip(requested,data['edgeLines'])]
    data['requestedEdgeInsets']=requested;data['effectiveEdgeInsets']=effective
    data['edgeWidths']=[2*h for h in effective]
    return data


def inset_faces(data,border_inset=0):
    """Offset each cell by its per-line half-width, preserving its edge IDs."""
    mesh=data['mesh'];coords=mesh['vertices_coords'];edge_lookup={tuple(sorted(edge)):i for i,edge in enumerate(mesh['edges_vertices'])};result=[]
    for original in mesh['faces_vertices']:
        face=original[::-1] # CCW for interior left normals.
        equations=[]
        for a,b in zip(face,face[1:]+face[:1]):
            p,q=coords[a],coords[b];length=math.dist(p,q);normal=[-(q[1]-p[1])/length,(q[0]-p[0])/length]
            e=edge_lookup[tuple(sorted((a,b)))];inset=data['effectiveEdgeInsets'][e] if 'effectiveEdgeInsets' in data else border_inset if data['edgeLines'][e]<0 else data['edgeWidths'][e]/2
            equations.append((normal,sum(x*n for x,n in zip(p,normal))+inset))
        polygon=[]
        for (a,da),(b,db) in zip(equations[-1:]+equations[:-1],equations):
            det=_cross(a,b)
            if abs(det)<1e-10:raise ValueError('边界有冗余共线点，无法构造稳定内缩角。')
            point=[(da*b[1]-a[1]*db)/det,(a[0]*db-da*b[0])/det]
            if any(sum(x*n for x,n in zip(point,norm))<distance-1e-7 for norm,distance in equations):raise ValueError('条带宽度过大，内缩分区已消失；请减小宽度。')
            polygon.append(point)
        if min(math.dist(a,b) for a,b in zip(polygon,polygon[1:]+polygon[:1]))<1e-6:raise ValueError('条带宽度使内缩边退化。')
        result.append(polygon)
    return result
