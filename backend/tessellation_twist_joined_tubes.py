"""Origamica In[3583] ``TwistJoinedTubes``: a real spatial tube and its net.

The four vertex rows are bottom rim, lower join, upper join, and top rim.
The lower/upper join heights and the net's two offsets solve the same 2m+2
isometry/centering equations as the notebook.  The output retains separate
vertices at the cut seam, exactly as its unwrapped crease graph does.
"""

import math

import numpy as np
from scipy.optimize import root
from tessellation_equilateral_ellipse import validate_joined_ellipse_source


def _finite_number(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f'{label}须为有限数值。')
    return float(value)


def validate_twist_joined_tube(data):
    """Validate the geometric arguments, keeping the notebook's perimeter rule."""
    allowed = {'family', 'bottomPoints', 'topPoints', 'verticalOffset',
               'twistDirection', 'tiltAxialAngleDeg', 'tiltAzimuthalAngleDeg',
               'tubeHeight', 'panelOverlap', 'typeMinimumAngleDeg',
               'typeMaximumAngleDeg', 'ellipseSource'}
    if not isinstance(data, dict) or data.get('family') != 'twist-joined-tube' or set(data) - allowed:
        raise ValueError('扭转连接管包含不支持的参数。')
    rings = []
    for key in ('bottomPoints', 'topPoints'):
        ring = data.get(key)
        if not isinstance(ring, list) or not 3 <= len(ring) <= 48:
            raise ValueError('管的每个截面须有 3–48 个二维顶点。')
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
    if len(bottom) != len(top):
        raise ValueError('上下截面顶点数须相同。')
    lengths = [np.linalg.norm(np.roll(ring, -1, axis=0) - ring, axis=1)
               for ring in rings]
    if any(np.min(item) < 1e-8 for item in lengths):
        raise ValueError('截面不能有重合的相邻顶点。')
    if abs(float(sum(lengths[0]) - sum(lengths[1]))) > 1e-6:
        raise ValueError('上下截面的周长须相等（原版容差 10⁻⁶）。')
    dz = _finite_number(data.get('verticalOffset'), '上下截面高度偏移')
    if not 1e-5 <= dz <= 10000:
        raise ValueError('上下截面高度偏移须为正且不大于 10000。')
    height = _finite_number(data.get('tubeHeight', 1), '管段高度')
    if not 1e-5 <= height <= 10000:
        raise ValueError('管段高度须为正且不大于 10000。')
    axial = _finite_number(data.get('tiltAxialAngleDeg', 0), '倾斜轴角')
    azimuthal = _finite_number(data.get('tiltAzimuthalAngleDeg', 0), '倾斜角')
    if not -360 <= axial <= 360 or not -89 <= azimuthal <= 89:
        raise ValueError('倾斜轴角须在 ±360° 内，倾斜角须在 ±89° 内。')
    direction = data.get('twistDirection', 'CCW')
    if direction not in ('CCW', 'CW'):
        raise ValueError('扭转方向须为 CCW 或 CW。')
    overlap = data.get('panelOverlap', False)
    if type(overlap) is not bool:
        raise ValueError('拼接搭片开关须为布尔值。')
    minimum_angle = _finite_number(data.get('typeMinimumAngleDeg', .5), '最小赋型折角')
    maximum_angle = _finite_number(data.get('typeMaximumAngleDeg', 180), '最大赋型折角')
    if not 0 <= minimum_angle <= maximum_angle <= 180:
        raise ValueError('赋型折角范围须满足 0° ≤ 最小值 ≤ 最大值 ≤ 180°。')
    ellipse_source = validate_joined_ellipse_source(data['ellipseSource'], bottom, top) if 'ellipseSource' in data else None
    return {'family': 'twist-joined-tube', 'bottomPoints': bottom.tolist(),
            'topPoints': top.tolist(), 'verticalOffset': dz,
            'twistDirection': direction, 'tiltAxialAngleDeg': axial,
            'tiltAzimuthalAngleDeg': azimuthal, 'tubeHeight': height,
            'panelOverlap': overlap, 'typeMinimumAngleDeg': minimum_angle,
            'typeMaximumAngleDeg': maximum_angle,
            **({'ellipseSource': ellipse_source} if ellipse_source is not None else {})}


def _rotation(axis_angle_deg, tilt_deg):
    axis_angle = math.radians(axis_angle_deg)
    axis = np.array([math.cos(axis_angle), math.sin(axis_angle), 0.0])
    angle = math.radians(tilt_deg)
    skew = np.array([[0., -axis[2], axis[1]],
                     [axis[2], 0., -axis[0]],
                     [-axis[1], axis[0], 0.]])
    return np.eye(3) + math.sin(angle) * skew + (1-math.cos(angle)) * (skew @ skew)


def _cross2(a, b):
    return float(a[0]*b[1] - a[1]*b[0])


def twist_joined_tube_geometry(data):
    """Return a FOLD net plus same-index xyz mesh; raise on nonisometric roots.

    This is one *static* 3D state.  No continuous folding or self-intersection
    claim is made; the original likewise does not check self-intersection.
    """
    params = validate_twist_joined_tube(data)
    bottom = np.asarray(params['bottomPoints'])
    top = np.asarray(params['topPoints'])
    m = len(bottom)
    dz = params['verticalOffset']
    th = params['tubeHeight']
    ccw = params['twistDirection'] == 'CCW'
    mm = m + int(params['panelOverlap'])
    rotation = _rotation(params['tiltAxialAngleDeg'], params['tiltAzimuthalAngleDeg'])
    lengths_bottom = np.linalg.norm(np.roll(bottom, -1, axis=0) - bottom, axis=1)
    lengths_top = np.linalg.norm(np.roll(top, -1, axis=0) - top, axis=1)
    x_bottom = np.r_[0., np.cumsum(np.tile(lengths_bottom, 2))]
    x_top = np.r_[0., np.cumsum(np.tile(lengths_top, 2))]
    # Original ppavg.z == -dz/2 and qqavg.tz == dz/2; rotation preserves
    # the latter dot product, leaving the average of h exactly dz/2.
    def residual(unknowns):
        g, h = unknowns[:m], unknowns[m:2*m]
        offset_x, offset_y = unknowns[-2:]
        flat_bottom = np.c_[x_bottom[:m], g]
        flat_top = np.c_[x_top[:m] + offset_x, h + offset_y]
        spatial_bottom = np.c_[bottom, g]
        spatial_top = np.c_[top, h] @ rotation.T
        direct_flat = flat_bottom - flat_top
        direct_3d = spatial_bottom - spatial_top
        if ccw:
            diagonal_flat = flat_bottom - np.c_[x_top[1:m+1] + offset_x,
                                                np.r_[h[1:], h[0]] + offset_y]
            diagonal_3d = spatial_bottom - np.c_[np.roll(top, -1, axis=0),
                                                  np.roll(h, -1)] @ rotation.T
        else:
            diagonal_flat = np.c_[x_bottom[1:m+1], np.r_[g[1:], g[0]]] - flat_top
            diagonal_3d = np.c_[np.roll(bottom, -1, axis=0), np.roll(g, -1)] - spatial_top
        return np.r_[np.sum(direct_flat**2, axis=1) - np.sum(direct_3d**2, axis=1),
                     np.sum(diagonal_flat**2, axis=1) - np.sum(diagonal_3d**2, axis=1),
                     np.mean(g) + dz/2, np.mean(h) - dz/2]

    scale = max(1., float(np.max(np.abs(bottom))), float(np.max(np.abs(top))), dz, th)

    def positive_net(unknowns):
        g0, h0 = unknowns[:m], unknowns[m:2*m]
        ox, oy = unknowns[-2:]
        for j in range(m):
            j1 = (j+1) % m
            p0 = np.array([x_bottom[j], g0[j]])
            p1 = np.array([x_bottom[j+1], g0[j1]])
            q0 = np.array([x_top[j]+ox, h0[j]+oy])
            q1 = np.array([x_top[j+1]+ox, h0[j1]+oy])
            triangles = ((p0,p1,q1),(p0,q1,q0)) if ccw else ((p0,p1,q0),(p1,q1,q0))
            if any(_cross2(b-a, c-a) <= 1e-9 for a,b,c in triangles):
                return False
        return True

    # Mathematica seeds all variables at .1.  Some valid CW examples have
    # another nearby algebraic root whose net is inverted, so retry from
    # centered tube heights and retain only the physical positive net.
    seeds = [np.full(2*m+2, .1)]
    for dx0 in (.1, -.1, .5, -.5):
        seeds.append(np.r_[np.full(m, -dz/2), np.full(m, dz/2), dx0, .1])
    solution = None
    for seed in seeds:
        attempt = root(residual, seed, method='hybr',
                       options={'xtol': 1e-11, 'maxfev': max(2000, 250*m)})
        candidate = attempt.x
        if (np.all(np.isfinite(candidate))
                and np.max(np.abs(residual(candidate))) <= 1e-8 * scale**2
                and np.max(np.abs(candidate)) <= 1e5 * scale
                and positive_net(candidate)):
            solution = candidate
            break
    if solution is None:
        raise ValueError('原版管状等距方程在此输入下没有找到可验证的实数解。')
    residual_error = float(np.max(np.abs(residual(solution))))
    g, h = solution[:m], solution[m:2*m]
    offset_x, offset_y = map(float, solution[-2:])
    lower_z = float(min(g) - th)
    upper_z = float(max(h) + th)

    # The notebook uses mm+1 nodes in every row: m+1 for the slit, one
    # additional panel when PanelOverlap -> True.
    flat_rows, spatial_rows = [], []
    for row in range(4):
        flat_row, spatial_row = [], []
        for j in range(mm+1):
            index = j % m
            if row == 0:
                flat = (x_bottom[j], lower_z)
                spatial = (*bottom[index], lower_z)
            elif row == 1:
                flat = (x_bottom[j], g[index])
                spatial = (*bottom[index], g[index])
            elif row == 2:
                flat = (x_top[j] + offset_x, h[index] + offset_y)
                spatial = rotation @ np.r_[top[index], h[index]]
            else:
                flat = (x_top[j] + offset_x, upper_z + offset_y)
                spatial = rotation @ np.r_[top[index], upper_z]
            flat_row.append([float(value) for value in flat])
            spatial_row.append([float(value) for value in spatial])
        flat_rows.append(flat_row)
        spatial_rows.append(spatial_row)
    flat = np.asarray([point for row in flat_rows for point in row])
    spatial = np.asarray([point for row in spatial_rows for point in row])
    width = mm + 1
    at = lambda row, j: row*width+j
    faces = []
    for j in range(mm):
        faces.append([at(0,j), at(0,j+1), at(1,j+1), at(1,j)])
        if ccw:
            faces.append([at(1,j), at(1,j+1), at(2,j+1)])
            faces.append([at(1,j), at(2,j+1), at(2,j)])
        else:
            faces.append([at(1,j), at(1,j+1), at(2,j)])
            faces.append([at(1,j+1), at(2,j+1), at(2,j)])
        faces.append([at(2,j), at(2,j+1), at(3,j+1), at(3,j)])
    # A solved equation is insufficient by itself: check every diagonal of
    # every actual face, including cylinder quads and the overlap panel.
    face_error = 0.
    for face in faces:
        area = sum(_cross2(flat[face[k+1]]-flat[face[0]],
                           flat[face[k+2]]-flat[face[0]])
                   for k in range(len(face)-2)) / 2
        if area <= 1e-9:
            raise ValueError('求得的展开图有翻转或退化面，不能作为纸张。')
        for i, a in enumerate(face):
            for b in face[i+1:]:
                face_error = max(face_error, abs(float(np.linalg.norm(flat[a]-flat[b])
                                                 - np.linalg.norm(spatial[a]-spatial[b]))))
    if face_error > 1e-7 * scale:
        raise ValueError('管状三维面未通过与展开图的等距校验。')

    # Orient each face according to the net, then recover signed dihedral
    # angles from the spatial normals.  FOLD uses M < 0 and V > 0.
    incidence = {}
    normals = []
    for face_index, face in enumerate(faces):
        normal = np.cross(spatial[face[1]]-spatial[face[0]],
                          spatial[face[2]]-spatial[face[0]])
        magnitude = np.linalg.norm(normal)
        if magnitude < 1e-10:
            raise ValueError('管状三维面退化。')
        normals.append(normal/magnitude)
        for k, u in enumerate(face):
            v = face[(k+1) % len(face)]
            incidence.setdefault(tuple(sorted((u, v))), []).append((face_index, u, v))
    edges, assignments, fold_angles = [], [], []
    for edge, adjacent in incidence.items():
        edges.append(list(edge))
        if len(adjacent) == 1:
            assignments.append('B')
            fold_angles.append(0.)
            continue
        if len(adjacent) != 2:
            raise ValueError('管状面拓扑含非流形边。')
        first, u, v = adjacent[0]
        second = adjacent[1][0]
        edge_vector = spatial[v] - spatial[u]
        edge_vector /= np.linalg.norm(edge_vector)
        n1, n2 = normals[first], normals[second]
        angle = -math.atan2(float(np.dot(edge_vector, np.cross(n1, n2))),
                            float(np.dot(n1, n2)))
        angle_deg = math.degrees(angle)
        if (abs(angle_deg) <= params['typeMinimumAngleDeg']
                or abs(angle_deg) > params['typeMaximumAngleDeg']):
            assignments.append('U')
        else:
            assignments.append('V' if angle > 0 else 'M')
        fold_angles.append(angle_deg)
    fold = {
        'vertices_coords': flat.tolist(), 'edges_vertices': edges,
        'edges_assignment': assignments, 'edges_foldAngle': fold_angles,
        'faces_vertices': faces,
        'file_creator': '折纸工作台 / Origamica TwistJoinedTubes reconstruction',
        'frame_description': '扭转连接管二维展开图及同索引三维静态构型。',
    }
    return {
        'fold': fold,
        'source': {
            **({'ellipseSource': params['ellipseSource'], 'ellipseSourceVerified': True} if 'ellipseSource' in params else {}),
            'algorithm': 'Origamica TwistJoinedTubes In[3583]',
            'output': 'tube-3d', 'spatialKind': 'origamica-twist-joined-tube',
            'foldedForm3D': spatial.tolist(),
            'staticGlobalIsometryChecked': True,
            'maximumFaceDistanceError': face_error,
            'maximumEquationResidual': residual_error,
            'bottomJoinHeights': g.tolist(), 'topJoinHeights': h.tolist(),
            'netHorizontalOffset': offset_x, 'netVerticalOffset': offset_y,
            'bottomTubeLevel': lower_z, 'topTubeLevel': upper_z,
            'panelOverlap': params['panelOverlap'],
            'typeMinimumAngleDeg': params['typeMinimumAngleDeg'],
            'typeMaximumAngleDeg': params['typeMaximumAngleDeg'],
            'continuousRigidPathChecked': False,
            'selfCollisionChecked': False,
        },
    }
