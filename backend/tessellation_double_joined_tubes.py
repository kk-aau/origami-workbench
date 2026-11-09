"""Origamica In[3599] ``DoubleJoinedTubes`` with its same-index 3D state.

Each lower cross-section edge joins two upper edges by three isometric
triangles.  The top has twice the lower vertex count, exactly as in the
notebook; a flattened projection of the spatial form is never substituted
for the actual unfolded net.
"""

import math

import numpy as np
from scipy.optimize import root

from tessellation_twist_joined_tubes import _cross2, _finite_number
from tessellation_equilateral_ellipse import validate_joined_ellipse_source


def pleat_reduce_polygon(points, reduction=.5, direction='CCW'):
    """Original PleatReducePolygon In[466], useful for saved In[3600]."""
    vertices = np.asarray(points, dtype=float)
    r = _finite_number(reduction, '收缩比')
    if vertices.ndim != 2 or vertices.shape[1] != 2 or len(vertices) < 3 or not 0 < r < 1:
        raise ValueError('褶皱收缩需要至少三个二维点及 (0,1) 内的比例。')
    if direction not in ('CCW', 'CW'):
        raise ValueError('褶皱方向须为 CCW 或 CW。')
    next_vertices = np.roll(vertices, -1, axis=0)
    result = []
    if direction == 'CCW':
        for point, nxt in zip(vertices, next_vertices):
            result.extend([r*point, r*point + (1+r)/2*(nxt-point)])
        result = result[-1:] + result[:-1]
    else:
        for point, nxt in zip(vertices, next_vertices):
            result.extend([r*nxt + (1+r)/2*(point-nxt), r*nxt])
    return np.asarray(result).tolist()


def validate_double_joined_tube(data):
    allowed = {'family', 'bottomPoints', 'topPoints', 'verticalOffset',
               'tubeHeight', 'panelOverlap', 'typeMinimumAngleDeg',
               'typeMaximumAngleDeg', 'ellipseSource'}
    if not isinstance(data, dict) or data.get('family') != 'double-joined-tube' or set(data) - allowed:
        raise ValueError('双连接管包含不支持的参数。')
    rings = []
    for key in ('bottomPoints', 'topPoints'):
        ring = data.get(key)
        if not isinstance(ring, list) or not 3 <= len(ring) <= 96:
            raise ValueError('截面顶点数须在 3–96 之间。')
        points = []
        for point in ring:
            if not isinstance(point, (list, tuple)) or len(point) != 2:
                raise ValueError('截面顶点须为二维坐标。')
            xy = [_finite_number(value, '截面坐标') for value in point]
            if max(map(abs, xy)) > 10000:
                raise ValueError('截面坐标过大。')
            points.append(xy)
        rings.append(np.asarray(points, dtype=float))
    bottom, top = rings
    if len(bottom) > 48 or len(top) != 2*len(bottom):
        raise ValueError('上截面顶点数须恰为下截面的两倍。')
    lengths = [np.linalg.norm(np.roll(ring, -1, axis=0)-ring, axis=1)
               for ring in rings]
    if any(float(np.min(values)) < 1e-8 for values in lengths):
        raise ValueError('截面不能有重合的相邻顶点。')
    if abs(float(sum(lengths[0])-sum(lengths[1]))) > 1e-6:
        raise ValueError('上下截面的周长须相等（原版容差 10⁻⁶）。')
    dz = _finite_number(data.get('verticalOffset'), '上下截面高度偏移')
    height = _finite_number(data.get('tubeHeight', 1), '管段高度')
    if not 1e-5 <= dz <= 10000 or not 1e-5 <= height <= 10000:
        raise ValueError('上下截面高度偏移和管段高度须为正且不大于 10000。')
    overlap = data.get('panelOverlap', False)
    if type(overlap) is not bool:
        raise ValueError('拼接搭片开关须为布尔值。')
    minimum = _finite_number(data.get('typeMinimumAngleDeg', .5), '最小赋型折角')
    maximum = _finite_number(data.get('typeMaximumAngleDeg', 180), '最大赋型折角')
    if not 0 <= minimum <= maximum <= 180:
        raise ValueError('赋型折角范围须满足 0° ≤ 最小值 ≤ 最大值 ≤ 180°。')
    ellipse_source = validate_joined_ellipse_source(data['ellipseSource'], bottom, top, double=True) if 'ellipseSource' in data else None
    return {'family': 'double-joined-tube', 'bottomPoints': bottom.tolist(),
            'topPoints': top.tolist(), 'verticalOffset': dz, 'tubeHeight': height,
            'panelOverlap': overlap, 'typeMinimumAngleDeg': minimum,
            'typeMaximumAngleDeg': maximum,
            **({'ellipseSource': ellipse_source} if ellipse_source is not None else {})}


def double_joined_tube_geometry(data):
    params = validate_double_joined_tube(data)
    bottom = np.asarray(params['bottomPoints'])
    top = np.asarray(params['topPoints'])
    m = len(bottom)
    dz = params['verticalOffset']
    mm = m + int(params['panelOverlap'])
    bottom_lengths = np.linalg.norm(np.roll(bottom, -1, axis=0)-bottom, axis=1)
    top_lengths = np.linalg.norm(np.roll(top, -1, axis=0)-top, axis=1)
    bottom_x = np.r_[0., np.cumsum(np.tile(bottom_lengths, 2))]
    top_x = np.r_[0., np.cumsum(np.tile(top_lengths, 2))]
    scale = max(1., float(np.max(np.abs(bottom))), float(np.max(np.abs(top))),
                dz, params['tubeHeight'])

    # Original 3m+2 equations: three cross-ring distances per lower edge,
    # g[0] == 0, and mean(h)-mean(g) == dz.
    def residual(unknowns):
        g = unknowns[:m]
        h = unknowns[m:3*m]
        ox, oy = unknowns[-2:]
        lower0 = np.c_[bottom_x[:m], g]
        lower1 = np.c_[bottom_x[1:m+1], np.r_[g[1:], g[0]]]
        upper0 = np.c_[top_x[0:2*m:2]+ox, h[0::2]+oy]
        upper1 = np.c_[top_x[1:2*m:2]+ox, h[1::2]+oy]
        spatial_lower0 = np.c_[bottom, g]
        spatial_lower1 = np.c_[np.roll(bottom, -1, axis=0), np.roll(g, -1)]
        spatial_upper0 = np.c_[top[0::2], h[0::2]]
        spatial_upper1 = np.c_[top[1::2], h[1::2]]
        pairs = ((lower0, upper0, spatial_lower0, spatial_upper0),
                 (lower0, upper1, spatial_lower0, spatial_upper1),
                 (lower1, upper1, spatial_lower1, spatial_upper1))
        errors = [np.sum((a-b)**2, axis=1) - np.sum((c-d)**2, axis=1)
                  for a,b,c,d in pairs]
        return np.r_[*errors, g[0], np.mean(h)-np.mean(g)-dz]

    def positive_net(values):
        g, h = values[:m], values[m:3*m]
        ox, oy = values[-2:]
        for j in range(m):
            p0 = np.array([bottom_x[j], g[j]])
            p1 = np.array([bottom_x[j+1], g[(j+1)%m]])
            q0 = np.array([top_x[2*j]+ox, h[2*j]+oy])
            q1 = np.array([top_x[2*j+1]+ox, h[2*j+1]+oy])
            q2 = np.array([top_x[2*j+2]+ox, h[(2*j+2)%(2*m)]+oy])
            if any(_cross2(b-a, c-a) <= 1e-9 for a,b,c in
                   ((p0,p1,q1),(p0,q1,q0),(p1,q2,q1))):
                return False
        return True

    seeds = [np.full(3*m+2, .1)]
    for dx0 in (.1, -.1, .5, -.5):
        seeds.append(np.r_[np.zeros(m), np.full(2*m, dz), dx0, .1])
    solution = None
    for seed in seeds:
        attempt = root(residual, seed, method='hybr',
                       options={'xtol': 1e-11, 'maxfev': max(2000, 250*m)})
        values = attempt.x
        if (np.all(np.isfinite(values))
                and np.max(np.abs(residual(values))) <= 1e-8*scale**2
                and np.max(np.abs(values)) <= 1e5*scale
                and positive_net(values)):
            solution = values
            break
    if solution is None:
        raise ValueError('原版双连接管等距方程在此输入下没有找到可验证的实数解。')
    equation_error = float(np.max(np.abs(residual(solution))))
    g, h = solution[:m], solution[m:3*m]
    offset_x, offset_y = map(float, solution[-2:])
    lower_z = float(min(g)-params['tubeHeight'])
    upper_z = float(max(h)+params['tubeHeight'])

    # Row widths follow the source TGraph3D: m+1 lower, 2m+1 upper.
    lower_width, upper_width = mm+1, 2*mm+1
    flat, spatial = [], []
    for row in range(4):
        count = lower_width if row < 2 else upper_width
        for j in range(count):
            if row < 2:
                z = lower_z if row == 0 else g[j%m]
                flat.append([float(bottom_x[j]), float(z)])
                spatial.append([float(bottom[j%m,0]), float(bottom[j%m,1]), float(z)])
            else:
                z = h[j%(2*m)] if row == 2 else upper_z
                flat.append([float(top_x[j]+offset_x), float(z+offset_y)])
                spatial.append([float(top[j%(2*m),0]), float(top[j%(2*m),1]), float(z)])
    flat, spatial = np.asarray(flat), np.asarray(spatial)
    lower = lambda row,j: row*lower_width+j
    upper = lambda row,j: 2*lower_width+(row-2)*upper_width+j
    faces = []
    for j in range(mm):
        p0,p1 = lower(1,j),lower(1,j+1)
        q0,q1,q2 = upper(2,2*j),upper(2,2*j+1),upper(2,2*j+2)
        faces.extend([
            [lower(0,j),lower(0,j+1),p1,p0],
            [p0,p1,q1], [p0,q1,q0], [p1,q2,q1],
            [q0,q1,upper(3,2*j+1),upper(3,2*j)],
            [q1,q2,upper(3,2*j+2),upper(3,2*j+1)],
        ])
    face_error = 0.
    for face in faces:
        area = sum(_cross2(flat[face[k+1]]-flat[face[0]],
                           flat[face[k+2]]-flat[face[0]])
                   for k in range(len(face)-2))/2
        if area <= 1e-9:
            raise ValueError('双连接管展开图有翻转或退化面。')
        for i,a in enumerate(face):
            for b in face[i+1:]:
                face_error = max(face_error, abs(float(np.linalg.norm(flat[a]-flat[b])
                                                 -np.linalg.norm(spatial[a]-spatial[b]))))
    if face_error > 1e-7*scale:
        raise ValueError('双连接管三维面未通过与展开图的等距校验。')
    incidence, normals = {}, []
    for index,face in enumerate(faces):
        normal = np.cross(spatial[face[1]]-spatial[face[0]],
                          spatial[face[2]]-spatial[face[0]])
        magnitude = np.linalg.norm(normal)
        if magnitude < 1e-10:
            raise ValueError('双连接管三维面退化。')
        normals.append(normal/magnitude)
        for k,a in enumerate(face):
            b = face[(k+1)%len(face)]
            incidence.setdefault(tuple(sorted((a,b))),[]).append((index,a,b))
    edges, assignments, angles = [], [], []
    for edge, adjacent in incidence.items():
        edges.append(list(edge))
        if len(adjacent) == 1:
            assignments.append('B')
            angles.append(0.)
            continue
        if len(adjacent) != 2:
            raise ValueError('双连接管面拓扑含非流形边。')
        first,a,b = adjacent[0]
        second = adjacent[1][0]
        vector = spatial[b]-spatial[a]
        vector /= np.linalg.norm(vector)
        angle = -math.atan2(float(np.dot(vector,np.cross(normals[first],normals[second]))),
                            float(np.dot(normals[first],normals[second])))
        angle_deg = math.degrees(angle)
        if (abs(angle_deg) <= params['typeMinimumAngleDeg']
                or abs(angle_deg) > params['typeMaximumAngleDeg']):
            assignments.append('U')
        else:
            assignments.append('V' if angle > 0 else 'M')
        angles.append(angle_deg)
    return {
        'fold': {
            'vertices_coords': flat.tolist(), 'edges_vertices': edges,
            'edges_assignment': assignments, 'edges_foldAngle': angles,
            'faces_vertices': faces,
            'file_creator': '折纸工作台 / Origamica DoubleJoinedTubes reconstruction',
            'frame_description': '双连接管二维展开图及同索引三维静态构型。',
        },
        'source': {
            **({'ellipseSource': params['ellipseSource'], 'ellipseSourceVerified': True} if 'ellipseSource' in params else {}),
            'algorithm': 'Origamica DoubleJoinedTubes In[3599]',
            'output': 'tube-3d', 'spatialKind': 'origamica-double-joined-tube',
            'foldedForm3D': spatial.tolist(),
            'staticGlobalIsometryChecked': True,
            'maximumFaceDistanceError': face_error,
            'maximumEquationResidual': equation_error,
            'bottomJoinHeights': g.tolist(), 'topJoinHeights': h.tolist(),
            'netHorizontalOffset': offset_x, 'netVerticalOffset': offset_y,
            'bottomTubeLevel': lower_z, 'topTubeLevel': upper_z,
            'panelOverlap': params['panelOverlap'],
            'typeMinimumAngleDeg': params['typeMinimumAngleDeg'],
            'typeMaximumAngleDeg': params['typeMaximumAngleDeg'],
            'continuousRigidPathChecked': False, 'selfCollisionChecked': False,
        },
    }
