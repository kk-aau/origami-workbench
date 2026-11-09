"""Rigid quad mesh coordinates from Origamica 15.0.

The notebook's RigidlyFoldableQuadMesh (147011–150139) first propagates local
angles, then minimizes the sum of edge lengths subject to grid closure and
minimum lengths. The rectangular branch fixes its boundary directions; the
irregular branch optimizes them with the four corner angles. This module
checks 2D/3D closures and rigid faces, but not continuous folding paths or
collisions. Nonrectangular BaseFaces remain unsupported.
"""

import itertools
import math

from tessellation_quad_mesh import make_quad_mesh
from tessellation_rigid_single_vertex import (
    _finite,
    rigid_quad_mesh_angle_propagation,
)


def _strict_finite(value, name):
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f'{name} 不是有限数值，无法验证静态三维等距。')
    return number


def _rotation(axis, angle, np):
    """Right-handed Rodrigues matrix about a 3D unit axis."""
    x, y, z = axis
    c, s = math.cos(angle), math.sin(angle)
    return np.array([
        [c+x*x*(1-c), x*y*(1-c)-z*s, x*z*(1-c)+y*s],
        [y*x*(1-c)+z*s, c+y*y*(1-c), y*z*(1-c)-x*s],
        [z*x*(1-c)-y*s, z*y*(1-c)+x*s, c+z*z*(1-c)],
    ])


def _face_frames(nh, nv, h_dir, v_dir, h_fold, v_fold, np):
    """Transport rigid face frames across each crease, then check both paths."""
    identity = np.eye(3)
    frames = {(0, 0): identity}

    def unit_xy(angle):
        return np.array([math.cos(angle), math.sin(angle), 0.0])

    for j in range(nv):
        if j:
            old = frames[0, j-1]
            axis = old @ unit_xy(h_dir[0, j])
            frames[0, j] = _rotation(axis, h_fold[0, j], np) @ old
        for i in range(1, nh):
            old = frames[i-1, j]
            axis = old @ unit_xy(v_dir[i, j])
            frames[i, j] = _rotation(axis, -v_fold[i, j], np) @ old
    maximum_disagreement = 0.0
    for j in range(1, nv):
        for i in range(1, nh):
            old = frames[i, j-1]
            axis = old @ unit_xy(h_dir[i, j])
            alternative = _rotation(axis, h_fold[i, j], np) @ old
            maximum_disagreement = max(maximum_disagreement,
                _strict_finite(np.linalg.norm(alternative - frames[i, j]),
                               '面坐标传播误差'))
    if any(not np.all(np.isfinite(frame)) for frame in frames.values()):
        raise ValueError('面坐标传播产生非有限三维旋转。')
    if maximum_disagreement > 1e-7:
        raise ValueError('局部折角虽闭合，但全局面坐标沿两条路径传播不一致。')
    return frames, maximum_disagreement


def _boundary_and_interior_angles(angular, nh, nv):
    h_dir = {(i, j): 0.0 for i in range(nh) for j in (0, nv)}
    v_dir = {(i, j): math.pi/2 for i in (0, nh) for j in range(nv)}
    h_fold, v_fold = {}, {}
    for crease in angular['horizontalInteriorCreases']:
        key = (crease['i'], crease['j'])
        h_dir[key] = crease['directionRad']
        h_fold[key] = crease['foldAngleRad']
    for crease in angular['verticalInteriorCreases']:
        key = (crease['i'], crease['j'])
        v_dir[key] = crease['directionRad']
        v_fold[key] = crease['foldAngleRad']
    return h_dir, v_dir, h_fold, v_fold


def _minimum_lengths(nh, nv, default_length, overrides):
    default_length = _finite(default_length, '默认最小边长')
    if default_length <= 0:
        raise ValueError('当前完整四边网格要求默认最小边长大于 0。')
    keys = ([(0, i, j) for j in range(nv+1) for i in range(nh)]
            + [(1, i, j) for j in range(nv) for i in range(nh+1)])
    minimums = {key: default_length for key in keys}
    if not isinstance(overrides, (tuple, list)):
        raise ValueError('逐边最小边长须为列表。')
    changed = set()
    for item in overrides:
        if (not isinstance(item, (tuple, list)) or len(item) != 4
                or any(isinstance(value, bool) or not isinstance(value, int)
                       for value in item[:3])):
            raise ValueError('逐边边长须为 [方向, i, j, 最小边长]。')
        key = tuple(item[:3])
        if key not in minimums or key in changed:
            raise ValueError('逐边边长索引无效或重复。')
        value = _finite(item[3], '逐边最小边长')
        if value < 0:
            raise ValueError('逐边最小边长不能为负。')
        minimums[key] = value
        changed.add(key)
    return keys, minimums


def _base_faces(nh, nv, values, frames, np):
    if not isinstance(values, (tuple, list)):
        raise ValueError('基准面须为 [i, j] 索引列表。')
    faces = []
    for value in values:
        if (not isinstance(value, (tuple, list)) or len(value) != 2
                or any(type(index) is not int for index in value)):
            raise ValueError('每个基准面须为 [i, j] 整数索引。')
        i, j = value
        if not 0 <= i < nh or not 0 <= j < nv or (i, j) in faces:
            raise ValueError('基准面索引越界或重复。')
        faces.append((i, j))
    if faces:
        first_normal = frames[faces[0]][:, 2]
        if any(abs(float(first_normal @ frames[face][:, 2])) < 1-1e-7
               for face in faces[1:]):
            raise ValueError('指定基准面的法向不平行，不能构成同一平面。')
    return faces


def _point_coefficients(nh, nv, positions, h_3d, v_3d, np):
    count = len(positions)
    points = {(0, 0): np.zeros((3, count))}
    for j in range(1, nv+1):
        value = points[0, j-1].copy()
        value[:, positions[1, 0, j-1]] += v_3d[0, j-1]
        points[0, j] = value
    for j in range(nv+1):
        for i in range(1, nh+1):
            value = points[i-1, j].copy()
            value[:, positions[0, i-1, j]] += h_3d[i-1, j]
            points[i, j] = value
    return points


def _solve_lengths(nh, nv, keys, minimums, h_2d, v_2d, h_3d, v_3d,
                   base_faces, frames, np):
    from scipy.optimize import linprog

    positions = {key: index for index, key in enumerate(keys)}
    equations = []
    for j in range(nv):
        for i in range(nh):
            # bottom + right - top - left = 0, in both embeddings.
            terms = ((positions[0, i, j], h_2d[i, j], h_3d[i, j], 1),
                     (positions[1, i+1, j], v_2d[i+1, j], v_3d[i+1, j], 1),
                     (positions[0, i, j+1], h_2d[i, j+1], h_3d[i, j+1], -1),
                     (positions[1, i, j], v_2d[i, j], v_3d[i, j], -1))
            for dimension in range(5):
                row = np.zeros(len(keys))
                for index, flat, folded, sign in terms:
                    row[index] = sign * (flat[dimension] if dimension < 2
                                         else folded[dimension-2])
                equations.append(row)
    inequalities = []
    if base_faces:
        coefficients = _point_coefficients(nh, nv, positions, h_3d, v_3d, np)
        def centroid(face):
            i, j = face
            return (coefficients[i, j]+coefficients[i+1, j]
                    +coefficients[i, j+1]+coefficients[i+1, j+1])/4
        first_centroid = centroid(base_faces[0])
        normal = frames[base_faces[0]][:, 2]
        for face in base_faces[1:]:
            equations.append(normal @ (centroid(face)-first_centroid))
        base_vertices = {(i+di, j+dj) for i, j in base_faces
                         for di, dj in ((0, 0), (1, 0), (0, 1), (1, 1))}
        for j in range(nv+1):
            for i in range(nh+1):
                if (i, j) not in base_vertices:
                    inequalities.append(-(normal @ (coefficients[i, j]
                                                    - first_centroid)))
    matrix = np.array(equations)
    solved = linprog(np.ones(len(keys)), A_eq=matrix,
                     b_eq=np.zeros(len(equations)),
                     A_ub=np.array(inequalities) if inequalities else None,
                     b_ub=np.zeros(len(inequalities)) if inequalities else None,
                     bounds=[(minimums[key], None) for key in keys],
                     method='highs')
    if (not solved.success or solved.x is None
            or not np.all(np.isfinite(solved.x))
            or not math.isfinite(float(solved.fun))):
        raise ValueError('给定角度和最小边长无法形成矩形刚性四边网格。')
    lengths = {key: float(solved.x[index]) for index, key in enumerate(keys)}
    closure_error = _strict_finite(np.max(np.abs(matrix @ solved.x)),
                                   '线性网格闭合误差')
    if closure_error > 2e-7 * max(1, solved.fun):
        raise ValueError('求得的边长未满足全部二维和三维网格闭合约束。')
    return lengths, float(solved.fun), closure_error


def _solve_nonrectangular_lengths(nh, nv, keys, minimums, h_dir, v_dir,
                                  corner_angles, base_faces, frames, np):
    """Original nonlinear branch: vary boundary directions and edge lengths.

    The interior crease directions and rigid face frames have already been
    propagated. Every cell must close in the unfolded plane; the full 3D
    closure and rigid-face checks are performed again on the result below.
    """
    from scipy.optimize import minimize

    if len(corner_angles) != 4 or any(not 0 < angle <= math.pi for angle in corner_angles):
        raise ValueError('非矩形纸的四个 CornerAngles 须位于 (0°, 180°]。')
    horizontal = [(0, i, j) for j in (0, nv) for i in range(nh)]
    vertical = [(1, i, j) for i in (0, nh) for j in range(nv)]
    boundary = horizontal + vertical
    positions = {key: index for index, key in enumerate(keys)}
    angle_positions = {key: index for index, key in enumerate(boundary)}
    count = len(keys)
    base_angles = np.array([h_dir[i, j] if d == 0 else v_dir[i, j]
                            for d, i, j in keys], dtype=float)
    boundary_indices = np.array([positions[key] for key in boundary], dtype=int)
    cells = np.array([[positions[0, i, j], positions[1, i+1, j],
                       positions[0, i, j+1], positions[1, i, j]]
                      for j in range(nv) for i in range(nh)], dtype=int)
    signs = np.array((1., 1., -1., -1.))
    # ca = (v_left0-h_bottom0, h_bottomLast+pi-v_right0,
    #       v_rightLast-h_topLast, h_top0+pi-v_leftLast).
    corner_terms = (((1, 0, 0), (0, 0, 0), 1., -1., -corner_angles[0]),
                    ((0, nh-1, 0), (1, nh, 0), 1., -1., math.pi-corner_angles[1]),
                    ((1, nh, nv-1), (0, nh-1, nv), 1., -1., -corner_angles[2]),
                    ((0, 0, nv), (1, 0, nv-1), 1., -1., math.pi-corner_angles[3]))
    def vectors(values):
        angles = base_angles.copy()
        angles[boundary_indices] = values[count:]
        return np.column_stack((np.cos(angles), np.sin(angles)))

    # The source's nonlinear FindMinimum includes BaseFaces centroid-plane
    # equations and other-vertex half-space inequalities. Their heights now
    # depend on boundary angles as well as edge lengths.
    if base_faces:
        normal = frames[base_faces[0]][:, 2]
        def edge_frame(key):
            direction, i, j = key
            return (frames[i, max(0, min(j-1, nv-1))] if direction == 0
                    else frames[max(0, min(i-1, nh-1)), j])
        projection = np.array([normal @ edge_frame(key)[:, :2]
                               for key in keys])
        base_vertices = {(i+di, j+dj) for i, j in base_faces
                         for di, dj in ((0, 0), (1, 0), (0, 1), (1, 1))}
        other_vertices = [(i, j) for j in range(nv+1) for i in range(nh+1)
                          if (i, j) not in base_vertices]
    else:
        projection = None
        other_vertices = []

    def base_height_constraints(values):
        if not base_faces:
            empty = np.empty(0)
            return empty, np.empty((0, len(values))), empty, np.empty((0, len(values)))
        unit = vectors(values)
        projected = np.sum(unit * projection, axis=1)
        turned = np.sum(np.column_stack((-unit[:, 1], unit[:, 0])) * projection,
                        axis=1)
        heights = np.zeros((nh+1, nv+1))
        jacobian = np.zeros((nh+1, nv+1, len(values)))

        def advance(i, j, previous_i, previous_j, key):
            edge = positions[key]
            heights[i, j] = heights[previous_i, previous_j] + values[edge]*projected[edge]
            jacobian[i, j] = jacobian[previous_i, previous_j]
            jacobian[i, j, edge] += projected[edge]
            angle = angle_positions.get(key)
            if angle is not None:
                jacobian[i, j, count+angle] += values[edge]*turned[edge]

        for j in range(1, nv+1):
            advance(0, j, 0, j-1, (1, 0, j-1))
        for j in range(nv+1):
            for i in range(1, nh+1):
                advance(i, j, i-1, j, (0, i-1, j))

        def centroid(face):
            i, j = face
            return (heights[i, j]+heights[i+1, j]
                    +heights[i, j+1]+heights[i+1, j+1])/4

        def centroid_jacobian(face):
            i, j = face
            return (jacobian[i, j]+jacobian[i+1, j]
                    +jacobian[i, j+1]+jacobian[i+1, j+1])/4

        first = centroid(base_faces[0])
        first_jacobian = centroid_jacobian(base_faces[0])
        equalities = np.array([centroid(face)-first for face in base_faces[1:]])
        equality_jacobian = np.array([
            centroid_jacobian(face)-first_jacobian for face in base_faces[1:]
        ]).reshape((-1, len(values)))
        inequalities = np.array([heights[i, j]-first for i, j in other_vertices])
        inequality_jacobian = np.array([
            jacobian[i, j]-first_jacobian for i, j in other_vertices
        ]).reshape((-1, len(values)))
        return equalities, equality_jacobian, inequalities, inequality_jacobian

    def equalities(values):
        unit = vectors(values)
        cell = (values[cells, None]*unit[cells]*signs[None, :, None]).sum(axis=1).ravel()
        corner = np.array([sa*values[count+angle_positions[a]]
                           + sb*values[count+angle_positions[b]]+constant
                           for a, b, sa, sb, constant in corner_terms])
        return np.concatenate((cell, corner, base_height_constraints(values)[0]))

    def equality_jacobian(values):
        unit = vectors(values)
        jac = np.zeros((2*len(cells)+4, len(values)))
        for cell_index, edges in enumerate(cells):
            for local_index, edge in enumerate(edges):
                sign = signs[local_index]
                jac[2*cell_index:2*cell_index+2, edge] += sign*unit[edge]
                angle_index = angle_positions.get(keys[edge])
                if angle_index is not None:
                    jac[2*cell_index:2*cell_index+2, count+angle_index] += (
                        sign*values[edge]*np.array((-unit[edge, 1], unit[edge, 0])))
        for row, (a, b, sa, sb, _) in enumerate(corner_terms, start=2*len(cells)):
            jac[row, count+angle_positions[a]] += sa
            jac[row, count+angle_positions[b]] += sb
        base_jacobian = base_height_constraints(values)[1]
        return np.vstack((jac, base_jacobian)) if len(base_jacobian) else jac

    objective_gradient = np.concatenate((np.ones(count), np.zeros(len(boundary))))
    angular_seed = np.array([0. if key[0] == 0 else math.pi/2
                             for key in boundary])
    angular_seed[angle_positions[1, 0, 0]] = corner_angles[0]
    angular_seed[angle_positions[1, nh, 0]] = math.pi-corner_angles[1]
    angular_seed[angle_positions[1, nh, nv-1]] = corner_angles[2]
    angular_seed[angle_positions[1, 0, nv-1]] = math.pi-corner_angles[3]
    bounds = [(minimums[key], None) for key in keys] + [(None, None)]*len(boundary)
    initial_lengths = np.array([minimums[key] for key in keys])
    constraints = [{'type': 'eq', 'fun': equalities,
                    'jac': equality_jacobian}]
    if other_vertices:
        constraints.append({'type': 'ineq',
                            'fun': lambda values: base_height_constraints(values)[2],
                            'jac': lambda values: base_height_constraints(values)[3]})
    attempts = []
    for scale in (1., 2., 5.):
        start = np.concatenate((initial_lengths*scale, angular_seed))
        solved = minimize(lambda values: float(np.sum(values[:count])), start,
                          jac=lambda _: objective_gradient, method='SLSQP',
                          constraints=constraints,
                          bounds=bounds,
                          options={'ftol': 1e-10, 'maxiter': 500})
        if (not solved.success or solved.x is None
                or not np.all(np.isfinite(solved.x))
                or not math.isfinite(float(solved.fun))):
            continue
        residuals = equalities(solved.x)
        if not np.all(np.isfinite(residuals)):
            continue
        heights = base_height_constraints(solved.x)[2]
        if not np.all(np.isfinite(heights)):
            continue
        residual = float(np.max(np.abs(residuals)))
        if (residual < 2e-8*max(1., solved.fun)
                and (not len(heights) or np.min(heights) >= -2e-8*max(1., solved.fun))
                and all(solved.x[index] >= minimums[key]-1e-8
                        for index, key in enumerate(keys))):
            attempts.append(solved)
            if solved.success:
                break
    if not attempts:
        raise ValueError('非矩形刚性网格的边长与边界方向优化未收敛。')
    best = min(attempts, key=lambda result: result.fun)
    for key, value in zip(boundary, best.x[count:]):
        if key[0] == 0:
            h_dir[key[1:]] = float(value)
        else:
            v_dir[key[1:]] = float(value)
    lengths = {key: float(best.x[index]) for index, key in enumerate(keys)}
    return lengths, float(best.fun), _strict_finite(
        np.max(np.abs(equalities(best.x))), '非线性网格闭合误差')


def _positions(nh, nv, lengths, h_directions, v_directions, dimension, np):
    origin = np.zeros(dimension)
    points = {(0, 0): origin}
    for j in range(1, nv+1):
        points[0, j] = points[0, j-1] + lengths[1, 0, j-1] * v_directions[0, j-1]
    for j in range(nv+1):
        for i in range(1, nh+1):
            points[i, j] = points[i-1, j] + lengths[0, i-1, j] * h_directions[i-1, j]
    if any(not np.all(np.isfinite(point)) for point in points.values()):
        raise ValueError('网格坐标含非有限数值。')
    maximum_gap = 0.0
    for j in range(nv):
        for i in range(1, nh+1):
            expected = points[i, j] + lengths[1, i, j] * v_directions[i, j]
            maximum_gap = max(maximum_gap,
                              _strict_finite(np.linalg.norm(expected - points[i, j+1]),
                                             '网格坐标闭合误差'))
    return points, maximum_gap


def _planar_edges_cross(a, b, c, d, tolerance):
    """Inclusive segment intersection for edges without shared vertex IDs."""
    def orient(p, q, r):
        return ((q[0]-p[0])*(r[1]-p[1])
                - (q[1]-p[1])*(r[0]-p[0]))

    def on_segment(p, q, r):
        return (min(p[0], q[0])-tolerance <= r[0] <= max(p[0], q[0])+tolerance
                and min(p[1], q[1])-tolerance <= r[1] <= max(p[1], q[1])+tolerance)

    o1, o2 = orient(a, b, c), orient(a, b, d)
    o3, o4 = orient(c, d, a), orient(c, d, b)
    if ((o1 > tolerance and o2 < -tolerance or o1 < -tolerance and o2 > tolerance)
            and (o3 > tolerance and o4 < -tolerance or o3 < -tolerance and o4 > tolerance)):
        return True
    return ((abs(o1) <= tolerance and on_segment(a, b, c))
            or (abs(o2) <= tolerance and on_segment(a, b, d))
            or (abs(o3) <= tolerance and on_segment(c, d, a))
            or (abs(o4) <= tolerance and on_segment(c, d, b)))


def _sector_failure(error, angular):
    """Convert the notebook's failure-only Print into a bounded API message."""
    vertices = angular['interiorVertices']
    rows = []
    for vertex in vertices[:8]:
        sectors = vertex['sectorAnglesRad']
        # Origamica prints alpha1, alpha2, alpha3, alpha4; the local fan
        # stores them starting at the upper-right sector instead.
        ordered = (sectors[2], sectors[3], sectors[0], sectors[1])
        angles = ', '.join(f'{math.degrees(angle):.3f}°' for angle in ordered)
        rows.append(f"({vertex['i']},{vertex['j']}): [{angles}]")
    suffix = f'；其余 {len(vertices)-len(rows)} 个顶点略' if len(vertices) > len(rows) else ''
    return ValueError(f'{error} 扇区角诊断（共 {len(vertices)} 个内部顶点）：'
                      + '；'.join(rows) + suffix)


def rigid_rectangular_quad_mesh(bottom_directions, bottom_folds,
                                left_directions, left_folds, *,
                                default_minimum_edge_length=1,
                                minimum_edge_lengths=(),
                                base_faces=(),
                                rectangular=True,
                                corner_angles=None,
                                add_plane_graph=True,
                                print_sectors_on_fail=False,
                                same_pt_tolerance=1e-6):
    """Solve Origamica's rigid quad mesh as CP and one static 3D state.

    Angles are radians. This bounded implementation accepts 1–12 interior
    creases on each input side. An explicitly zero minimum may merge adjacent
    vertices and create triangular faces. Nonrectangular paper uses a nonlinear
    boundary direction search. The BaseFaces combination follows the source
    constraints, without a saved Origamica numerical output for comparison.
    """
    import numpy as np

    angular = rigid_quad_mesh_angle_propagation(
        bottom_directions, bottom_folds, left_directions, left_folds)
    nh, nv = angular['horizontalFaces'], angular['verticalFaces']
    if nh > 13 or nv > 13:
        raise ValueError('完整四边网格每方向最多支持 12 条内部折线。')
    if type(rectangular) is not bool:
        raise ValueError('rectangular 须为布尔值。')
    if type(add_plane_graph) is not bool or type(print_sectors_on_fail) is not bool:
        raise ValueError('AddPlaneGraph 和 PrintSectorsOnFail 须为布尔值。')
    if corner_angles is None:
        corner_angles = [math.pi/2]*4
    if not isinstance(corner_angles, (list, tuple)) or len(corner_angles) != 4:
        raise ValueError('CornerAngles 须为四个角度。')
    corner_angles = [_finite(angle, 'CornerAngles') for angle in corner_angles]
    h_dir, v_dir, h_fold, v_fold = _boundary_and_interior_angles(angular, nh, nv)
    frames, frame_error = _face_frames(nh, nv, h_dir, v_dir, h_fold, v_fold, np)
    base_faces = _base_faces(nh, nv, base_faces, frames, np)
    edge_keys, minimums = _minimum_lengths(
        nh, nv, default_minimum_edge_length, minimum_edge_lengths)
    nonrectangular_solution = None
    if not rectangular:
        try:
            nonrectangular_solution = _solve_nonrectangular_lengths(
                nh, nv, edge_keys, minimums, h_dir, v_dir, corner_angles,
                base_faces, frames, np)
        except ValueError as error:
            if print_sectors_on_fail:
                raise _sector_failure(error, angular) from error
            raise

    def planar(angle):
        return np.array((math.cos(angle), math.sin(angle)))

    def spatial(angle):
        return np.array((math.cos(angle), math.sin(angle), 0.0))

    h_2d = {key: planar(value) for key, value in h_dir.items()}
    v_2d = {key: planar(value) for key, value in v_dir.items()}
    h_3d = {(i, j): frames[i, max(0, min(j-1, nv-1))] @ spatial(h_dir[i, j])
            for i in range(nh) for j in range(nv+1)}
    v_3d = {(i, j): frames[max(0, min(i-1, nh-1)), j] @ spatial(v_dir[i, j])
            for i in range(nh+1) for j in range(nv)}
    if any(not np.all(np.isfinite(vector)) for directions in
           (h_2d, v_2d, h_3d, v_3d) for vector in directions.values()):
        raise ValueError('二维或三维边方向出现非有限数值。')
    maximum_axis_error = 0.0
    for j in range(1, nv):
        for i in range(nh):
            above = frames[i, j] @ spatial(h_dir[i, j])
            maximum_axis_error = max(maximum_axis_error,
                _strict_finite(np.linalg.norm(above - h_3d[i, j]),
                               '水平共享折线方向误差'))
    for i in range(1, nh):
        for j in range(nv):
            right = frames[i, j] @ spatial(v_dir[i, j])
            maximum_axis_error = max(maximum_axis_error,
                _strict_finite(np.linalg.norm(right - v_3d[i, j]),
                               '垂直共享折线方向误差'))
    if maximum_axis_error > 1e-7:
        raise ValueError('共享折线的三维方向在相邻面上不一致。')

    if nonrectangular_solution is not None:
        lengths, minimum_total, closure_error = nonrectangular_solution
    else:
        try:
            lengths, minimum_total, closure_error = _solve_lengths(
                nh, nv, edge_keys, minimums, h_2d, v_2d, h_3d, v_3d,
                base_faces, frames, np)
        except ValueError as error:
            if print_sectors_on_fail:
                raise _sector_failure(error, angular) from error
            raise
    _strict_finite(minimum_total, '总边长')
    _strict_finite(closure_error, '优化闭合误差')
    if any(not math.isfinite(length) or length < 0 for length in lengths.values()):
        raise ValueError('求得的边长含非有限数值或负数。')
    planar_points, planar_gap = _positions(nh, nv, lengths, h_2d, v_2d, 2, np)
    folded_points, spatial_gap = _positions(nh, nv, lengths, h_3d, v_3d, 3, np)
    if max(planar_gap, spatial_gap) > 2e-7 * max(1, minimum_total):
        raise ValueError('共享顶点沿不同行列到达时位置不一致。')
    maximum_base_height_error = 0.0
    minimum_other_height = None
    if base_faces:
        normal = frames[base_faces[0]][:, 2]
        def centroid(face):
            i, j = face
            return sum((folded_points[i+di, j+dj]
                        for di, dj in ((0, 0), (1, 0), (0, 1), (1, 1))),
                       np.zeros(3))/4
        first_centroid = centroid(base_faces[0])
        maximum_base_height_error = max(
            [_strict_finite(abs(normal @ (centroid(face)-first_centroid)),
                            '基准面共面误差')
             for face in base_faces[1:]] or [0.0])
        base_vertices = {(i+di, j+dj) for i, j in base_faces
                         for di, dj in ((0, 0), (1, 0), (0, 1), (1, 1))}
        other_heights = [_strict_finite(normal @ (point-first_centroid),
                                        '其他顶点背板高度')
                         for key, point in folded_points.items()
                         if key not in base_vertices]
        minimum_other_height = min(other_heights) if other_heights else None
        if (maximum_base_height_error > 2e-7 * max(1, minimum_total)
                or (minimum_other_height is not None
                    and minimum_other_height < -2e-7 * max(1, minimum_total))):
            raise ValueError('基准面未能保持共面，或其他顶点落到基准面下方。')

    graph = make_quad_mesh(
        nh, nv,
        vertices_fn=lambda i, j: tuple(map(float, planar_points[i, j])),
        vertices3d_fn=lambda i, j: tuple(map(float, folded_points[i, j])),
        horizontal_type_fn=lambda i, j: ('V' if h_fold[i, j] > 0 else 'M')
                                          if 0 < j < nv else 'B',
        vertical_type_fn=lambda i, j: ('V' if v_fold[i, j] > 0 else 'M')
                                        if 0 < i < nh else 'B',
        horizontal_angle_fn=lambda i, j: h_fold[i, j] if 0 < j < nv else 0,
        vertical_angle_fn=lambda i, j: v_fold[i, j] if 0 < i < nh else 0,
        border_override=True,
        same_pt_tolerance=same_pt_tolerance,
    )
    grid = graph['indexGrid']
    faces = []
    for j in range(nv):
        for i in range(nh):
            raw = (grid[j][i], grid[j][i+1], grid[j+1][i+1], grid[j+1][i])
            face = []
            for vertex in raw:
                if not face or vertex != face[-1]:
                    face.append(vertex)
            if face[0] == face[-1]:
                face.pop()
            if len(face) < 3 or len(set(face)) != len(face):
                raise ValueError('零长度边使纸面坍缩，无法形成有效三角面或四边形面。')
            faces.append(face)
    maximum_face_error = 0.0
    minimum_area = math.inf
    maximum_normal_error = 0.0
    face_normals = {}
    face_area_sum = 0.0
    for j in range(nv):
        for i in range(nh):
            face = faces[j*nh+i]
            flat = [np.array(graph['vertices_coords'][index]) for index in face]
            folded = [np.array(graph['vertices_coords3d'][index]) for index in face]
            twice_area = _strict_finite(sum(
                _strict_finite(np.linalg.det(np.array([flat[k],flat[(k+1)%len(face)]])),
                               '展开面面积项') for k in range(len(face))), '展开面面积')
            minimum_area = min(minimum_area, twice_area/2)
            face_area_sum = _strict_finite(face_area_sum + twice_area/2,
                                           '展开面面积总和')
            if twice_area <= 1e-9:
                raise ValueError('展开图中出现退化或反向四边形面。')
            for a, b in itertools.combinations(range(len(face)), 2):
                flat_length = _strict_finite(np.linalg.norm(flat[a]-flat[b]),
                                             '展开面顶点距离')
                folded_length = _strict_finite(np.linalg.norm(folded[a]-folded[b]),
                                               '折后面顶点距离')
                maximum_face_error = max(maximum_face_error,
                    _strict_finite(abs(flat_length-folded_length), '面内等距误差'))
            a = folded[1] - folded[0]
            b = folded[-1] - folded[0]
            normal = np.cross(a, b)
            normal_length = _strict_finite(np.linalg.norm(normal), '折后面法向长度')
            if normal_length <= 1e-10:
                raise ValueError('折后面退化，无法定义可信的面法向。')
            normal /= normal_length
            face_normals[i, j] = normal
            maximum_normal_error = max(maximum_normal_error,
                _strict_finite(np.linalg.norm(normal - frames[i,j][:,2]),
                               '折后面法向误差'))
    if maximum_face_error > 2e-7 * max(1, minimum_total):
        raise ValueError('折后四边形面与纸面长度不一致。')
    if maximum_normal_error > 1e-6:
        raise ValueError('折后面法向与折角传播不一致。')
    maximum_fold_error = 0.0
    for j in range(1, nv):
        for i in range(nh):
            below, above = face_normals[i, j-1], face_normals[i, j]
            axis = h_3d[i, j]
            measured = _strict_finite(math.atan2(
                _strict_finite(axis @ np.cross(below, above), '水平折角正弦项'),
                _strict_finite(below @ above, '水平折角余弦项')), '水平折角')
            error = _strict_finite(abs(math.atan2(math.sin(measured - h_fold[i, j]),
                                   math.cos(measured - h_fold[i, j]))), '水平折角误差')
            maximum_fold_error = max(maximum_fold_error, error)
    for i in range(1, nh):
        for j in range(nv):
            left, right = face_normals[i-1, j], face_normals[i, j]
            axis = v_3d[i, j]
            measured = _strict_finite(math.atan2(
                _strict_finite(axis @ np.cross(left, right), '垂直折角正弦项'),
                _strict_finite(left @ right, '垂直折角余弦项')), '垂直折角')
            error = _strict_finite(abs(math.atan2(math.sin(measured + v_fold[i, j]),
                                   math.cos(measured + v_fold[i, j]))), '垂直折角误差')
            maximum_fold_error = max(maximum_fold_error, error)
    if maximum_fold_error > 1e-6:
        raise ValueError('折后共享边的二面角与折角输入不一致。')

    flat_points = graph['vertices_coords']
    boundary = ([grid[0][i] for i in range(nh+1)]
                + [grid[j][nh] for j in range(1, nv+1)]
                + [grid[nv][i] for i in range(nh-1, -1, -1)]
                + [grid[j][0] for j in range(nv-1, 0, -1)])
    paper_area = _strict_finite(sum(
        flat_points[boundary[index]][0]*flat_points[boundary[(index+1)%len(boundary)]][1]
        - flat_points[boundary[index]][1]*flat_points[boundary[(index+1)%len(boundary)]][0]
        for index in range(len(boundary)))/2, '纸张轮廓面积')
    if paper_area <= 0:
        raise ValueError('纸张轮廓面积不是正数。')
    area_error = _strict_finite(abs(face_area_sum - paper_area),
                                '折痕面与纸张轮廓的面积误差')
    if area_error > 1e-7 * max(1, paper_area):
        raise ValueError('展开面的面积未填满纸张轮廓。')
    crossing_tolerance = 1e-9 * max(1, paper_area)
    if add_plane_graph:
        for first, second in itertools.combinations(graph['edges_vertices'], 2):
            if set(first) & set(second):
                continue
            if _planar_edges_cross(flat_points[first[0]], flat_points[first[1]],
                                   flat_points[second[0]], flat_points[second[1]],
                                   crossing_tolerance):
                raise ValueError('展开图出现非邻接折线交叉。')
    metrics = (minimum_total, closure_error, planar_gap, spatial_gap,
               maximum_axis_error, frame_error, maximum_face_error,
               maximum_normal_error, maximum_fold_error,
               maximum_base_height_error, minimum_area, paper_area,
               area_error, angular['maximumLocalClosureErrorRad'])
    if any(not math.isfinite(float(value)) for value in metrics):
        raise ValueError('静态三维验收指标出现非有限数值。')
    graph.update({
        'kind': ('origamica-rigid-rectangular-quad-mesh' if rectangular
                 else 'origamica-rigid-nonrectangular-quad-mesh'),
        'faces_vertices': faces if add_plane_graph else [],
        'horizontalFaces': nh, 'verticalFaces': nv,
        'minimumTotalEdgeLength': minimum_total,
        'edgeMinimums': [minimums[key] for key in edge_keys],
        'maximumGridClosureError': max(closure_error, planar_gap, spatial_gap),
        'maximumSharedEdgeDirectionError': maximum_axis_error,
        'maximumFrameLoopError': frame_error,
        'maximumFaceDistanceError': maximum_face_error,
        'maximumFaceNormalError': maximum_normal_error,
        'maximumFoldAngleErrorRad': maximum_fold_error,
        'baseFaces': [list(face) for face in base_faces],
        'maximumBaseFaceHeightError': maximum_base_height_error,
        'minimumOtherVertexHeight': minimum_other_height,
        'minimumPlanarFaceArea': minimum_area,
        'paperArea': paper_area,
        'rectangleArea': paper_area if rectangular else None,
        'faceAreaSumError': area_error,
        'planarEdgeCrossingChecked': add_plane_graph,
        'planeGraphBuilt': add_plane_graph,
        'printSectorsOnFail': print_sectors_on_fail,
        'maximumLocalClosureErrorRad': angular['maximumLocalClosureErrorRad'],
        'continuousRigidPathChecked': False,
        'selfCollisionChecked': False,
        'staticGlobalIsometryChecked': True,
        'globalRigidFoldingChecked': False,
        'rectangular': rectangular,
        'cornerAnglesDeg': [math.degrees(angle) for angle in corner_angles],
        'boundaryDirectionsDeg': {
            'bottom': [math.degrees(h_dir[i, 0]) for i in range(nh)],
            'top': [math.degrees(h_dir[i, nv]) for i in range(nh)],
            'left': [math.degrees(v_dir[0, j]) for j in range(nv)],
            'right': [math.degrees(v_dir[nh, j]) for j in range(nv)],
        },
        'unsupportedOrigamicaOptions': [],
        'unverifiedOrigamicaOptions': (
            ['Rectangular=False with BaseFaces: no saved Wolfram numerical output']
            if not rectangular and base_faces else []),
    })
    return graph


def rigid_rectangular_quad_mesh_query(data):
    """Degree-based JSON query for rectangular and bounded irregular branches."""
    allowed = {'operation', 'bottomDirectionsDeg', 'bottomFoldAnglesDeg',
               'leftDirectionsDeg', 'leftFoldAnglesDeg',
               'minimumEdgeLength', 'minimumEdgeLengths', 'baseFaces',
               'rectangular', 'cornerAnglesDeg', 'addPlaneGraph',
               'printSectorsOnFail', 'samePtTolerance'}
    required = {'operation', 'bottomDirectionsDeg', 'bottomFoldAnglesDeg',
                'leftDirectionsDeg', 'leftFoldAnglesDeg'}
    if (not isinstance(data, dict) or data.get('operation') != 'rigid-quad-mesh'
            or not required <= set(data) or set(data) - allowed):
        raise ValueError('刚性四边网格参数无效。')
    def values(key):
        angles = data[key]
        if not isinstance(angles, list):
            raise ValueError(f'{key}须为角度列表。')
        return [math.radians(_finite(angle, key)) for angle in angles]
    corner_angles = data.get('cornerAnglesDeg', 90)
    if not isinstance(corner_angles, list):
        corner_angles = [corner_angles]*4
    if len(corner_angles) != 4:
        raise ValueError('CornerAngles 须为一个角度或四个角度。')
    corner_angles = [math.radians(_finite(angle, 'CornerAngles'))
                     for angle in corner_angles]
    result = rigid_rectangular_quad_mesh(
        values('bottomDirectionsDeg'), values('bottomFoldAnglesDeg'),
        values('leftDirectionsDeg'), values('leftFoldAnglesDeg'),
        default_minimum_edge_length=data.get('minimumEdgeLength', 1),
        minimum_edge_lengths=data.get('minimumEdgeLengths', ()),
        base_faces=data.get('baseFaces', ()),
        rectangular=data.get('rectangular', True),
        corner_angles=corner_angles,
        add_plane_graph=data.get('addPlaneGraph', True),
        print_sectors_on_fail=data.get('printSectorsOnFail', False),
        same_pt_tolerance=data.get('samePtTolerance', 1e-6),
    )
    result['edges_foldAngleDeg'] = [math.degrees(angle)
                                    for angle in result['edges_foldAngleRad']]
    return result
