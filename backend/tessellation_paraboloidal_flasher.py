"""Numerical paraboloidal Flasher DP/FF and its cut, true 2D development.

Origamica 15.0 In[4204] compares edge lengths of the three-dimensional
deployed paraboloid (DP) with the stowed folded form (FF). Its displayed CP is
only the vertical projection of DP. In[4209] cuts the DP before unfolding it.
This module keeps those three states separate and certifies every triangle of
the resulting developed, cut sheet against both spatial states.
"""

from collections import defaultdict, deque
import math

import numpy as np
from scipy.optimize import least_squares

from tessellation_flasher import flasher_default_cp_point, flasher_ideal_cp_seed
from tessellation_flasher_solver import (
    _assign_fold_types, _rotate, _sector_topology, flasher_default_ff_point,
)


_LENGTH_TOLERANCE = 1e-7
_AREA_TOLERANCE = 1e-10


def _cross2(a, b):
    return float(a[0] * b[1] - a[1] * b[0])


def paraboloidal_default_dp_point(i, j, k, m, f):
    """In[4103]: the ideal seed XY and its paraboloidal sag z=(x²+y²)/4f."""
    if isinstance(f, bool) or not isinstance(f, (int, float)) or not math.isfinite(f) or f <= 0:
        raise ValueError('抛物面 Flasher 焦距须为有限正数。')
    x, y = flasher_default_cp_point(i, j, k, m)
    return [x, y, (x * x + y * y) / (4 * f)]


def _validate(r, h, m, f, dr, diagonal, minimum_angle_deg, max_nfev):
    if any(type(v) is not int for v in (r, h, m)) or not (1 <= r <= 2 and 1 <= h <= 3 and 3 <= m <= 8 and r * h <= 6):
        raise ValueError('抛物面 Flasher 数值复现暂限 1≤r≤2、1≤h≤3、3≤m≤8、rh≤6。')
    if diagonal not in ('X', 'Y', 'Z'):
        raise ValueError('抛物面 Flasher 对角线须为 X、Y 或 Z。')
    if isinstance(f, bool) or not isinstance(f, (int, float)) or not math.isfinite(f) or not .1 <= f <= 1e7:
        raise ValueError('抛物面 Flasher 焦距须为 0.1–10⁷ 的有限数。')
    if isinstance(dr, bool) or not isinstance(dr, (int, float)) or not math.isfinite(dr) or not 0 <= dr <= .5:
        raise ValueError('抛物面 Flasher 径向增量须为 0–0.5 的有限数。')
    if isinstance(minimum_angle_deg, bool) or not isinstance(minimum_angle_deg, (int, float)) or not math.isfinite(minimum_angle_deg) or not 0 <= minimum_angle_deg <= 180:
        raise ValueError('抛物面 Flasher 最小折角须在 0° 到 180° 之间。')
    if type(max_nfev) is not int or not 1 <= max_nfev <= 20000:
        raise ValueError('求解迭代限额须为 1–20000 的整数。')


def _triangles(seed, projection):
    """Orient source triangles and triangulate the planar central polygon."""
    center = seed['center_vertices']
    faces = [list(face) for face in seed['faces_vertices']]
    faces += [[center[0], center[i], center[i + 1]] for i in range(1, len(center) - 1)]
    oriented = []
    for face in faces:
        a, b, c = projection[face]
        area2 = _cross2(b - a, c - a)
        if abs(area2) < _AREA_TOLERANCE:
            raise ValueError('抛物面 Flasher 投影三角面退化。')
        oriented.append(face if area2 > 0 else [face[0], face[2], face[1]])
    return oriented


def _triangle_audit(projection, dp, ff, faces, seed_projection):
    errors = []
    dp_areas = []
    ff_areas = []
    projected_areas = []
    for face in faces:
        a, b, c = face
        original_area = _cross2(seed_projection[b] - seed_projection[a],
                                seed_projection[c] - seed_projection[a])
        projected_area = _cross2(projection[b] - projection[a],
                                 projection[c] - projection[a])
        if original_area * projected_area <= 0:
            raise ValueError('抛物面 Flasher 投影出现反向三角面。')
        projected_areas.append(abs(projected_area) / 2)
        dp_areas.append(float(np.linalg.norm(np.cross(dp[b] - dp[a], dp[c] - dp[a]))) / 2)
        ff_areas.append(float(np.linalg.norm(np.cross(ff[b] - ff[a], ff[c] - ff[a]))) / 2)
        for u, v in ((a, b), (b, c), (c, a)):
            errors.append(abs(float(np.linalg.norm(dp[u] - dp[v]) -
                                    np.linalg.norm(ff[u] - ff[v]))))
    if min(projected_areas + dp_areas + ff_areas) < _AREA_TOLERANCE:
        raise ValueError('抛物面 Flasher 三角面退化。')
    return max(errors), min(dp_areas), min(ff_areas)


def solve_paraboloidal_flasher(r, h, m, f, dr, diagonal='Y', *,
                               minimum_angle_deg=.5, max_nfev=4000):
    """Solve In[4204]'s DP/FF equations on a bounded, checked domain.

    The returned ``projected_vertices_coords`` are only the original object's
    vertical projection, never a planar development. Use
    ``cut_paraboloidal_flasher`` for a true 2D sheet.
    """
    _validate(r, h, m, f, dr, diagonal, minimum_angle_deg, max_nfev)
    labels, references = _sector_topology(r, h, m, diagonal)
    n = len(labels)
    xy0 = np.asarray([flasher_default_cp_point(i, j, 0, m)
                      for i, j in labels], dtype=float)
    ff0 = np.asarray([flasher_default_ff_point(i, j, 0, h, m, dr)
                      for i, j in labels], dtype=float)
    ff_xy = ff0[:, :2]
    index = {label: pos for pos, label in enumerate(labels)}
    outer = [(r * h, j * h) for j in range(r + 1)] + [
        (i * h - 1, r * h) for i in range(1, r + 1)]
    outer_pos = [index[label] for label in outer]
    outer_heights = np.asarray([
        flasher_default_ff_point(*label, 0, h, m, 0)[2] for label in outer])
    center_pos = index[(0, 0)]
    perpendicular = np.array((-xy0[center_pos, 1], xy0[center_pos, 0]))

    def point(values, reference):
        i, j, k = reference
        return _rotate(values[index[i, j]], k, m)

    def unpack(x):
        xy = x[:2 * n].reshape((n, 2))
        dp = np.column_stack((xy, np.sum(xy * xy, axis=1) / (4 * f)))
        ff = np.column_stack((ff_xy, x[2 * n:3 * n]))
        return xy, dp, ff, x[-1]

    def residual(x):
        xy, dp, ff, dz = unpack(x)
        iso = [np.linalg.norm(point(ff, a) - point(ff, b)) -
               np.linalg.norm(point(dp, a) - point(dp, b))
               for a, b in references]
        return np.asarray([np.dot(xy[center_pos], perpendicular), *iso,
                           *(ff[outer_pos, 2] - (1 + dz) * outer_heights),
                           ff[center_pos, 2]])

    x0 = np.r_[xy0.ravel(), ff0[:, 2], 0.]
    if len(residual(x0)) != len(x0):
        raise ValueError('抛物面 Flasher 方程数与未知量不平衡。')
    sol = least_squares(residual, x0, method='lm', max_nfev=max_nfev,
                        xtol=1e-12, ftol=1e-12, gtol=1e-12)
    values = residual(sol.x)
    iso_sum = float(np.abs(values[1:1 + len(references)]).sum())
    if not sol.success or iso_sum > 1e-6 or float(np.max(np.abs(values))) > 1e-6:
        raise ValueError(f'抛物面 Flasher 方程未收敛：isometry_sum={iso_sum:.6g}, '
                         f'max_error={np.max(np.abs(values)):.6g}, {sol.message}')

    xy, dp, ff, dz = unpack(sol.x)
    seed = flasher_ideal_cp_seed(r, h, m, diagonal)
    projected = np.asarray([point(xy, ref)[:2] for ref in seed['vertex_ijk']])
    deployed = np.asarray([point(dp, ref) for ref in seed['vertex_ijk']])
    folded = np.asarray([point(ff, ref) for ref in seed['vertex_ijk']])
    seed_projection = np.asarray(seed['vertices_coords'])
    triangles = _triangles(seed, projected)
    maximum_error, minimum_dp_area, minimum_ff_area = _triangle_audit(
        projected, deployed, folded, triangles, seed_projection)
    if maximum_error > _LENGTH_TOLERANCE:
        raise ValueError(f'抛物面 Flasher 部署形与折后形不等距：{maximum_error:.6g}。')
    graph_faces = [*triangles[:len(seed['faces_vertices'])],
                   seed['center_vertices']]
    graph_edges, fold_angles, edge_types = _assign_fold_types(
        projected, folded, graph_faces, minimum_angle_deg)
    return {
        'kind': 'paraboloidal-flasher-uncut-dp-ff',
        'rings': r, 'heightOrder': h, 'rotationalOrder': m,
        'focalLength': float(f), 'radialIncrement': float(dr),
        'diagonal': diagonal, 'minimumAngleDegrees': float(minimum_angle_deg),
        'vertex_ij': [list(label) for label in labels],
        'vertex_ijk': seed['vertex_ijk'],
        'projected_vertices_coords': projected.tolist(),
        'deployed_vertices_coords': deployed.tolist(),
        'folded_vertices_coords': folded.tolist(),
        'faces_vertices': graph_faces,
        'audit_triangles_vertices': triangles,
        'source_faces_vertices': seed['faces_vertices'],
        'quads_vertices': seed['quads_vertices'],
        'center_vertices': seed['center_vertices'],
        'edges_vertices': graph_edges, 'edge_types': edge_types,
        'fold_angles_rad': fold_angles,
        'edge_references': [[list(a), list(b)] for a, b in references],
        'outerHeightAdjustment': float(dz),
        'isometryResidualSum': iso_sum,
        'maxEquationResidual': float(np.max(np.abs(values))),
        'maxDPFFFaceEdgeError': maximum_error,
        'minimumDPFaceArea': minimum_dp_area,
        'minimumFFFaceArea': minimum_ff_area,
        'hasTruePlanarDevelopment': False,
    }


def _original_cut_edges(r, h, m, vertex_ijk):
    """In[4209]: bottoms, diagonals, left axials and right axials."""
    lookup = {tuple(label): pos for pos, label in enumerate(vertex_ijk)}
    n = r * h
    cuts = set()

    def add(a, b):
        try:
            cuts.add(tuple(sorted((lookup[a], lookup[b]))))
        except KeyError as exc:
            raise ValueError('原版抛物面剪裁边缺少顶点。') from exc

    for k in range(m):
        for i in range(n):
            add((i, 0, k), (i + 1, 0, k))
        for i in range(n - 1):
            add((i, i + 1, k), (i + 1, i + 2, k))
        for ring in range(1, r):
            for i in range(h * ring, n):
                add((i, h * ring, k), (i, min(i + 1, h * ring + h), k))
            for j in range(h * ring + 1, n):
                add((h * ring - 1, j, k),
                    (min(j - 1, h * ring - 1 + h), j, k))
    return cuts


def _place_third(a, b, parent_third, length_a, length_b):
    direction = b - a
    span = float(np.linalg.norm(direction))
    if span <= _AREA_TOLERANCE:
        raise ValueError('抛物面展开共享边退化。')
    along = (length_a * length_a - length_b * length_b + span * span) / (2 * span)
    altitude2 = length_a * length_a - along * along
    if altitude2 <= _AREA_TOLERANCE:
        raise ValueError('抛物面展开三角面退化。')
    unit = direction / span
    perpendicular = np.array((-unit[1], unit[0]))
    parent_side = _cross2(direction, parent_third - a)
    if abs(parent_side) <= _AREA_TOLERANCE:
        raise ValueError('抛物面展开父面退化。')
    side = -1 if parent_side > 0 else 1
    return a + along * unit + side * math.sqrt(altitude2) * perpendicular


def cut_paraboloidal_flasher(solved, *, minimum_angle_deg=.5):
    """Cut at In[4209]'s edges and unfold each triangle along the dual tree.

    Vertex copies receive the same index in the 2D development, the deployed
    paraboloid and the folded form. The cut makes the triangle dual graph a
    tree, so propagating exact triangle lengths introduces no holonomy.
    """
    if not isinstance(solved, dict) or solved.get('kind') != 'paraboloidal-flasher-uncut-dp-ff':
        raise ValueError('剪裁须使用已求解的抛物面 Flasher 部署形／折后形。')
    if (isinstance(minimum_angle_deg, bool) or
            not isinstance(minimum_angle_deg, (int, float)) or
            not math.isfinite(minimum_angle_deg) or
            not 0 <= minimum_angle_deg <= 180):
        raise ValueError('剪裁后赋型的最小折角须在 0° 到 180° 之间。')
    faces = solved['audit_triangles_vertices']
    dp = np.asarray(solved['deployed_vertices_coords'], dtype=float)
    ff = np.asarray(solved['folded_vertices_coords'], dtype=float)
    projection = np.asarray(solved['projected_vertices_coords'], dtype=float)
    r, h, m = solved['rings'], solved['heightOrder'], solved['rotationalOrder']
    cuts = _original_cut_edges(r, h, m, solved['vertex_ijk'])
    incidences = defaultdict(list)
    for fi, face in enumerate(faces):
        if len(face) != 3:
            raise ValueError('抛物面剪裁仅支持三角面。')
        for corner in range(3):
            a, b = face[corner], face[(corner + 1) % 3]
            incidences[tuple(sorted((a, b)))].append((fi, corner))
    if cuts - incidences.keys() or any(len(entries) > 2 for entries in incidences.values()):
        raise ValueError('抛物面剪裁拓扑与面边不一致。')

    dual = defaultdict(list)
    for edge, entries in incidences.items():
        if len(entries) == 2 and edge not in cuts:
            (first, _), (second, _) = entries
            dual[first].append((second, edge))
            dual[second].append((first, edge))
    if sum(len(neighbors) for neighbors in dual.values()) // 2 != len(faces) - 1:
        raise ValueError('原版剪裁未形成面邻接树。')

    # Glue face corners only across the edges retained by the original cut.
    parent = list(range(3 * len(faces)))

    def root(node):
        while parent[node] != node:
            parent[node] = parent[parent[node]]
            node = parent[node]
        return node

    def unite(a, b):
        parent[root(a)] = root(b)

    for edge, entries in incidences.items():
        if len(entries) != 2 or edge in cuts:
            continue
        (f1, _), (f2, _) = entries
        for vertex in edge:
            unite(3 * f1 + faces[f1].index(vertex),
                  3 * f2 + faces[f2].index(vertex))

    instance = {}
    source_vertex = []
    developed_faces = []
    for fi, face in enumerate(faces):
        developed_face = []
        for corner, original in enumerate(face):
            representative = root(3 * fi + corner)
            if representative not in instance:
                instance[representative] = len(source_vertex)
                source_vertex.append(original)
            elif source_vertex[instance[representative]] != original:
                raise ValueError('抛物面剪裁顶点粘合不一致。')
            developed_face.append(instance[representative])
        developed_faces.append(developed_face)

    coordinates = np.full((len(source_vertex), 2), np.nan)
    center_start = len(solved['source_faces_vertices'])
    first_face = faces[center_start]
    for original, copy in zip(first_face, developed_faces[center_start]):
        coordinates[copy] = projection[original]
    visited = {center_start}
    queue = deque([center_start])
    while queue:
        parent_face = queue.popleft()
        for child, edge in dual[parent_face]:
            if child in visited:
                continue
            a, b = edge
            parent_other = next(v for v in faces[parent_face] if v not in edge)
            child_other = next(v for v in faces[child] if v not in edge)
            parent_lookup = dict(zip(faces[parent_face], developed_faces[parent_face]))
            child_lookup = dict(zip(faces[child], developed_faces[child]))
            ca, cb = parent_lookup[a], parent_lookup[b]
            if (ca, cb) != (child_lookup[a], child_lookup[b]):
                raise ValueError('未剪裁边的顶点副本不一致。')
            third = child_lookup[child_other]
            placed = _place_third(
                coordinates[ca], coordinates[cb],
                coordinates[parent_lookup[parent_other]],
                float(np.linalg.norm(dp[child_other] - dp[a])),
                float(np.linalg.norm(dp[child_other] - dp[b])))
            if np.isfinite(coordinates[third]).all():
                if np.linalg.norm(coordinates[third] - placed) > _LENGTH_TOLERANCE:
                    raise ValueError('抛物面展开顶点位置冲突。')
            else:
                coordinates[third] = placed
            visited.add(child)
            queue.append(child)
    if len(visited) != len(faces) or not np.isfinite(coordinates).all():
        raise ValueError('抛物面展开未覆盖所有面和顶点。')

    deployed = dp[source_vertex]
    folded = ff[source_vertex]
    max_flat_dp = max_flat_ff = 0.
    minimum_area = math.inf
    for face in developed_faces:
        a, b, c = face
        flat_area = abs(_cross2(coordinates[b] - coordinates[a],
                                coordinates[c] - coordinates[a])) / 2
        minimum_area = min(minimum_area, flat_area)
        for u, v in ((a, b), (b, c), (c, a)):
            flat_length = float(np.linalg.norm(coordinates[u] - coordinates[v]))
            max_flat_dp = max(max_flat_dp, abs(flat_length - float(np.linalg.norm(deployed[u] - deployed[v]))))
            max_flat_ff = max(max_flat_ff, abs(flat_length - float(np.linalg.norm(folded[u] - folded[v]))))
    if minimum_area < _AREA_TOLERANCE or max(max_flat_dp, max_flat_ff) > _LENGTH_TOLERANCE:
        raise ValueError('抛物面剪裁展开未通过逐面等距验证。')
    # The center fan is only an unfolding aid. Both spatial states have one
    # genuinely planar central polygon, as in the source TGraph3D.
    center = solved['center_vertices']
    center_copies = []
    for original in center:
        copies = {copy for face, developed_face in
                  zip(faces[center_start:], developed_faces[center_start:])
                  for vertex, copy in zip(face, developed_face) if vertex == original}
        if len(copies) != 1:
            raise ValueError('抛物面中心多边形的展开顶点不一致。')
        center_copies.append(copies.pop())
    final_faces = [*developed_faces[:center_start], center_copies]
    edges, angles, assignments = _assign_fold_types(
        coordinates, folded, final_faces, minimum_angle_deg)
    return {
        'kind': 'paraboloidal-flasher-cut-development',
        'rings': r, 'heightOrder': h, 'rotationalOrder': m,
        'focalLength': solved['focalLength'],
        'radialIncrement': solved['radialIncrement'],
        'diagonal': solved['diagonal'],
        'minimumAngleDegrees': float(minimum_angle_deg),
        'vertices_coords': coordinates.tolist(),
        'deployed_vertices_coords': deployed.tolist(),
        'folded_vertices_coords': folded.tolist(),
        'faces_vertices': final_faces,
        'audit_triangles_vertices': developed_faces,
        'edges_vertices': edges, 'edge_types': assignments,
        'fold_angles_rad': angles,
        'source_vertex_indices': source_vertex,
        'source_face_indices': list(range(len(final_faces))),
        'source_cut_edges_vertices': [list(edge) for edge in sorted(cuts)],
        'source_projected_vertices_coords': projection.tolist(),
        'source_deployed_vertices_coords': dp.tolist(),
        'source_folded_vertices_coords': ff.tolist(),
        'maxFlatDPFaceEdgeError': max_flat_dp,
        'maxFlatFFFaceEdgeError': max_flat_ff,
        'maxDPFFFaceEdgeError': solved['maxDPFFFaceEdgeError'],
        'minimumFlatFaceArea': minimum_area,
        'isometryResidualSum': solved['isometryResidualSum'],
        'outerHeightAdjustment': solved['outerHeightAdjustment'],
        'hasTruePlanarDevelopment': True,
        'selfOverlapChecked': False,
    }
