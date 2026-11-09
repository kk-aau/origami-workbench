"""Numerical 1x1 interior case of Origamica's rigid quad mesh.

Origamica 15.0: RigidlyFoldableQuadMesh at notebook lines 147011–150139;
RigidlyFoldableSingleVertexQuadMesh wrapper and In[2106] at 150150–150396.
The full routine propagates many vertices and solves linear/nonlinear global
boundary constraints. This module implements its multi-vertex angle recurrence
and the default rectangular single-vertex linear program. The latter embeds
four rigid quadrilateral faces in 3D and checks their isometry; no continuous
path or self-intersection result is implied.
"""

import itertools
import math

from tessellation_quad_mesh import make_quad_mesh
from tessellation_vertex_fan3d import folded_vertex_fan


def _finite(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{label}必须是有限数值。')
    try:
        value = float(value)
    except OverflowError as exc:
        raise ValueError(f'{label}必须是有限数值。') from exc
    if not math.isfinite(value):
        raise ValueError(f'{label}必须是有限数值。')
    return value


def _signed_fold(value, label):
    angle = _finite(value, label)
    if not -math.pi < angle < math.pi or angle == 0:
        raise ValueError(f'{label}须为非零折角，严格位于 -180° 与 180° 之间。')
    return angle


def _solve_four(rows, right):
    """Small pivoted elimination; return None for a singular active set."""
    matrix = [list(map(float, row)) + [float(value)]
              for row, value in zip(rows, right)]
    for col in range(4):
        pivot = max(range(col, 4), key=lambda row: abs(matrix[row][col]))
        if abs(matrix[pivot][col]) < 1e-11:
            return None
        matrix[col], matrix[pivot] = matrix[pivot], matrix[col]
        value = matrix[col][col]
        for j in range(col, 5):
            matrix[col][j] /= value
        for row in range(4):
            if row == col:
                continue
            factor = matrix[row][col]
            for j in range(col, 5):
                matrix[row][j] -= factor * matrix[col][j]
    return tuple(matrix[row][4] for row in range(4))


def _minimum_rectangle(direction_angles, minimums):
    """Enumerate active vertices of the original default rectangular LP.

    Variables are [xLeft, xRight, yBottom, yTop]. All twelve quad-mesh edge
    lengths are linear in these four values when the four ray directions are
    fixed, so minimizing their sum is a four-variable linear program.
    """
    right, top, left, bottom = direction_angles
    cr, st, cl, sb = (math.cos(right), math.sin(top),
                      math.cos(left), math.sin(bottom))
    if not (cr > 1e-6 and st > 1e-6 and cl < -1e-6 and sb < -1e-6):
        raise ValueError('这组方向无法让四条折线分别到达矩形的右、上、左、下边。')
    kr = math.sin(right) / cr
    kt = math.cos(top) / st
    kl = math.sin(left) / cl
    kb = math.cos(bottom) / sb
    # Edge order matches MakeQuadMesh: all horizontal rows, then vertical.
    edge_keys = [(0, i, j) for j in range(3) for i in range(2)] + [
        (1, i, j) for j in range(2) for i in range(3)]
    lengths = [
        (-1, 0, kb, 0),           # bottom left boundary
        (0, 1, -kb, 0),           # bottom right boundary
        (1 / cl, 0, 0, 0),        # left -> centre
        (0, 1 / cr, 0, 0),        # centre -> right
        (-1, 0, 0, kt),           # top left boundary
        (0, 1, 0, -kt),           # top right boundary
        (kl, 0, -1, 0),           # left lower boundary
        (0, 0, 1 / sb, 0),        # bottom -> centre
        (0, kr, -1, 0),           # right lower boundary
        (-kl, 0, 0, 1),           # left upper boundary
        (0, 0, 0, 1 / st),        # centre -> top
        (0, -kr, 0, 1),           # right upper boundary
    ]
    bounds = [minimums[key] for key in edge_keys]
    objective = [math.fsum(row[col] for row in lengths) for col in range(4)]
    best = None
    best_score = math.inf
    for chosen in itertools.combinations(range(12), 4):
        solution = _solve_four([lengths[i] for i in chosen],
                               [bounds[i] for i in chosen])
        if solution is None or any(not math.isfinite(value) for value in solution):
            continue
        actual = [math.fsum(a * b for a, b in zip(row, solution))
                  for row in lengths]
        if any(value < bound - 1e-8 * max(1, bound)
               for value, bound in zip(actual, bounds)):
            continue
        score = math.fsum(a * b for a, b in zip(objective, solution))
        if score < best_score - 1e-9 or (abs(score - best_score) <= 1e-9
                                        and (best is None or solution < best)):
            best, best_score = solution, score
    if best is None:
        raise ValueError('给定方向和最小边长无法形成矩形纸张。')
    return best, best_score, edge_keys


def _point_on_ray(direction, coordinate, axis):
    if axis == 'x':
        return (coordinate, coordinate * math.sin(direction) / math.cos(direction))
    return (coordinate * math.cos(direction) / math.sin(direction), coordinate)


def _cross2(a, b):
    return a[0] * b[1] - a[1] * b[0]


def _embed_corner(corner, ray_a, ray_b, folded_a, folded_b):
    determinant = _cross2(ray_a, ray_b)
    if abs(determinant) < 1e-10:
        raise ValueError('相邻折线方向退化，无法嵌入四边形。')
    u, v = (_cross2(corner, ray_b) / determinant,
            _cross2(ray_a, corner) / determinant)
    return tuple(u * folded_a[k] + v * folded_b[k] for k in range(3))


def _distance(a, b):
    return math.dist(a, b)


def rigid_vertex_angle_step(bottom_direction, bottom_fold,
                            left_direction, left_fold):
    """Propagate one four-degree quad-mesh vertex from bottom/left edges."""
    phi_b = _finite(bottom_direction, '底边折线方向')
    phi_l = _finite(left_direction, '左边折线方向')
    gamma_b = _signed_fold(bottom_fold, '底边折角')
    gamma_l = _signed_fold(left_fold, '左边折角')
    if abs(abs(gamma_b) - abs(gamma_l)) <= 1e-12:
        raise ValueError('底边与左边折角绝对值相同，会使扇区角退化。')
    alpha1 = (phi_b - phi_l) % (2 * math.pi)
    if not 1e-8 < alpha1 < math.pi - 1e-8:
        raise ValueError('入射折线方向须形成 0° 到 180° 的有效扇区。')
    m = math.tan(gamma_b / 2) / math.tan(gamma_l / 2)
    if not math.isfinite(m):
        raise ValueError('半角正切比超出数值范围。')
    scale = max(1, abs(m))
    numerator = abs((1 / scale + m / scale) * math.cos(alpha1 / 2))
    denominator = math.sqrt((1 / scale) ** 2 + (m / scale) ** 2
                            + 2 * m / (scale * scale) * math.cos(alpha1))
    if denominator == 0:
        raise ValueError('这组折角和方向使局部扇区退化。')
    acos_argument = numerator / denominator
    if acos_argument > 1 + 1e-10:
        raise ValueError('这组折角无法构造实数扇区角。')
    solved = 2 * math.acos(min(1, acos_argument))
    major_vertical = abs(gamma_b) > abs(gamma_l)
    alpha2 = solved if major_vertical else math.pi - solved
    alpha3 = math.pi - alpha1
    alpha4 = math.pi - alpha2
    if any(not 1e-8 < angle < math.pi - 1e-8
           for angle in (alpha1, alpha2, alpha3, alpha4)):
        raise ValueError('传播得到的扇区角退化。')
    gamma_t = gamma_b if major_vertical else -gamma_b
    gamma_r = -gamma_l if major_vertical else gamma_l
    phi_r = phi_b - math.pi + alpha2
    phi_t = phi_r + alpha3
    ray_angles = (phi_r, phi_t, phi_l + math.pi, phi_b + math.pi)
    sectors = (alpha3, alpha4, alpha1, alpha2)
    folds = (gamma_r, gamma_t, gamma_l, gamma_b)
    fan = folded_vertex_fan(sectors, folds)
    return {
        'bottomDirectionRad': phi_b, 'leftDirectionRad': phi_l,
        'bottomFoldRad': gamma_b, 'leftFoldRad': gamma_l,
        'rightDirectionRad': phi_r, 'topDirectionRad': phi_t,
        'rightFoldRad': gamma_r, 'topFoldRad': gamma_t,
        'rayAnglesRad': ray_angles, 'sectorAnglesRad': sectors,
        'foldAnglesRad': folds, 'majorVertical': major_vertical,
        'halfTangentRatio': m, 'fan': fan,
    }


def rigid_single_vertex_quad_mesh(bottom_direction, bottom_fold,
                                  left_direction, left_fold, *,
                                  default_minimum_edge_length=1,
                                  minimum_edge_lengths=(),
                                  same_pt_tolerance=1e-6):
    """Build the original single-interior-vertex rectangular case.

    Directions and fold angles are radians. ``minimum_edge_lengths`` uses
    the original zero-based (d,i,j,length) edge positions, with d=0 for
    horizontal and d=1 for vertical. All minimums must be positive here;
    Origamica's zero-length edge collapse is not implemented in this subset.
    """
    step = rigid_vertex_angle_step(bottom_direction, bottom_fold,
                                   left_direction, left_fold)
    phi_b, phi_l = step['bottomDirectionRad'], step['leftDirectionRad']
    gamma_b, gamma_l = step['bottomFoldRad'], step['leftFoldRad']
    gamma_r, gamma_t = step['rightFoldRad'], step['topFoldRad']
    phi_r, phi_t = step['rightDirectionRad'], step['topDirectionRad']
    ray_angles = step['rayAnglesRad']
    sectors, folds = step['sectorAnglesRad'], step['foldAnglesRad']
    major_vertical, m, fan = (step['majorVertical'],
                              step['halfTangentRatio'], step['fan'])

    default_length = _finite(default_minimum_edge_length, '默认最小边长')
    if default_length <= 0:
        raise ValueError('当前矩形单顶点构造要求默认最小边长大于 0。')
    if not isinstance(minimum_edge_lengths, (tuple, list)):
        raise ValueError('逐边最小边长须为列表。')
    all_keys = {(0, i, j) for i in range(2) for j in range(3)} | {
        (1, i, j) for i in range(3) for j in range(2)}
    minimums = {key: default_length for key in all_keys}
    overridden = set()
    for item in minimum_edge_lengths:
        if (not isinstance(item, (tuple, list)) or len(item) != 4
                or any(isinstance(value, bool) or not isinstance(value, int)
                       for value in item[:3])):
            raise ValueError('逐边边长须为 [方向, i, j, 最小边长]。')
        key = tuple(item[:3])
        if key not in all_keys or key in overridden:
            raise ValueError('逐边边长索引无效或重复。')
        value = _finite(item[3], '逐边最小边长')
        if value <= 0:
            raise ValueError('当前单顶点构造尚不支持零长度退化边。')
        minimums[key] = value
        overridden.add(key)

    (x_left, x_right, y_bottom, y_top), minimum_total, edge_keys = (
        _minimum_rectangle(ray_angles, minimums))
    points = {
        'C': (0.0, 0.0),
        'R': _point_on_ray(phi_r, x_right, 'x'),
        'T': _point_on_ray(phi_t, y_top, 'y'),
        'L': _point_on_ray(phi_l + math.pi, x_left, 'x'),
        'B': _point_on_ray(phi_b + math.pi, y_bottom, 'y'),
        'BL': (x_left, y_bottom), 'BR': (x_right, y_bottom),
        'TL': (x_left, y_top), 'TR': (x_right, y_top),
    }
    # First fan face R->T is the unfolded XY base face. Rotate around Z so
    # its first ray matches the CP's right-going outgoing direction.
    c, s = math.cos(phi_r), math.sin(phi_r)
    folded = {}
    for label, vector in zip(('R', 'T', 'L', 'B'), fan['foldRays']):
        length = math.hypot(*points[label])
        folded[label] = (length * (c * vector[0] - s * vector[1]),
                         length * (s * vector[0] + c * vector[1]),
                         length * vector[2])
    folded['C'] = (0.0, 0.0, 0.0)
    for corner, a, b in (('TR', 'R', 'T'), ('TL', 'T', 'L'),
                         ('BL', 'L', 'B'), ('BR', 'B', 'R')):
        folded[corner] = _embed_corner(points[corner], points[a], points[b],
                                        folded[a], folded[b])

    labels = (('BL', 'B', 'BR'), ('L', 'C', 'R'), ('TL', 'T', 'TR'))
    graph = make_quad_mesh(
        2, 2,
        vertices_fn=lambda i, j: points[labels[j][i]],
        vertices3d_fn=lambda i, j: folded[labels[j][i]],
        horizontal_type_fn=lambda i, j: ('V' if (gamma_l if i == 0 else gamma_r) > 0
                                         else 'M') if j == 1 else 'B',
        vertical_type_fn=lambda i, j: ('V' if (gamma_b if j == 0 else gamma_t) > 0
                                       else 'M') if i == 1 else 'B',
        horizontal_angle_fn=lambda i, j: (gamma_l if i == 0 else gamma_r)
                                        if j == 1 else 0,
        vertical_angle_fn=lambda i, j: (gamma_b if j == 0 else gamma_t)
                                      if i == 1 else 0,
        border_override=True,
        same_pt_tolerance=same_pt_tolerance,
    )
    if len(graph['vertices_coords']) != 9:
        raise ValueError('最小边长低于顶点合并容差；当前构造不支持退化四边形。')
    grid = graph['indexGrid']
    faces = [(grid[0][0], grid[0][1], grid[1][1], grid[1][0]),
             (grid[0][1], grid[0][2], grid[1][2], grid[1][1]),
             (grid[1][0], grid[1][1], grid[2][1], grid[2][0]),
             (grid[1][1], grid[1][2], grid[2][2], grid[2][1])]
    graph['faces_vertices'] = faces
    maximum_error = 0.0
    for face in faces:
        for a, b in itertools.combinations(face, 2):
            error = abs(_distance(graph['vertices_coords'][a], graph['vertices_coords'][b])
                        - _distance(graph['vertices_coords3d'][a],
                                    graph['vertices_coords3d'][b]))
            maximum_error = max(maximum_error, error)
    if maximum_error > 1e-7 * max(1, minimum_total):
        raise ValueError('折后四边形面长与展开图不一致。')
    graph.update({
        'kind': 'origamica-rigid-single-vertex-quad-mesh',
        'sectorAnglesRad': sectors,
        'foldAnglesRad': folds,
        'incomingDirectionsRad': (phi_b, phi_l),
        'outgoingDirectionsRad': (phi_r, phi_t),
        'majorVertical': major_vertical,
        'halfTangentRatio': m,
        'minimumTotalEdgeLength': minimum_total,
        'edgeMinimums': [minimums[key] for key in edge_keys],
        'maximumFaceDistanceError': maximum_error,
        'localClosureErrorRad': fan['closureErrorRad'],
        'continuousRigidPathChecked': False,
        'selfCollisionChecked': False,
        'globalFoldabilityChecked': False,
    })
    return graph


def rigid_single_vertex_quad_mesh_query(data):
    """JSON input: bottom/left=[directionDeg,foldAngleDeg], optional lengths."""
    if (not isinstance(data, dict)
            or data.get('operation') != 'rigid-single-vertex-quad-mesh'
            or set(data) - {'operation', 'bottom', 'left',
                            'minimumEdgeLength', 'minimumEdgeLengths'}):
        raise ValueError('刚性单顶点四边网格参数无效。')
    def pair(name):
        value = data.get(name)
        if not isinstance(value, list) or len(value) != 2:
            raise ValueError(f'{name}须为 [方向角°, 折角°]。')
        return tuple(math.radians(_finite(x, f'{name}参数')) for x in value)
    phi_b, gamma_b = pair('bottom')
    phi_l, gamma_l = pair('left')
    result = rigid_single_vertex_quad_mesh(
        phi_b, gamma_b, phi_l, gamma_l,
        default_minimum_edge_length=data.get('minimumEdgeLength', 1),
        minimum_edge_lengths=data.get('minimumEdgeLengths', ()),
    )
    result['sectorAnglesDeg'] = [math.degrees(value) for value in result['sectorAnglesRad']]
    result['foldAnglesDeg'] = [math.degrees(value) for value in result['foldAnglesRad']]
    result['outgoingDirectionsDeg'] = [math.degrees(value)
                                       for value in result['outgoingDirectionsRad']]
    return result


def rigid_quad_mesh_angle_propagation(bottom_directions, bottom_folds,
                                      left_directions, left_folds):
    """Original interior-vertex recurrence for an arbitrary rectangular grid.

    This is the angular half of RigidlyFoldableQuadMesh. Origamica then solves
    a *separate* constrained global optimization for planar edge lengths,
    folded 3D positions, base faces and boundary shape. Those coordinates are
    not inferred by this function and no full mesh is returned.
    """
    lists = (bottom_directions, bottom_folds, left_directions, left_folds)
    if any(not isinstance(values, (tuple, list)) for values in lists):
        raise ValueError('底边和左边方向、折角都须为列表。')
    if not len(bottom_directions) == len(bottom_folds) or not len(left_directions) == len(left_folds):
        raise ValueError('同一边的方向与折角列表长度须相同。')
    if not 1 <= len(bottom_folds) <= 32 or not 1 <= len(left_folds) <= 32:
        raise ValueError('每条边须给出 1–32 条内部折线。')
    phi_b0 = [_finite(value, f'底边第 {i+1} 条方向')
              for i, value in enumerate(bottom_directions)]
    phi_l0 = [_finite(value, f'左边第 {i+1} 条方向')
              for i, value in enumerate(left_directions)]
    gamma_b0 = [_signed_fold(value, f'底边第 {i+1} 个折角')
                for i, value in enumerate(bottom_folds)]
    gamma_l0 = [_signed_fold(value, f'左边第 {i+1} 个折角')
                for i, value in enumerate(left_folds)]
    for bottom in gamma_b0:
        for left in gamma_l0:
            if abs(abs(bottom) - abs(left)) <= 1e-12:
                raise ValueError('底边与左边折角含相同绝对值，会使扇区角退化。')

    nh, nv = len(phi_b0) + 1, len(phi_l0) + 1
    phi_v = {(i, 0): phi_b0[i-1] for i in range(1, nh)}
    phi_h = {(0, j): phi_l0[j-1] for j in range(1, nv)}
    gamma_b = {(i, 1): gamma_b0[i-1] for i in range(1, nh)}
    gamma_l = {(1, j): gamma_l0[j-1] for j in range(1, nv)}
    vertices = []
    steps = {}
    # The notebook's nested Do loops put i outside and j inside. Each new
    # vertex consumes an already propagated bottom and left crease.
    for i in range(1, nh):
        for j in range(1, nv):
            try:
                step = rigid_vertex_angle_step(phi_v[i, j-1], gamma_b[i, j],
                                               phi_h[i-1, j], gamma_l[i, j])
            except ValueError as exc:
                raise ValueError(f'顶点 ({i},{j}) 无法传播：{exc}') from exc
            steps[i, j] = step
            phi_h[i, j] = step['rightDirectionRad']
            phi_v[i, j] = step['topDirectionRad']
            gamma_b[i, j+1] = step['topFoldRad']
            gamma_l[i+1, j] = step['rightFoldRad']
            vertices.append({
                'i': i, 'j': j,
                'majorVertical': step['majorVertical'],
                'halfTangentRatio': step['halfTangentRatio'],
                'sectorAnglesRad': step['sectorAnglesRad'],
                'foldAnglesRad': step['foldAnglesRad'],
                'incomingDirectionsRad': (step['bottomDirectionRad'],
                                          step['leftDirectionRad']),
                'outgoingDirectionsRad': (step['rightDirectionRad'],
                                          step['topDirectionRad']),
                'localClosureErrorRad': step['fan']['closureErrorRad'],
            })
    horizontal = []
    for j in range(1, nv):
        for i in range(nh):
            fold = gamma_l[1, j] if i == 0 else steps[i, j]['rightFoldRad']
            horizontal.append({'i': i, 'j': j, 'directionRad': phi_h[i, j],
                               'foldAngleRad': fold,
                               'assignment': 'V' if fold > 0 else 'M'})
    vertical = []
    for j in range(nv):
        for i in range(1, nh):
            fold = gamma_b[i, 1] if j == 0 else steps[i, j]['topFoldRad']
            vertical.append({'i': i, 'j': j, 'directionRad': phi_v[i, j],
                             'foldAngleRad': fold,
                             'assignment': 'V' if fold > 0 else 'M'})
    return {
        'kind': 'origamica-rigid-quad-mesh-angle-propagation',
        'horizontalFaces': nh, 'verticalFaces': nv,
        'interiorVertices': vertices,
        'horizontalInteriorCreases': horizontal,
        'verticalInteriorCreases': vertical,
        'maximumLocalClosureErrorRad': max(
            vertex['localClosureErrorRad'] for vertex in vertices),
        'planarAndFoldedCoordinatesSolved': False,
        'globalRigidFoldingChecked': False,
        'selfCollisionChecked': False,
    }


def rigid_quad_mesh_angle_propagation_query(data):
    """JSON contract for the multi-vertex angular recurrence, in degrees."""
    required = {'operation', 'bottomDirectionsDeg', 'bottomFoldAnglesDeg',
                'leftDirectionsDeg', 'leftFoldAnglesDeg'}
    if (not isinstance(data, dict) or set(data) != required
            or data['operation'] != 'rigid-quad-mesh-angle-propagation'):
        raise ValueError('刚性四边网格角度传播参数无效。')
    def angles(key):
        values = data[key]
        if not isinstance(values, list):
            raise ValueError(f'{key}须为角度列表。')
        return [math.radians(_finite(value, key)) for value in values]
    result = rigid_quad_mesh_angle_propagation(
        angles('bottomDirectionsDeg'), angles('bottomFoldAnglesDeg'),
        angles('leftDirectionsDeg'), angles('leftFoldAnglesDeg'))
    for vertex in result['interiorVertices']:
        for key in ('sectorAnglesRad', 'foldAnglesRad', 'incomingDirectionsRad',
                    'outgoingDirectionsRad'):
            vertex[key.replace('Rad', 'Deg')] = [math.degrees(value)
                                                 for value in vertex[key]]
    for crease in (result['horizontalInteriorCreases']
                   + result['verticalInteriorCreases']):
        crease['directionDeg'] = math.degrees(crease['directionRad'])
        crease['foldAngleDeg'] = math.degrees(crease['foldAngleRad'])
    return result
