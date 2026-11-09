"""Exact split-twist geometry from line intersection and Kawasaki's theorem.

Three unsplit corners keep their incident pleat lines. At each neighbor of
the preserved corner, Kawasaki fixes the direction toward a split vertex.
Intersect that direction with the opposite pleat line to locate the two
split vertices. This construction uses no optimization target or notebook
implementation code.
"""
import math
import numpy as np
from tessellation_patterns import make_fold,planar_faces,canonical_fold

DEFAULT_POLYGON=[[0.,0.],[1.,0.],[1.1,1.4],[-.2,1.]]
VARIANTS=('general','centered','centered-angle','offset','unit-offset')


def unit_quadrilateral_vertices(angles,side,side_index):
    """Origamica UnitQuadrilateralVertices: first edge is (0,0)-(1,0).

    The first three corner angles set the edge directions. The selected
    second, third or fourth edge fixes the remaining two edge lengths by
    closure; a supplied fourth angle has no role in the original formula.
    """
    if not isinstance(angles,list) or len(angles) not in (3,4):
        raise ValueError('单位四边形须提供前三个内角。')
    if any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) or not 1<=x<=179 for x in angles[:3]):
        raise ValueError('前三个内角须在 1–179° 之间。')
    if len(angles)==4 and (isinstance(angles[3],bool) or not isinstance(angles[3],(int,float)) or not math.isfinite(angles[3])):
        raise ValueError('第四角须为有限数字；其值不参与构造。')
    if not 1<=360-sum(angles[:3])<=179:
        raise ValueError('前三个内角推得的第四角须在 1–179° 之间。')
    if isinstance(side,bool) or not isinstance(side,(int,float)) or not math.isfinite(side) or not .05<=side<=5:
        raise ValueError('指定边长须在 0.05–5 之间。')
    if isinstance(side_index,bool) or not isinstance(side_index,(int,float)) or not math.isfinite(side_index) or side_index not in (2,3,4):
        raise ValueError('指定边须为第 2、3 或 4 边。')
    side_index=int(side_index)
    a1,a2,a3=map(math.radians,angles[:3])
    def direction(a):return (math.cos(a),math.sin(a))
    u2=direction(math.pi-a2);u3=direction(2*math.pi-a2-a3);u4=direction(a1)
    def cross(a,b):return a[0]*b[1]-a[1]*b[0]
    def solve(u,v,r):
        det=cross(u,v)
        if abs(det)<1e-10:raise ValueError('该角度和指定边无法唯一确定四边形。')
        return cross(r,v)/det,cross(u,r)/det
    neg4=(-u4[0],-u4[1])
    if side_index==2:
        s2=side;s3,s4=solve(u3,neg4,(-1-side*u2[0],-side*u2[1]))
    elif side_index==3:
        s3=side;s2,s4=solve(u2,neg4,(-1-side*u3[0],-side*u3[1]))
    else:
        s4=side;s2,s3=solve(u2,u3,(-1+side*u4[0],side*u4[1]))
    if min(s2,s3,s4)<1e-6 or max(s2,s3,s4)>10:
        raise ValueError('该角度和边长不能构成有效凸四边形。')
    p2=(1+s2*u2[0],s2*u2[1]);p3=(p2[0]+s3*u3[0],p2[1]+s3*u3[1])
    polygon=[[0.,0.],[1.,0.],list(p2),list(p3)]
    if any(not math.isfinite(x) or abs(x)>10 for p in polygon for x in p):
        raise ValueError('单位四边形坐标越过允许范围。')
    edges=[(polygon[(i+1)%4][0]-polygon[i][0],polygon[(i+1)%4][1]-polygon[i][1]) for i in range(4)]
    if min(cross(edges[i],edges[(i+1)%4]) for i in range(4))<=1e-8:
        raise ValueError('该角度和边长不能构成严格凸四边形。')
    return polygon


def centered_tilt(width,twist_angle):
    """For a cyclic centered tile tan(alpha)=w*tan(tau), with both angles in (0,pi)."""
    alpha=math.radians(twist_angle)
    return math.degrees(math.atan2(math.sin(alpha),width*math.cos(alpha)))


def validate_exact_split(data):
    from tessellation_advanced import number,points
    variant=data.get('variant','centered')
    fields={'general':{'offset','tilt','ccw'},'centered':{'tilt'},'centered-angle':{'twistAngle'},'offset':{'offset'},'unit-offset':{'offset','angles','side','sideIndex'}}
    if not isinstance(variant,str) or variant not in fields:raise ValueError('分裂扭转变体无效。')
    common={'family','variant','width','baseVertex','connection','centralTypes'}
    if variant!='unit-offset':common.add('polygon')
    if set(data)-common-fields[variant]:raise ValueError('含当前分裂变体不支持的参数。')
    polygon=(unit_quadrilateral_vertices(data.get('angles',[70,85,95]),data.get('side',1),data.get('sideIndex',2)) if variant=='unit-offset'
             else points(data.get('polygon',[[0,0],[1,0],[.9,.8],[.2,1]] if variant=='offset' else DEFAULT_POLYGON),-10,10,4,4))
    out={'family':'split','variant':variant,'polygon':polygon,
         'width':number(data,'width',.14 if variant=='offset' else .15,.05,.8),'baseVertex':number(data,'baseVertex',0 if variant=='offset' else 1,0,3,True)}
    if variant=='unit-offset':out.update(angles=list(data.get('angles',[70,85,95])[:3]),side=float(data.get('side',1)),sideIndex=int(data.get('sideIndex',2)))
    connection=data.get('connection','M');types=data.get('centralTypes',['M','M','V','V'] if variant=='offset' else ['M','V','V','M'] if variant=='unit-offset' else ['M']*4)
    if connection not in ('M','V') or not isinstance(types,list) or len(types)!=4 or any(t not in ('M','V') for t in types):raise ValueError('连接与四条中心边须指定山折或谷折。')
    out.update(connection=connection,centralTypes=types.copy())
    if variant in ('general','offset','unit-offset'):out['offset']=number(data,'offset',0 if variant=='general' else .09 if variant=='unit-offset' else -.12,-.4,.4)
    if variant in ('general','centered'):out['tilt']=number(data,'tilt',70,1,179)
    if variant=='centered-angle':out['twistAngle']=number(data,'twistAngle',22.4,1,179)
    if variant=='general':
        if not isinstance(data.get('ccw',True),bool):raise ValueError('褶线方向必须是布尔值。')
        out['ccw']=data.get('ccw',True)
    if abs(out.get('offset',0))+out['width']/2>=.5-1e-8:raise ValueError('褶宽与偏置越过单元边界。')
    return out


def construct_exact_split(params):
    variant=params['variant'];offset=params.get('offset',0.)
    tilt=centered_tilt(params['width'],params['twistAngle']) if variant=='centered-angle' else 90. if variant in ('offset','unit-offset') else params['tilt']
    ccw=params['ccw'] if variant=='general' else offset>0 if variant in ('offset','unit-offset') else tilt<90
    fold,mother,details=exact_split(params['polygon'],params['width'],offset,tilt,params['baseVertex'],params['connection'],params['centralTypes'],ccw)
    return fold,mother,None,1,{'name':'折纸工作台','license':'GPL-3.0-only','algorithm':'exact quadrilateral split / line intersections / directed twist-angle assignments',
        'version':2,'variant':variant,**({'unitQuadrilateral':{'angles':params['angles'],'side':params['side'],'sideIndex':params['sideIndex']}} if variant=='unit-offset' else {}),**details}


def intersect_lines(p,u,q,v):
    matrix=np.column_stack([u,-v])
    if abs(float(np.linalg.det(matrix)))<1e-12*np.linalg.norm(u)*np.linalg.norm(v):
        raise ValueError('构造线平行，无法确定分裂顶点，请调整褶角或基点。')
    return p+np.linalg.solve(matrix,q-p)[0]*u


def rotate(v,angle):
    c,s=math.cos(angle),math.sin(angle)
    return np.array([[c,-s],[s,c]])@v


def split_connection_types(central_vertices,border_endpoints,connection):
    """Determine both split diagonals from the construction's directed angles.

    Origamica In[2879] measures the directed angle at the next central
    vertex from the upper border point toward the preceding central vertex.
    In[2936] uses its preceding/following angles to assign the two new
    diagonals. In our rolled indexing x is its right split vertex and y is
    its left split vertex. A local M/V solution is not a substitute for
    these explicit construction choices.
    """
    q=np.asarray(central_vertices,dtype=float)
    b=np.asarray(border_endpoints,dtype=float)
    angles=[]
    for i in (3,0):
        u=b[i]-q[(i+1)%4]
        v=q[i]-q[(i+1)%4]
        angles.append(math.atan2(float(np.dot(u,rotate(v,math.pi/2))),float(np.dot(u,v))))
    left,right=angles
    opposite='V' if connection=='M' else 'M'
    return [connection if right<math.pi/2 else opposite,
            opposite if left<math.pi/2 else connection],angles


def exact_split(vertices,width,offset,tilt,base=0,connection='M',central_types=None,ccw=True):
    from tessellate import check_geometry,check_local_conditions
    from tessellation_advanced import assign_local_mv
    p=np.array(vertices,dtype=float)
    if p.shape!=(4,2) or not np.isfinite(p).all():raise ValueError('精确分裂需要四个有效顶点。')
    if isinstance(base,bool) or not isinstance(base,int) or not 0<=base<4:raise ValueError('分裂基点须在 1–4 之间。')
    if connection not in ('M','V') or not isinstance(ccw,bool):raise ValueError('连接山谷或扭转方向无效。')
    types=list(central_types) if central_types is not None else ['M']*4
    if len(types)!=4 or any(t not in ('M','V') for t in types):raise ValueError('四条中心边须指定山折或谷折。')
    if any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) for x in (width,offset,tilt)) or not .05<=width<=.8 or abs(offset)+width/2>=.5-1e-8 or not 1<=tilt<=179:
        raise ValueError('褶宽、偏置或褶角越界。')
    p=np.roll(p,-base,axis=0);types=types[base:]+types[:base]
    if sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(p,np.roll(p,-1,axis=0)))<0:
        p=p[[0,3,2,1]];types=types[::-1]
    e=np.roll(p,-1,axis=0)-p
    turns=[math.atan2(e[i-1,0]*e[i,1]-e[i-1,1]*e[i,0],float(np.dot(e[i-1],e[i]))) for i in range(4)]
    if min(turns)<=1e-8 or max(turns)>=math.pi-1e-8:raise ValueError('外四边形必须严格凸。')
    rays=np.array([rotate(v,math.radians(tilt)) for v in e])
    a=p+e*((1-width)/2+offset);b=p+e*((1+width)/2+offset)
    q=np.array([intersect_lines(a[i],rays[i],b[i-1],rays[i-1]) for i in range(4)])
    original=q.tolist()
    x=intersect_lines(q[1],rotate(q[0]-q[1],turns[1]),b[1],rays[1])
    y=intersect_lines(q[3],rotate(q[0]-q[3],-turns[3]),a[2],rays[2])
    span=float(np.ptp(p,axis=0).max())
    if np.linalg.norm(x-y)<span*1e-8:
        from tessellation_tile_twist import polygon_pleat_tile
        fold,mother,detail=polygon_pleat_tile(p.tolist(),width,offset,tilt,types,not ccw,preserve_source=True)
        return fold,mother,{**detail,'split':False,'baseVertex':base,'initialCentralVertices':original,
                           'splitAssignmentMethod':'source-fixed-polygon-pleats-v1'}
    inside=np.vstack([q[0],q[1],x,q[3],y]);outer=np.array([point for row in zip(p,a,b) for point in row])
    coords=np.vstack([inside,outer]).tolist()
    links=[[0,1],[1,2],[2,4],[4,3],[3,0],[0,2],[0,4]]
    diagonals,split_angles=split_connection_types(q,b,connection)
    assignments=[types[0],types[1],connection,types[2],types[3],*diagonals]
    preferred=assignments.copy()
    opposite=lambda t:'V' if t=='M' else 'M'
    for i in range(4):
        links.extend([[4 if i==2 else i,6+3*i],[(i+1)%4,7+3*i]])
        pleat_types=[types[i],opposite(types[i])] if ccw else [opposite(types[i]),types[i]]
        assignments.extend(pleat_types)
        preferred.extend(pleat_types)
    links.extend([[5+i,5+(i+1)%12] for i in range(12)]);assignments.extend(['B']*12);preferred.extend(['B']*12)
    fold=make_fold(coords,links,assignments,planar_faces(coords,links))
    if check_geometry(fold)['status']!='passed':raise ValueError('该基点的分裂校正发生交叉，请选择相邻基点或调整褶参数。')
    local=check_local_conditions(fold)
    if local['oddDegreeVertices'] or local['kawasakiViolations']:raise ValueError('该基点没有满足平折角度条件的有效分裂，请选择相邻基点。')
    # All source assignments are fixed. The existing local solver is only
    # a validator here, including its minimum-sector M/V constraints; it
    # must not repair an incompatible input by choosing a different CP.
    fold=assign_local_mv(fold,preferred=preferred,preserve=True)
    if check_local_conditions(fold)['status']!='passed':raise ValueError('分裂后的中心边与连接赋型不满足局部平折条件。')
    mother=make_fold(p.tolist(),[[0,1],[1,2],[2,3],[3,0]],['B']*4,[[3,2,1,0]])
    return canonical_fold(fold),mother,{'split':True,'baseVertex':base,'connection':connection,'centralTypes':types,
        'width':width,'offset':offset,'pleatAngle':tilt,'initialCentralVertices':original,'centralVertices':inside.tolist(),
        'splitTwistAnglesDeg':list(map(math.degrees,split_angles)),
        'splitDiagonalTypes':diagonals,'splitAssignmentMethod':'directed-twist-angle-v1',
        'maxKawasakiErrorDeg':local['maxKawasakiErrorDeg']}
