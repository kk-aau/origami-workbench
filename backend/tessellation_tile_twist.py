"""Tile-edge pleats, independently constructed by intersecting directed lines.

Each outer edge is cut at (1-w)/2+d and (1+w)/2+d. Adjacent inward
pleat rays meet at the central polygon. Unlike translating a polygon twist,
this keeps the fractional border width and pleat direction exact.
"""
import math
import numpy as np
from tessellation_patterns import make_fold,planar_faces,canonical_fold


def validate_polygon_tile(data):
    from tessellation_advanced import number,points
    variant=data.get('variant','centered')
    fields={'general':{'offset','tilt','ccw'},'centered':{'tilt'},'centered-angle':{'twistAngle'},'offset':{'offset'}}
    if not isinstance(variant,str) or variant not in fields:raise ValueError('精确多边形扭转变体无效。')
    if set(data)-{'family','variant','polygon','width','centralTypes'}-fields[variant]:raise ValueError('含当前多边形变体不支持的参数。')
    out={'family':'polygon-tile','variant':variant,'polygon':points(data.get('polygon',[[0,0],[1,0],[1,1],[0,1]]),-10,10,3,24,relative_distance=True),'width':number(data,'width',.3,.05,.8)}
    types=data.get('centralTypes',['M']*len(out['polygon']))
    if not isinstance(types,list) or len(types)!=len(out['polygon']) or any(t not in ('M','V') for t in types):raise ValueError('每条中心边须指定山折或谷折。')
    out['centralTypes']=types.copy()
    if variant in ('general','offset'):out['offset']=number(data,'offset',.08 if variant=='offset' else 0,-.4,.4)
    if variant in ('general','centered'):out['tilt']=number(data,'tilt',70,1,179)
    if variant=='centered-angle':out['twistAngle']=number(data,'twistAngle',35,1,179)
    if variant=='general':
        if not isinstance(data.get('ccw',True),bool):raise ValueError('赋型方向必须是布尔值。')
        out['ccw']=data.get('ccw',True)
    if abs(out.get('offset',0))+out['width']/2>=.5-1e-8:raise ValueError('褶宽与偏置越过单元边界。')
    return out


def construct_polygon_tile(params):
    from tessellation_split_exact import centered_tilt
    variant=params['variant'];offset=params.get('offset',0.)
    tilt=centered_tilt(params['width'],params['twistAngle']) if variant=='centered-angle' else 90. if variant=='offset' else params['tilt']
    ccw=params['ccw'] if variant=='general' else offset>0 if variant=='offset' else tilt<90
    fold,mother,details=polygon_pleat_tile(params['polygon'],params['width'],offset,tilt,
                                        params['centralTypes'],not ccw,preserve_source=True)
    return fold,mother,None,1,{'name':'折纸工作台','license':'GPL-3.0-only','algorithm':'exact polygon tile / directed pleat intersections','version':1,'variant':variant,'ccw':ccw,**details}


def polygon_pleat_tile(vertices,width,offset=0.,tilt=90.,central_types=None,clockwise=False,*,preserve_source=False):
    p=np.asarray(vertices,dtype=float);n=len(p)
    if n<3 or n>24 or p.shape!=(n,2) or not np.isfinite(p).all():raise ValueError('需要 3–24 个有效多边形顶点。')
    span=float(np.ptp(p,axis=0).max())
    if not math.isfinite(span) or span<=0:raise ValueError('单元范围必须有限且不能退化。')
    # Normalize once: a computed unit span may differ from 1 by one ULP.
    # A recursive threshold test would unnecessarily repeat the transform.
    if span<1.:
        origin=p[0].copy()
        fold,mother,details=_polygon_pleat_tile_unit(((p-origin)/span).tolist(),width,
                                                    offset,tilt,central_types,clockwise,preserve_source)
        restore=lambda ps:(np.asarray(ps)*span+origin).tolist()
        fold={**fold,'vertices_coords':restore(fold['vertices_coords'])}
        mother={**mother,'vertices_coords':restore(mother['vertices_coords'])}
        return fold,mother,{**details,'centralVertices':restore(details['centralVertices'])}
    return _polygon_pleat_tile_unit(vertices,width,offset,tilt,central_types,clockwise,preserve_source)


def _polygon_pleat_tile_unit(vertices,width,offset,tilt,central_types,clockwise,preserve_source=False):
    from tessellate import check_geometry,check_local_conditions
    from tessellation_advanced import assign_local_mv
    if any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) for x in (width,offset,tilt)):
        raise ValueError('褶宽、偏置和褶角必须是有限数字。')
    if not .05<=width<=.8 or abs(offset)+width/2>=.5-1e-8 or not 1<=tilt<=179:
        raise ValueError('褶宽或偏置越过单元边界，请减小褶宽或偏置。')
    p=np.array(vertices,dtype=float);n=len(p)
    if n<3 or n>24 or p.shape!=(n,2) or not np.isfinite(p).all():raise ValueError('需要 3–24 个有效多边形顶点。')
    assignments=list(central_types) if central_types is not None else ['M']*n
    if len(assignments)!=n or any(a not in ('M','V') for a in assignments):raise ValueError('每条中心边须指定山折或谷折。')
    if sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(p,np.roll(p,-1,axis=0)))<0:
        p=p[[0,*range(n-1,0,-1)]];assignments=assignments[::-1]
    e=np.roll(p,-1,axis=0)-p
    if min(np.linalg.norm(e,axis=1))<1e-8:raise ValueError('单元边不能退化。')
    delta=p[None,:,:]-p[:,None,:]
    cross=e[:,None,0]*delta[:,:,1]-e[:,None,1]*delta[:,:,0]
    if np.min(cross)<-1e-8:raise ValueError('单元须为凸多边形。')
    theta=math.radians(tilt);c,s=math.cos(theta),math.sin(theta)
    direction=e@np.array([[c,s],[-s,c]])
    a=p+e*((1-width)/2+offset);b=p+e*((1+width)/2+offset)
    inner=[]
    for i in range(n):
        j=(i-1)%n
        matrix=np.column_stack([direction[i],-direction[j]])
        if abs(np.linalg.det(matrix))<1e-10:raise ValueError('相邻边不能共线。')
        t,u=np.linalg.solve(matrix,b[j]-a[i])
        if min(t,u)<=1e-8:raise ValueError('褶线交点越过单元边界，请调整褶宽或偏置。')
        inner.append(a[i]+t*direction[i])
    coords=np.vstack([inner,np.array([point for row in zip(p,a,b) for point in row])]).tolist()
    links=([[i,(i+1)%n] for i in range(n)]+[[i,n+3*i+1] for i in range(n)]+
           [[(i+1)%n,n+3*i+2] for i in range(n)]+[[n+i,n+(i+1)%(3*n)] for i in range(3*n)])
    opposite=lambda kind:'V' if kind=='M' else 'M'
    first=[opposite(kind) if clockwise else kind for kind in assignments]
    second=[opposite(kind) for kind in first]
    pleats=first+second if preserve_source else ['U']*(2*n)
    fold=make_fold(coords,links,assignments+pleats+['B']*(3*n),planar_faces(coords,links))
    if check_geometry(fold)['status']!='passed':raise ValueError('偏置使中心多边形或褶线相交，请减小偏置或增大褶宽。')
    local=check_local_conditions(fold)
    if local['oddDegreeVertices'] or local['kawasakiViolations']:
        raise ValueError('该多边形和褶参数不满足局部平折角度条件。')
    preferred=assignments+(['V']*n+['M']*n if clockwise else ['M']*n+['V']*n)+['B']*(3*n)
    fold=assign_local_mv(fold,preferred=preferred,preserve=True)
    if check_local_conditions(fold)['status']!='passed':raise ValueError('中心边赋型无法满足局部平折条件。')
    mother=make_fold(p.tolist(),[[i,(i+1)%n] for i in range(n)],['B']*n,[list(range(n-1,-1,-1))])
    return canonical_fold(fold),mother,{'centralVertices':np.array(inner).tolist(),'width':width,'offset':offset,'pleatAngle':tilt,'centralTypes':assignments}
