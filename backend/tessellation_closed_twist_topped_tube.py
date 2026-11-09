"""Origamica In[3565] ``ClosedTwistToppedTube`` with a real 3D cap.

The original constructs a cut cylindrical net, then solves the cap's q points
by two circle distances and its r points by a coplanarity/right-angle/radius
system.  Those are recovered here before optional twist extension is applied.
"""

import math

import numpy as np
from scipy.optimize import root

from tessellation_twist_joined_tubes import _cross2, _finite_number
from tessellation_equilateral_ellipse import validate_closed_ellipse_source


def validate_closed_twist_topped_tube(data):
    allowed = {'family', 'points', 'convergencePoint', 'twistNormal',
               'twistDirection', 'tubeHeight', 'panelOverlap', 'twistExtension',
               'typeMinimumAngleDeg', 'typeMaximumAngleDeg', 'ellipseSource'}
    if not isinstance(data, dict) or data.get('family') != 'closed-twist-topped-tube' or set(data)-allowed:
        raise ValueError('封顶扭转管包含不支持的参数。')
    points = data.get('points')
    if not isinstance(points, list) or not 3 <= len(points) <= 48:
        raise ValueError('管截面须有 3–48 个二维顶点。')
    clean_points = []
    for point in points:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            raise ValueError('截面顶点须为二维坐标。')
        xy = [_finite_number(value, '截面坐标') for value in point]
        if max(map(abs, xy)) > 10000:
            raise ValueError('截面坐标过大。')
        clean_points.append(xy)
    if any(math.dist(clean_points[j],clean_points[(j+1)%len(points)]) < 1e-8
           for j in range(len(points))):
        raise ValueError('截面不能有重合的相邻顶点。')
    center = data.get('convergencePoint', [0,0,0])
    direction = data.get('twistNormal', [0,0,1])
    if not isinstance(center,(list,tuple)) or len(center)!=3 or not isinstance(direction,(list,tuple)) or len(direction)!=3:
        raise ValueError('会聚点与扭转平面法向须为三维坐标。')
    center = [_finite_number(value,'会聚点坐标') for value in center]
    direction = [_finite_number(value,'扭转法向坐标') for value in direction]
    if max(map(abs,center+direction)) > 10000 or abs(direction[2]) < 1e-8:
        raise ValueError('会聚点或法向超出范围，且法向 z 分量不能为零。')
    height = _finite_number(data.get('tubeHeight',1),'管段高度')
    if not 1e-5 <= height <= 10000:
        raise ValueError('管段高度须为正且不大于 10000。')
    extension = _finite_number(data.get('twistExtension',0),'扭转延伸')
    if abs(extension) > 10000:
        raise ValueError('扭转延伸过大。')
    twist = data.get('twistDirection','CCW')
    overlap = data.get('panelOverlap',False)
    if twist not in ('CCW','CW') or type(overlap) is not bool:
        raise ValueError('扭转方向须为 CCW/CW，搭片开关须为布尔值。')
    minimum = _finite_number(data.get('typeMinimumAngleDeg',0),'最小赋型折角')
    maximum = _finite_number(data.get('typeMaximumAngleDeg',89),'最大赋型折角')
    if not 0 <= minimum <= maximum <= 180:
        raise ValueError('赋型折角范围须满足 0° ≤ 最小值 ≤ 最大值 ≤ 180°。')
    ellipse_source = validate_closed_ellipse_source(data['ellipseSource'], clean_points) if 'ellipseSource' in data else None
    return {'family':'closed-twist-topped-tube','points':clean_points,
            'convergencePoint':center,'twistNormal':direction,
            'twistDirection':twist,'tubeHeight':height,'panelOverlap':overlap,
            'twistExtension':extension,'typeMinimumAngleDeg':minimum,
            'typeMaximumAngleDeg':maximum,
            **({'ellipseSource': ellipse_source} if ellipse_source is not None else {})}


def _circle_intersection_above(a,b,ra,rb):
    side = b-a
    length = np.linalg.norm(side)
    along = (ra*ra-rb*rb+length*length)/(2*length)
    height_squared = ra*ra-along*along
    if height_squared <= 1e-10:
        raise ValueError('会聚点与截面不能形成非退化的展开扭转片。')
    unit = side/length
    return a+along*unit+math.sqrt(height_squared)*np.array([-unit[1],unit[0]])


def _unit(vector):
    magnitude = np.linalg.norm(vector)
    if magnitude < 1e-10:
        raise ValueError('扭转延伸方向退化。')
    return vector/magnitude


def closed_twist_topped_tube_geometry(data):
    params = validate_closed_twist_topped_tube(data)
    points = np.asarray(params['points'])
    center = np.asarray(params['convergencePoint'])
    direction = np.asarray(params['twistNormal'])
    m = len(points)
    ccw = params['twistDirection']=='CCW'
    mm = m+int(params['panelOverlap'])
    lengths = np.linalg.norm(np.roll(points,-1,axis=0)-points,axis=1)
    perimeter = float(sum(lengths))
    x = np.r_[0., np.cumsum(np.tile(lengths,2))]
    g = -(points@direction[:2])/direction[2]
    lower = float(min(g)-params['tubeHeight'])
    pflat = np.c_[x[:m],g]
    pspace = np.c_[points,g]
    qflat = []
    for j in range(m):
        j1=(j+1)%m
        p0=pflat[j]
        p1=np.array([x[j+1],g[j1]])
        d0=float(np.linalg.norm(center-pspace[j]))
        d1=float(np.linalg.norm(center-pspace[j1]))
        qflat.append(_circle_intersection_above(p0,p1,d0,d1))
    qflat=np.asarray(qflat)

    def q_at(index):
        turn,local=divmod(index,m)
        return qflat[local]+np.array([turn*perimeter,0])

    rflat=np.asarray([(q_at(j-1)+q_at(j))/2 for j in range(m)])
    rspace=[]
    rr_error=0.
    for j in range(m):
        prev=pspace[(j-1)%m] if ccw else pspace[(j+1)%m]
        current=pspace[j]
        plane_normal=np.cross(current-prev,center-prev)
        radius=np.linalg.norm(q_at(j-1)-q_at(j))/2
        def equations(v):
            v=np.asarray(v)
            return np.array([np.dot(v-prev,plane_normal),
                             np.dot(center-v,v-current),
                             np.dot(v-center,v-center)-radius*radius])
        seed=pspace[(j+1)%m] if ccw else pspace[(j-1)%m]
        attempt=root(equations,seed,method='hybr',options={'xtol':1e-12,'maxfev':1000})
        if not np.all(np.isfinite(attempt.x)):
            raise ValueError('扭转帽中间三维点没有有限实数解。')
        candidate=attempt.x
        axis=current-center
        axis_length=float(np.linalg.norm(axis))
        if axis_length>1e-10:
            # In[3565]'s coplanarity, right-angle and radius equations have
            # two roots, reflected across the center-to-p[j] line.  Its
            # FindRoot seed can select the wrong one for an equal-chord
            # ellipse even though both satisfy all three equations.  The
            # existing CP face fixes the branch by its opposite diagonal:
            # p[j-1]--r[j] for CCW, p[j+1]--r[j] for CW.  No crease is added.
            axis/=axis_length
            reflected=center+2*np.dot(candidate-center,axis)*axis-(candidate-center)
            target_index=(j-1)%m if ccw else (j+1)%m
            target_flat=pflat[target_index].copy()
            if ccw and j==0:
                target_flat[0]-=perimeter
            elif not ccw and j==m-1:
                target_flat[0]+=perimeter
            expected=float(np.linalg.norm(target_flat-rflat[j]))
            target_space=pspace[target_index]
            candidate=min((candidate,reflected),
                          key=lambda value: abs(float(np.linalg.norm(target_space-value))-expected))
        error=float(np.max(np.abs(equations(candidate))))
        rr_error=max(rr_error,error)
        if error > 1e-8*max(1.,float(np.linalg.norm(center)))**2:
            raise ValueError('扭转帽中间三维点未通过原版三方程。')
        rspace.append(candidate)
    rspace=np.asarray(rspace)
    qspace=np.tile(center,(m,1))

    extension=params['twistExtension']
    if extension:
        old_qflat=qflat.copy()
        old_qspace=qspace.copy()
        old_rflat=rflat.copy()
        old_rspace=rspace.copy()
        for j in range(m):
            p_index=j if ccw else (j+1)%m
            p2=pflat[j] if ccw else np.array([x[j+1],g[(j+1)%m]])
            qflat[j]=old_qflat[j]+extension*_unit(old_qflat[j]-p2)
            qspace[j]=old_qspace[j]+extension*_unit(old_qspace[j]-pspace[p_index])
            rflat[j]=old_rflat[j]+extension*_unit(old_rflat[j]-pflat[j])
            rspace[j]=old_rspace[j]+extension*_unit(old_rspace[j]-pspace[j])
        # The source explicitly sets qq[m]=qq[0] after extension.

    width=mm+1
    at=lambda row,j: row*width+j
    qstart=3*width
    flat=[]
    spatial=[]
    for row in range(3):
        for j in range(width):
            turn,local=divmod(j,m)
            if row==0:
                flat.append([float(x[j]),lower])
                spatial.append([float(points[local,0]),float(points[local,1]),lower])
            elif row==1:
                flat.append([float(x[j]),float(g[local])])
                spatial.append(pspace[local].tolist())
            else:
                flat.append((rflat[local]+np.array([turn*perimeter,0])).tolist())
                spatial.append(rspace[local].tolist())
    for j in range(mm):
        turn,local=divmod(j,m)
        flat.append((qflat[local]+np.array([turn*perimeter,0])).tolist())
        spatial.append(qspace[local].tolist())
    flat=np.asarray(flat)
    spatial=np.asarray(spatial)
    faces=[]
    for j in range(mm):
        p0,p1=at(1,j),at(1,j+1)
        r0,r1=at(2,j),at(2,j+1)
        q=qstart+j
        faces.append([at(0,j),at(0,j+1),p1,p0])
        if ccw:
            faces.append([p0,p1,r1,q])
            faces.append([p0,q,r0])
        else:
            faces.append([p0,p1,q,r0])
            faces.append([p1,r1,q])
    scale=max(1.,float(np.max(np.abs(spatial))),float(np.max(np.abs(flat))))
    face_error=0.
    for face in faces:
        area=sum(_cross2(flat[face[k+1]]-flat[face[0]],
                         flat[face[k+2]]-flat[face[0]])
                 for k in range(len(face)-2))/2
        if area<=1e-9:
            raise ValueError('扭转封顶展开图有翻转或退化面。')
        for i,a in enumerate(face):
            for b in face[i+1:]:
                face_error=max(face_error,abs(float(np.linalg.norm(flat[a]-flat[b])
                                               -np.linalg.norm(spatial[a]-spatial[b]))))
    if face_error>1e-7*scale:
        raise ValueError('扭转封顶三维面未通过与展开图的等距校验。')
    incidence,normals={},[]
    for face_index,face in enumerate(faces):
        normal=np.cross(spatial[face[1]]-spatial[face[0]],
                        spatial[face[2]]-spatial[face[0]])
        magnitude=np.linalg.norm(normal)
        if magnitude<1e-10:
            raise ValueError('扭转封顶三维面退化。')
        normals.append(normal/magnitude)
        for k,a in enumerate(face):
            b=face[(k+1)%len(face)]
            incidence.setdefault(tuple(sorted((a,b))),[]).append((face_index,a,b))
    edges,assignments,angles=[],[],[]
    for edge,adjacent in incidence.items():
        edges.append(list(edge))
        if len(adjacent)==1:
            assignments.append('B')
            angles.append(0.)
            continue
        if len(adjacent)!=2:
            raise ValueError('扭转封顶面拓扑含非流形边。')
        first,a,b=adjacent[0]
        second=adjacent[1][0]
        vector=spatial[b]-spatial[a]
        vector/=np.linalg.norm(vector)
        angle=-math.atan2(float(np.dot(vector,np.cross(normals[first],normals[second]))),
                          float(np.dot(normals[first],normals[second])))
        angle_deg=math.degrees(angle)
        # In[3565] seeds the cylindrical verticals, lower twist rim and
        # p-r connectors as M, and the p-q diagonals as V.  Its 89° maximum
        # deliberately preserves those types at nearly flat 180° folds.
        row_a,row_b=edge[0]//width,edge[1]//width
        if row_a==row_b==1 or (row_a,row_b) in ((0,1),(1,2)):
            original_type='M'
        elif row_a==1 and edge[1]>=qstart:
            original_type='V'
        else:
            original_type='U'
        if abs(angle_deg)<=params['typeMinimumAngleDeg']:
            assignment='U'
        elif abs(angle_deg)>params['typeMaximumAngleDeg']:
            assignment=original_type
        else:
            assignment='V' if angle>0 else 'M'
        # A flat fold has indistinguishable +180/-180 spatial normals.
        # In[3565] seeds M/V before TweakFoldAngles precisely to recover this
        # sign.  Keep the measured magnitude, but use the seeded sign there.
        if assignment in ('M','V') and (assignment=='M' and angle_deg>0 or
                                       assignment=='V' and angle_deg<0):
            if abs(abs(angle_deg)-180)>1e-6:
                raise ValueError('非平折角与原始山谷赋型冲突，无法保持真实三维折角。')
            angle_deg=math.copysign(abs(angle_deg),-1 if assignment=='M' else 1)
        assignments.append(assignment)
        angles.append(angle_deg)
    return {
        'fold':{
            'vertices_coords':flat.tolist(),'edges_vertices':edges,
            'edges_assignment':assignments,'edges_foldAngle':angles,
            'faces_vertices':faces,
            'file_creator':'折纸工作台 / Origamica ClosedTwistToppedTube reconstruction',
            'frame_description':'扭转封顶管二维展开图及同索引三维静态构型。',
        },
        'source':{
            **({'ellipseSource': params['ellipseSource'], 'ellipseSourceVerified': True} if 'ellipseSource' in params else {}),
            'algorithm':'Origamica ClosedTwistToppedTube In[3565]',
            'output':'tube-3d','spatialKind':'origamica-closed-twist-topped-tube',
            'foldedForm3D':spatial.tolist(),
            'staticGlobalIsometryChecked':True,
            'maximumFaceDistanceError':face_error,
            'maximumIntermediateEquationResidual':rr_error,
            'lowerTubeLevel':lower,'twistPlaneHeights':g.tolist(),
            'panelOverlap':params['panelOverlap'],
            'typeMinimumAngleDeg':params['typeMinimumAngleDeg'],
            'typeMaximumAngleDeg':params['typeMaximumAngleDeg'],
            'continuousRigidPathChecked':False,'selfCollisionChecked':False,
        },
    }
