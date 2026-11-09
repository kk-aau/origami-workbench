"""Origamica MakeRadialPot, PotPlanar branch with actual spatial vertices.

The a..f rows, their folded aa..ff counterparts, and the nonzero-gap
quadratic are transcribed from notebook In[3479]/In[3480].  The full pot is
built by rotating and welding m copies of the wedge, as in MakeRadialPot.
PotPlanar, PotPolygon, and piecewise-elliptic PotCircular boundaries are
represented by this candidate family.
"""

import math
import time

from tessellation_patterns import make_fold, planar_faces


def validate_radial_pot(data):
    allowed = {'family', 'crossSection', 'sectors', 'asymmetry',
               'gapHalfAngleDeg', 'typeMinimumAngleDeg', 'border',
               'arcMaximumAngleDeg', 'arcDivisions', 'arcMethod', 'arcDirection',
               'flatFlangeInset'}
    if not isinstance(data, dict) or data.get('family') != 'radial-pot' or set(data) - allowed:
        raise ValueError('旋转对称壶体包含不支持的参数。')
    points = data.get('crossSection', [[0, 0], [1, 1], [1, 2], [1, 3], [2, 4]])
    if (not isinstance(points, list) or not 3 <= len(points) <= 24 or
            any(not isinstance(point, list) or len(point) != 2 or
                any(isinstance(value, bool) or not isinstance(value, (int, float)) or
                    not math.isfinite(value) or abs(value) > 20 for value in point)
                for point in points)):
        raise ValueError('壶体剖面须为 3–24 个有限的 [半径, 高度] 点。')
    origin = points[0]
    section = [[float(x-origin[0]), float(z-origin[1])] for x, z in points]
    if abs(section[0][0]) > 1e-10 or abs(section[0][1]) > 1e-10 or any(x < -1e-10 for x, _ in section):
        raise ValueError('壶体剖面经原点平移后半径不可为负。')
    increments = [section[i+1][1]-section[i][1] for i in range(len(section)-1)]
    if abs(increments[0]) < 1e-9:
        increments = increments[1:]
    if not increments or any(abs(delta) < 1e-9 for delta in increments) or len({1 if delta > 0 else -1 for delta in increments}) != 1:
        raise ValueError('剖面高度须严格单调，仅首段可等高。')
    if section[1][0] <= 1e-8 or any(math.dist(a, b) < 1e-8 for a, b in zip(section, section[1:])):
        raise ValueError('剖面首段半径或相邻剖面边不可退化。')
    sectors = data.get('sectors', 5)
    if type(sectors) is not int or not 3 <= sectors <= 16 or 5*sectors*(len(section)-1) > 600:
        raise ValueError('扇区数须为 3–16，且估计面数不得超过 600。')
    def finite(name, default, low, high):
        value = data.get(name, default)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError(f'{name} 须为 {low}–{high} 的有限数值。')
        return float(value)
    rho = finite('asymmetry', 0, -1, 1)
    inset = finite('flatFlangeInset', 0, 0, .5)
    if inset and abs(rho) != 1:
        raise ValueError('法兰显示内缩仅适用于不对称度 ρ=±1。')
    gap = finite('gapHalfAngleDeg', 0, 0, 90)
    minimum = finite('typeMinimumAngleDeg', 0, 0, 45)
    if gap >= 90/sectors:
        raise ValueError('壶体接缝半角须小于扇区半角的一半。')
    border = data.get('border', 'planar')
    if border not in ('planar', 'polygon', 'circular'):
        raise ValueError('当前仅实现原版 PotPlanar、PotPolygon 与 PotCircular 外缘。')
    arc_angle = finite('arcMaximumAngleDeg', 5, 1, 30)
    arc_divisions = data.get('arcDivisions', 1)
    arc_method = data.get('arcMethod', 'inscribed')
    arc_direction = data.get('arcDirection', 'CCW')
    if type(arc_divisions) is not int or not 1 <= arc_divisions <= 32:
        raise ValueError('圆弧最少分段须为 1–32 的整数。')
    if arc_method not in ('inscribed', 'circumscribed'):
        raise ValueError('圆弧方式只支持原版内接或外切两类。')
    if border != 'circular' and any(key in data for key in
                                     ('arcMaximumAngleDeg', 'arcDivisions', 'arcMethod', 'arcDirection')):
        raise ValueError('圆弧选项只适用于 PotCircular 外缘。')
    if arc_direction == 'CW':
        raise ValueError('原版 ArcDirection=CW 在保存示例中产生绕圈长弧；目前没有通过单张纸静态等距门禁的可采用子域。')
    if arc_direction != 'CCW':
        raise ValueError('圆弧方向只接受原版默认的 ArcDirection=CCW。')
    return {'family': 'radial-pot', 'crossSection': section, 'sectors': sectors,
            'asymmetry': rho, 'gapHalfAngleDeg': gap,
            'typeMinimumAngleDeg': minimum, 'border': border,
            'flatFlangeInset': inset,
            **({'arcMaximumAngleDeg': arc_angle, 'arcDivisions': arc_divisions,
                'arcMethod': arc_method} if border == 'circular' else {})}


def _unit(angle):
    return math.cos(angle), math.sin(angle)


def _plus(*vectors):
    return tuple(sum(vector[i] for vector in vectors) for i in range(len(vectors[0])))


def _scaled(vector, scalar):
    return tuple(value*scalar for value in vector)


def _sub(a, b):
    return tuple(x-y for x, y in zip(a, b))


def _dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def _cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def _gap_scalar(radius, x, width, phi, delta, rho, b, e, bb, ee):
    """Smallest nonnegative root of the original |d-c|²=|dd-cc|² equation."""
    scale = radius*math.tan(phi)-width
    v = x*math.sin(delta)/(math.cos(phi-delta)*math.cos(phi-2*delta))
    cdir = _unit(math.pi/2)
    ddir = _unit(2*phi-math.pi/2)
    ccdir = _unit(2*(phi-delta)-math.pi/2)
    dddir = _unit(math.pi/2+2*delta)
    def differences(u):
        s = scale*u*(1-rho)/2-v
        t = scale*u*(1+rho)/2-v
        c = _plus(b, _scaled(cdir, s))
        d = _plus(e, _scaled(ddir, t))
        cc = _plus(bb, _scaled((*ccdir, 0), s))
        dd = _plus(ee, _scaled((*dddir, 0), t))
        return _sub(d, c), _sub(dd, cc)
    p, p3 = differences(0)
    p1, p31 = differences(1)
    q, q3 = _sub(p1, p), _sub(p31, p3)
    a = _dot(q, q)-_dot(q3, q3)
    bcoef = 2*(_dot(p, q)-_dot(p3, q3))
    ccoef = _dot(p, p)-_dot(p3, p3)
    tolerance = 1e-12*max(1, abs(a), abs(bcoef), abs(ccoef))
    if abs(a) < tolerance:
        roots = [-ccoef/bcoef] if abs(bcoef) >= tolerance else []
    else:
        discriminant = bcoef*bcoef-4*a*ccoef
        roots = [] if discriminant < -tolerance else [
            (-bcoef-math.sqrt(max(discriminant, 0)))/(2*a),
            (-bcoef+math.sqrt(max(discriminant, 0)))/(2*a)]
    roots = [root for root in roots if math.isfinite(root) and root >= -1e-9]
    if not roots:
        raise ValueError('该剖面与接缝角没有非负的原版壶体解。')
    root = max(0, min(roots))
    lhs, rhs = differences(root)
    if abs(_dot(lhs, lhs)-_dot(rhs, rhs)) > 1e-8*max(1, _dot(lhs, lhs), _dot(rhs, rhs)):
        raise ValueError('壶体接缝方程数值残差过大。')
    return root, v


def _wedge_rows(params):
    section = params['crossSection']
    m = params['sectors']
    phi = math.pi/m
    delta = math.radians(params['gapHalfAngleDeg'])
    rho = params['asymmetry']
    radii = [0.]
    for a, b in zip(section, section[1:]):
        radii.append(radii[-1]+math.dist(a, b))
    flat_bottom = abs(section[1][1]) < 1e-9
    cp = {letter: [] for letter in 'abcdef'}
    xyz = {letter: [] for letter in 'abcdef'}
    solutions = []
    for i, ((x, z), radius) in enumerate(zip(section, radii)):
        width = math.tan(phi-delta)*x
        a = (radius, 0.)
        b = (radius, width)
        f = _scaled(_unit(2*phi), radius)
        e = _plus(f, _scaled(_unit(2*phi-math.pi/2), width))
        aa = (x, 0., z)
        bb = (x, width, z)
        ff = (*_scaled(_unit(2*phi), x), z)
        ee = _plus(ff, _scaled((*_unit(2*phi-math.pi/2), 0.), width))
        if i == 0:
            u, v, s, t = 0., 0., 0., 0.
        else:
            u, v = (1., 0.) if delta == 0 else _gap_scalar(radius, x, width, phi, delta, rho, b, e, bb, ee)
            scale = radius*math.tan(phi)-width
            s = scale*u*(1-rho)/2-v
            t = scale*u*(1+rho)/2-v
            if min(s, t) < -1e-8:
                raise ValueError('该接缝角导致负的壶体侧翼宽度；请调整剖面或不对称度。')
            s, t = max(0., s), max(0., t)
        c = _plus(b, _scaled(_unit(math.pi/2), s))
        d = _plus(e, _scaled(_unit(2*phi-math.pi/2), t))
        cc = _plus(bb, _scaled((*_unit(2*(phi-delta)-math.pi/2), 0.), s))
        dd = _plus(ee, _scaled((*_unit(math.pi/2+2*delta), 0.), t))
        for letter, point, spatial in zip('abcdef', (a, b, c, d, e, f), (aa, bb, cc, dd, ee, ff)):
            cp[letter].append(point)
            xyz[letter].append(spatial)
        solutions.append({'u': u, 's': s, 't': t, 'v': v, 'radius': radius})
    return cp, xyz, solutions, flat_bottom


def _rotate(point, angle):
    c, s = math.cos(angle), math.sin(angle)
    return (c*point[0]-s*point[1], s*point[0]+c*point[1], *point[2:])


def _map_face_point(point, triangle, spatial_triangle):
    """Apply the face's exact planar isometry to a new CP boundary point."""
    a, b, c = triangle
    ab, ac, ap = _sub(b, a), _sub(c, a), _sub(point, a)
    determinant = ab[0]*ac[1]-ab[1]*ac[0]
    if abs(determinant) < 1e-10:
        raise ValueError('壶体多边形外缘对应的末端纸面退化。')
    v = (ap[0]*ac[1]-ap[1]*ac[0])/determinant
    w = (ab[0]*ap[1]-ab[1]*ap[0])/determinant
    aa, bb, cc = spatial_triangle
    return _plus(aa, _scaled(_sub(bb, aa), v), _scaled(_sub(cc, aa), w))


def _ray_circle(point, direction, radius):
    a = _dot(direction, direction)
    b = 2*_dot(point, direction)
    c = _dot(point, point)-radius*radius
    discriminant = b*b-4*a*c
    if a < 1e-15 or discriminant < -1e-9:
        raise ValueError('PotCircular 外缘射线与目标圆无交点。')
    root = (-b+math.sqrt(max(0, discriminant)))/(2*a)
    return _plus(point, _scaled(direction, root))


def _arc_angles(start, end, direction):
    """In[315]: move only the end angle across the branch cut."""
    start_angle, end_angle = math.atan2(start[1], start[0]), math.atan2(end[1], end[0])
    if direction == 'CCW' and end_angle < start_angle:
        end_angle += math.tau
    elif direction == 'CW' and end_angle > start_angle:
        end_angle -= math.tau
    return start_angle, end_angle


def _polygonal_ellipse_arc(start, end, maximum_angle, minimum_divisions, method,
                           direction='CCW'):
    """In[315] inscribed/circumscribed arcs, including the CW major arc."""
    start_angle, end_angle = _arc_angles(start, end, direction)
    sweep = end_angle-start_angle
    if direction == 'CCW' and (sweep < -1e-10 or sweep > math.pi+1e-8):
        raise ValueError('PotCircular 外缘弧线方向无效。')
    if direction == 'CW' and (sweep > 1e-10 or sweep < -math.tau-1e-8):
        raise ValueError('PotCircular CW 外缘弧线方向无效。')
    divisions = max(minimum_divisions,
                    math.ceil(abs(sweep)/math.radians(maximum_angle)-1e-10))
    r1, r2 = math.hypot(*start), math.hypot(*end)
    if min(r1, r2) <= 1e-10:
        raise ValueError('PotCircular 外缘弧线半径退化。')
    weights = (range(1, divisions) if method == 'inscribed'
               else (i+.5 for i in range(divisions)))
    factor = 1 if method == 'inscribed' else 1/math.cos(sweep/(2*divisions))
    return [start]+[
        _scaled(_unit(start_angle*(1-w)+end_angle*w), factor*r1**(1-w)*r2**w)
        for w in (i/divisions for i in weights)
    ]+[end]


def _assemble(params, rows2, rows3, flat_bottom, reference_only=False,
              arc_metadata=None):
    m, n = params['sectors'], len(params['crossSection'])
    coords, spatial, ids, lookup, edges, initial = [], [], {}, {}, [], []
    edge_lookup = {}
    for wedge in range(m):
        angle = 2*math.pi*wedge/m
        for letter in 'abcdef':
            for level in range(n):
                p = _rotate(rows2[letter][level], angle)
                q = _rotate(rows3[letter][level], angle)
                key = (*[round(value, 9) for value in p], *[round(value, 9) for value in q])
                index = lookup.get(key)
                if index is None:
                    index = len(coords)
                    lookup[key] = index
                    coords.append(list(p))
                    spatial.append(list(q))
                ids[wedge, letter, level] = index
        def edge_indices(first, second, kind):
            if first == second:return None
            key = tuple(sorted((first, second)))
            if key in edge_lookup:return edge_lookup[key]
            edge_lookup[key] = len(edges)
            edges.append(list(key))
            initial.append(kind)
            return edge_lookup[key]
        def edge(a, ai, b, bi, kind):
            edge_indices(ids[wedge, a, ai], ids[wedge, b, bi], kind)
        for level in range(n-1):
            for letter in 'abcdef':
                edge(letter, level, letter, level+1,
                     'outer' if letter in 'af' else 'radial')
        if params['border'] == 'polygon' and abs(params['asymmetry']) != 1:
            radius = rows2['a'][-1][0]
            corner = (radius, radius*math.tan(math.pi/m))
            triangle = tuple(_rotate(rows2[letter][level], angle)
                             for letter, level in (('c', n-2), ('c', n-1), ('d', n-1)))
            spatial_triangle = tuple(_rotate(rows3[letter][level], angle)
                                     for letter, level in (('c', n-2), ('c', n-1), ('d', n-1)))
            corner = _rotate(corner, angle)
            folded_corner = _map_face_point(corner, triangle, spatial_triangle)
            ids[wedge, 'corner', n-1] = len(coords)
            coords.append(list(corner))
            spatial.append(list(folded_corner))
        for level in range(1, n):
            for a, b in zip('abcde', 'bcdef'):
                if (params['border'] == 'polygon' and abs(params['asymmetry']) != 1
                        and level == n-1 and (a, b) == ('c', 'd')):
                    edge('c', level, 'corner', level, 'B')
                    edge('corner', level, 'd', level, 'B')
                elif params['border'] == 'circular' and level == n-1:
                    p, q = ids[wedge, a, level], ids[wedge, b, level]
                    if p == q:
                        # At rho=+/-1 one flange interval has collapsed to a
                        # single vertex.  The arc has no edge or face to add.
                        continue
                    triangle = tuple(_rotate(rows2[letter][row], angle)
                                     for letter, row in ((a, n-2), (a, n-1), (b, n-1)))
                    spatial_triangle = tuple(_rotate(rows3[letter][row], angle)
                                             for letter, row in ((a, n-2), (a, n-1), (b, n-1)))
                    target = _ray_circle(triangle[2], _sub(triangle[2],
                                         _rotate(rows2[b][n-2], angle)), rows2['a'][-1][0])
                    coords[q] = list(target)
                    if not reference_only:
                        spatial[q] = list(_map_face_point(target, triangle, spatial_triangle))
                    arc = (_polygonal_ellipse_arc(
                        coords[p], target, params['arcMaximumAngleDeg'],
                        params['arcDivisions'], params['arcMethod'], 'CW')
                        if reference_only else _polygonal_ellipse_arc(
                        coords[p], target, params['arcMaximumAngleDeg'],
                        params['arcDivisions'], params['arcMethod']))
                    arc_edges = []
                    previous = p
                    for point in arc[1:-1]:
                        current = len(coords)
                        coords.append(list(point))
                        spatial.append(list(spatial[p] if reference_only else
                            _map_face_point(point, triangle, spatial_triangle)))
                        arc_edges.append(edge_indices(previous, current, 'B'))
                        previous = current
                    arc_edges.append(edge_indices(previous, q, 'B'))
                    if arc_metadata is not None:
                        start_angle, end_angle = _arc_angles(coords[p], target, 'CW')
                        arc_metadata.append({'wedge': wedge, 'between': a+b,
                                             'sweepDeg': math.degrees(end_angle-start_angle),
                                             'edgeIndices': arc_edges})
                else:
                    edge(a, level, b, level, 'B' if level == n-1 else 'axial')
    if any(not all(math.isfinite(value) for value in p) for p in coords+spatial):
        raise ValueError('壶体构造产生非有限二维或三维坐标。')
    if len(coords) > 3000 or len(edges) > 6000:
        raise ValueError('壶体图元超过安全规模限制。')
    if reference_only:
        # A CW source graph intentionally allows crossing, overlapping and
        # duplicate paper positions.  It has no faces or adoptable FOLD.
        return coords, spatial, edges, initial, [], ids, flat_bottom
    # Two distinct spatial points cannot be one paper vertex.
    cp_lookup = {}
    for i, point in enumerate(coords):
        key = tuple(round(value, 9) for value in point)
        previous = cp_lookup.get(key)
        if previous is not None and math.dist(spatial[previous], spatial[i]) > 1e-7:
            raise ValueError('壶体折痕坐标重合但三维位置不一致。')
        cp_lookup[key] = i
    faces = planar_faces(coords, edges)
    if not faces or len(faces) > 600 or any(len(face) > 64 for face in faces):
        raise ValueError('壶体面数为空、超过 600 面，或单面轮廓超过 64 点。')
    if len(coords)-len(edges)+len(faces) != 1:
        raise ValueError('壶体折痕不是一张连通的无孔纸面。')
    return coords, spatial, edges, initial, faces, ids, flat_bottom


def _face_checks(coords, spatial, faces):
    worst_distance, worst_plane = 0., 0.
    for face in faces:
        if len(face) < 3:
            raise ValueError('壶体产生退化的纸面。')
        for i, a in enumerate(face):
            for b in face[i+1:]:
                worst_distance = max(worst_distance,
                                     abs(math.dist(coords[a], coords[b])-math.dist(spatial[a], spatial[b])))
        a, b, c = (spatial[index] for index in face[:3])
        normal = _cross(_sub(b, a), _sub(c, a))
        length = math.sqrt(_dot(normal, normal))
        if length < 1e-10:raise ValueError('壶体三维面退化。')
        for index in face[3:]:
            worst_plane = max(worst_plane, abs(_dot(normal, _sub(spatial[index], a)))/length)
    scale = max(1., *(abs(value) for point in coords for value in point))
    if max(worst_distance, worst_plane) > 1e-7*scale:
        raise ValueError('壶体三维面不共面或不等距，当前参数不可采用。')
    return worst_distance, worst_plane


def _edge_assignments(coords, spatial, edges, initial, faces, minimum):
    # The original wedge obtains axial types from EdgeFaceAngles3D.  Rebuild
    # that signed dihedral from the same ordered CP/3D faces after welding.
    adjacent = {}
    for index, face in enumerate(faces):
        for a, b in zip(face, face[1:]+face[:1]):
            adjacent.setdefault(tuple(sorted((a, b))), []).append((index, a, b))
    normals = []
    for face in faces:
        a, b, c = (spatial[index] for index in face[:3])
        normal = _cross(_sub(c, a), _sub(b, a))  # planar_faces is clockwise
        length = math.sqrt(_dot(normal, normal))
        normals.append(_scaled(normal, 1/length))
    angle_by_edge = []
    for a, b in edges:
        neighbors = adjacent.get((a, b), [])
        if len(neighbors) == 1:
            angle_by_edge.append(None)
        elif len(neighbors) == 2:
            # planar_faces returns clockwise loops.  Traversing a->b puts
            # the face on the right; traversing b->a puts it on the left.
            left = next((index for index, u, v in neighbors if (u, v) == (b, a)), None)
            right = next((index for index, u, v in neighbors if (u, v) == (a, b)), None)
            if left is None or right is None:
                raise ValueError('壶体折痕左右面关系无法确定。')
            vector = _sub(spatial[b], spatial[a])
            length = math.sqrt(_dot(vector, vector))
            if length < 1e-10:raise ValueError('壶体产生零长三维折痕。')
            value = -math.degrees(math.atan2(_dot(_cross(normals[left], normals[right]), _scaled(vector, 1/length)),
                                             _dot(normals[left], normals[right])))
            angle_by_edge.append(value)
        else:
            raise ValueError('壶体折痕不是连续单张纸的流形边。')
    # Positive angles must yield V: the notebook's upward pot sets c/d to V
    # and b/e to M before assigning the axial folds from folded face angles.
    assignments = []
    for value in angle_by_edge:
        assignments.append('B' if value is None else 'U' if abs(value) <= minimum+1e-7 else 'V' if value > 0 else 'M')
    return assignments, angle_by_edge


def generate_radial_pot(params, check_geometry):
    started = time.perf_counter()
    rows2, rows3, solutions, flat_bottom = _wedge_rows(params)
    coords, spatial, edges, initial, faces, ids, _ = _assemble(params, rows2, rows3, flat_bottom)
    distance_error, plane_error = _face_checks(coords, spatial, faces)
    assignments, fold_angles = _edge_assignments(
        coords, spatial, edges, initial, faces, params['typeMinimumAngleDeg'])
    fold = make_fold(coords, edges, assignments, faces)
    fold['edges_foldAngle'] = fold_angles
    border_name = {'planar': 'PotPlanar', 'polygon': 'PotPolygon',
                   'circular': 'PotCircular'}[params['border']]
    fold['file_creator'] = f'折纸工作台 / Origamica MakeRadialPot {border_name} reconstruction'
    fold['frame_description'] = f'旋转对称壶体 {border_name} 的二维折痕与静态三维形态；不是平折层序。'
    geometry = check_geometry(fold)
    if geometry['status'] != 'passed':
        raise ValueError('壶体展开折痕的二维几何未通过检查。')
    display_inset = params['flatFlangeInset']
    flange_display = None
    if display_inset:
        letter = 'b' if params['asymmetry'] == -1 else 'e'
        flange_display = {
            'fraction': display_inset,
            'vertexIndices': sorted({ids[wedge, letter, level]
                                     for wedge in range(params['sectors'])
                                     for level in range(len(params['crossSection']))}),
            'sourceLetter': letter,
            'displayOnly': True,
            'metricPreserving': False,
        }
    return {
        'preview': None, 'fold': fold, 'mother': None, 'dual': None,
        'stats': {
            'vertices': len(coords), 'edges': len(edges), 'faces': len(faces),
            'tiles': params['sectors'], 'mountainEdges': assignments.count('M'),
            'valleyEdges': assignments.count('V'), 'boundaryEdges': assignments.count('B'),
            'unassignedEdges': assignments.count('U'),
            'elapsedMs': round((time.perf_counter()-started)*1000), 'parameters': params,
            'checks': {'geometry': geometry,
                       'local': {'status': 'not_applicable', 'kind': 'spatial-not-flat-foldable',
                                 'maximumError': max(distance_error, plane_error)},
                       'layerOrder': {'status': 'not_checked'}},
            'foldability': 'static-spatial-state', 'kind': 'radial-pot',
        },
        'warnings': [
            f'已核验 {border_name} 当前静态三维面与二维折痕逐面对距、共面和共享边；未验证连续折叠路径或自碰撞。',
            '该壶体不是平折层序结果；法兰内缩仅在三维显示中分开重合面，不改变已验的真实等距坐标。',
        ],
        'source': {
            'name': '折纸工作台', 'license': 'GPL-3.0-only',
            'algorithm': f'Origamica MakeRadialPot {border_name} reconstruction',
            'version': 1, 'output': 'spatial-3d',
            'spatialKind': 'origamica-radial-pot',
            'foldedForm3D': spatial,
            'maximumFaceDistanceError': distance_error,
            'maximumFacePlaneError': plane_error,
            'staticGlobalIsometryChecked': True,
            'continuousRigidPathChecked': False,
            'selfCollisionChecked': False,
            'gapSolutions': solutions,
            **({'flatFlangeDisplay': flange_display} if flange_display else {}),
            'unsupportedOrigamicaOptions': ['ArcDirection=CW'],
        },
    }
