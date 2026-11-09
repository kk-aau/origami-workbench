"""Independent Brocard geometry from equal-angle rays and the sine rule.

For the triangle O,V_i,V_(i+1), the angles at its vertices are omega and
theta_(i+1)-omega. Thus r_(i+1)/r_i=sin(omega)/sin(theta_(i+1)-omega).
The product of all radial ratios is one; their central angles sum to 2*pi.
This scalar closure determines the polygon, without importing notebook code.
"""
import math
import numpy as np
from scipy.optimize import brentq, least_squares


def corner_angles(values):
    """The final angle is determined by planar closure, as in the input contract."""
    if not isinstance(values, list) or not 3 <= len(values) <= 12:
        raise ValueError('Brocard 多边形需要 3–12 个内角。')
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in values):
        raise ValueError('Brocard 内角必须为有限数字。')
    angles = [float(v) for v in values[:-1]]
    angles.append((len(values)-2)*180-sum(angles))
    if any(not 1 <= v <= 179 for v in angles):
        raise ValueError('每个内角须在 1°–179° 之间，末角由内角和确定。')
    return angles


def _radial_polygon(angles):
    angles = np.radians(angles)
    def closure(omega):
        return float(np.log(np.sin(angles-omega)).sum()-len(angles)*math.log(math.sin(omega)))
    omega = brentq(closure, 1e-12, min(float(angles.min()), math.pi/2)-1e-12, xtol=1e-14)
    points = [[1., 0.]]
    radius, direction = 1., 0.
    for theta in angles[1:]:
        radius *= math.sin(omega)/math.sin(theta-omega)
        direction += math.pi-theta
        points.append([radius*math.cos(direction), radius*math.sin(direction)])
    return np.array(points), omega


def brocard_polygon(values, clockwise=False):
    """Return a CCW unit-first-edge polygon and its selected Brocard point.

    CW selects the other equal-angle ray family while preserving vertex IDs
    and requested corner order. Both positive geometric omega and the original
    direction-dependent angle (omega or 180-omega) are explicit.
    """
    if not isinstance(clockwise, bool):
        raise ValueError('Brocard 方向必须是布尔值。')
    angles = corner_angles(values)
    ordered = [angles[0], *angles[:0:-1]] if clockwise else angles
    points, omega = _radial_polygon(ordered)
    if clockwise:
        points = np.vstack([points[0], points[:0:-1]])
        points[:, 1] *= -1
    origin = points[0].copy()
    edge = points[1]-origin
    length = np.linalg.norm(edge)
    c, s = edge/length
    rotation = np.array([[c, s], [-s, c]])
    points = (points-origin) @ rotation.T / length
    center = -origin @ rotation.T / length
    return {'vertices': points.tolist(), 'center': center.tolist(), 'angles': angles,
            'omega': math.degrees(omega), 'angle': 180-math.degrees(omega) if clockwise else math.degrees(omega),
            'clockwise': clockwise}


def _circle(points):
    center = points.mean(axis=0)
    unit = max(float(np.ptp(points, axis=0).max()), 1e-12)
    p = (points-center)/unit
    squared = np.sum(p*p, axis=1)
    solution = np.linalg.lstsq(np.column_stack([2*p, np.ones(len(p))]), squared, rcond=None)[0]
    residual = squared-2*p @ solution[:2]-solution[2]
    radius = math.sqrt(max(0., solution[2]+np.dot(solution[:2], solution[:2])))
    return center+unit*solution[:2], unit*radius, residual


def cyclic_brocard_polygon(sides, angle1, angle2, index1=0, index2=1, clockwise=False):
    """Solve the circle and equal-ray-angle constraints for two given corners."""
    if isinstance(sides, bool) or not isinstance(sides, int) or not 3 <= sides <= 12:
        raise ValueError('圆内接 Brocard 多边形需要 3–12 个顶点。')
    if any(isinstance(i, bool) or not isinstance(i, int) or not 0 <= i < sides for i in (index1,index2)) or index1 == index2:
        raise ValueError('请指定两个不同且有效的内角位置。')
    if any(isinstance(v, bool) or not isinstance(v, (int,float)) or not math.isfinite(v) or not 1 <= v <= 179 for v in (angle1,angle2)):
        raise ValueError('指定内角须在 1°–179° 之间。')
    free = [i for i in range(sides) if i not in (index1,index2)]
    total = (sides-2)*180
    remaining = (total-angle1-angle2)/len(free)
    if not 1 <= remaining <= 179:
        raise ValueError('两个指定内角不能组成凸圆内接多边形。')
    def complete(x):
        values = np.zeros(sides)
        values[index1], values[index2] = angle1, angle2
        values[free] = x
        return values
    def residual(x):
        values = complete(x)
        points, _ = _radial_polygon(values)
        circle = _circle(points)[2]
        return np.r_[circle, (values.sum()-total)/180]
    solved = least_squares(residual, np.full(len(free),remaining), bounds=(1.,179.),
                           ftol=1e-13, xtol=1e-13, gtol=1e-13, max_nfev=800)
    if np.max(np.abs(residual(solved.x))) > 1e-8:
        raise ValueError('这些内角和位置没有找到有效的圆内接 Brocard 多边形。')
    angles = complete(solved.x).tolist()
    info = brocard_polygon(angles, clockwise)
    if max(abs(info['angles'][i]-v) for i,v in ((index1,angle1),(index2,angle2))) > 1e-5:
        raise ValueError('圆内接 Brocard 内角闭合精度不足。')
    center, radius, error = _circle(np.array(info['vertices']))
    if np.max(np.abs(error)) > 1e-8:
        raise ValueError('圆内接 Brocard 共圆精度不足。')
    return {**info, 'circumcenter':center.tolist(), 'circumradius':radius}


def brocard_triangle(vertices, clockwise=False):
    """Keep a supplied triangle in place and solve its selected equal-angle rays."""
    if not isinstance(vertices,list) or len(vertices)!=3 or any(not isinstance(p,list) or len(p)!=2 or any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) or abs(x)>1e6 for x in p) for p in vertices):
        raise ValueError('Brocard 三角形需要三个有效二维点。')
    points = np.array(vertices,dtype=float)
    a,b=points[1]-points[0],points[2]-points[0]
    area = float(a[0]*b[1]-a[1]*b[0])
    if abs(area) < 1e-10:
        raise ValueError('Brocard 三角形顶点不能共线或重合。')
    reversed_order = area < 0
    if reversed_order:
        points = points[[0,2,1]]
    angles=[]
    for i in range(3):
        a,b=points[(i-1)%3]-points[i],points[(i+1)%3]-points[i]
        angles.append(math.degrees(math.acos(float(np.clip(np.dot(a,b)/(np.linalg.norm(a)*np.linalg.norm(b)),-1,1)))))
    info=brocard_polygon(angles,clockwise)
    edge=points[1]-points[0]
    x,y=info['center']
    center=points[0]+x*edge+y*np.array([-edge[1],edge[0]])
    if reversed_order:
        angles=[angles[0],angles[2],angles[1]]
    return {**info,'vertices':[p.copy() for p in vertices],'center':center.tolist(),'angles':angles}


def closed_back_twist(info, scale=.5):
    """Reflecting a pleat in a polygon edge aims it at the Brocard point.

    Existing polygon_twist measures its pleat direction from the edge normal,
    hence the exact conversion is 90-omega, with reversed chirality for CW.
    """
    from tessellation_patterns import polygon_twist, make_fold, canonical_fold
    if isinstance(scale,bool) or not isinstance(scale,(int,float)) or not math.isfinite(scale) or not .2 <= scale <= .85:
        raise ValueError('Brocard 内接比例须在 0.2–0.85 之间。')
    points=np.array(info['vertices'])
    center=(points.min(axis=0)+points.max(axis=0))/2
    unit=2/float(np.ptp(points,axis=0).max())
    shape=(points-center)*unit
    if sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(shape,np.roll(shape,-1,axis=0)))<0:
        shape=shape[[0,*range(len(shape)-1,0,-1)]]
    pleat_angle=(90-info['omega'])*(-1 if info['clockwise'] else 1)
    fold=polygon_twist(len(points),pleat_angle,scale,polygon=shape.tolist())
    border=make_fold((shape*scale).tolist(),[[i,(i+1)%len(points)] for i in range(len(points))],['B']*len(points),[list(range(len(points)-1,-1,-1))])
    details={**info,'vertices':((points-center)*unit*scale).tolist(),'center':((np.array(info['center'])-center)*unit*scale).tolist(),'pleatAngle':pleat_angle}
    if 'circumcenter' in info:
        details.update(circumcenter=((np.array(info['circumcenter'])-center)*unit*scale).tolist(),circumradius=info['circumradius']*unit*scale)
    return canonical_fold(fold),border,details


KINDS=('angles','cyclic','triangle','trapezoid','parallelogram','triangle-vertices','cyclic-offset')


def validate_brocard(data):
    from tessellation_advanced import number, points
    kind=data.get('kind','triangle')
    if not isinstance(kind,str) or kind not in KINDS:
        raise ValueError('Brocard 构造类型无效。')
    fields={'angles':{'angles'},'cyclic':{'sides','angle1','angle2','index1','index2'},
            'cyclic-offset':{'sides','angle1','angle2','index1','index2','width','offset','centralTypes'},
            'triangle':{'angle1','angle2'},'trapezoid':{'baseAngle'},
            'parallelogram':{'baseAngle'},'triangle-vertices':{'vertices'}}
    shared={'family','kind','clockwise'}|({'scale'} if kind!='cyclic-offset' else set())
    if set(data)-shared-fields[kind]:
        raise ValueError('含当前 Brocard 构造不支持的参数。')
    clockwise=data.get('clockwise',False)
    if not isinstance(clockwise,bool):raise ValueError('Brocard 方向必须是布尔值。')
    out={'family':'brocard','kind':kind,'clockwise':clockwise}
    if kind!='cyclic-offset':out['scale']=number(data,'scale',.5,.2,.85)
    if kind=='angles':out['angles']=corner_angles(data.get('angles',[90,90,90,90]))
    elif kind in ('trapezoid','parallelogram'):
        out['baseAngle']=number(data,'baseAngle',65,1,179)
    elif kind=='triangle-vertices':
        out['vertices']=points(data.get('vertices',[[0,0],[1,0],[.3,.8]]),-10,10,3,3)
        brocard_triangle(out['vertices'],clockwise)
    else:
        out.update(angle1=number(data,'angle1',60 if kind=='triangle' else 90 if kind=='cyclic-offset' else 100,1,179),angle2=number(data,'angle2',65 if kind=='triangle' else 90 if kind=='cyclic-offset' else 110,1,179))
        if kind=='triangle':corner_angles([out['angle1'],out['angle2'],0])
        else:
            sides=number(data,'sides',4 if kind=='cyclic-offset' else 5,3,12,True)
            out.update(sides=sides,index1=number(data,'index1',0,0,sides-1,True),index2=number(data,'index2',1,0,sides-1,True))
            if out['index1']==out['index2']:raise ValueError('两个内角位置不能相同。')
            if kind=='cyclic-offset':
                out.update(width=number(data,'width',.5,.05,.8),offset=number(data,'offset',.08,-.4,.4))
                if abs(out['offset'])+out['width']/2>=.5-1e-8:raise ValueError('褶宽和偏置越过单元边界。')
                types=data.get('centralTypes',['M']*sides)
                if not isinstance(types,list) or len(types)!=sides or any(t not in ('M','V') for t in types):raise ValueError('每条中心边须指定山折或谷折。')
                out['centralTypes']=types.copy()
    return out


def construct_brocard(params):
    kind=params['kind'];cw=params['clockwise']
    if kind=='triangle-vertices':info=brocard_triangle(params['vertices'],cw)
    elif kind in ('cyclic','cyclic-offset'):
        info=cyclic_brocard_polygon(params['sides'],params['angle1'],params['angle2'],params['index1'],params['index2'],cw)
    else:
        if kind=='angles':angles=params['angles']
        elif kind=='triangle':angles=[params['angle1'],params['angle2'],0]
        else:
            a=params['baseAngle']
            angles=[a,a,180-a,180-a] if kind=='trapezoid' else [a,180-a,a,180-a]
        info=brocard_polygon(angles,cw)
    if kind=='cyclic-offset':
        from tessellation_tile_twist import polygon_pleat_tile
        fold,mother,details=polygon_pleat_tile(info['vertices'],params['width'],params['offset'],central_types=params['centralTypes'],clockwise=cw)
        return fold,mother,None,1,{'name':'折纸工作台','license':'GPL-3.0-only',
            'algorithm':'cyclic Brocard / perpendicular offset pleats','version':1,'brocard':{**info,**details}}
    fold,mother,details=closed_back_twist(info,params['scale'])
    return fold,mother,None,1,{'name':'折纸工作台','license':'GPL-3.0-only',
        'algorithm':'Brocard equal-angle closure / closed-back twist','version':1,'brocard':details}
