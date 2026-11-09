"""Numerical CP / folded-form equations for Origamica's planar MakeFlasher.

The first-sector system follows In[4153], In[4165], In[4169], In[4171],
In[4176], In[4178] and In[4193] of Origamica 15.0.  It is deliberately
separate from the application's crease-assignment and dispatch code.
"""

import math

import numpy as np
from scipy.optimize import least_squares

from tessellation_flasher import (
    _wrap, flasher_default_cp_point, flasher_ideal_cp_seed, flasher_sector_quads,
    flasher_x_diagonal_picks,
)


def _rotate(point, k, m):
    angle = 2 * math.pi * (k % m) / m
    c, s = math.cos(angle), math.sin(angle)
    return np.array((c * point[0] - s * point[1],
                     s * point[0] + c * point[1], *point[2:]), dtype=float)


def flasher_default_ff_point(i, j, k, h, m, dr):
    """In[4147]-In[4153]: 3D folded-form *initial guess*, not a solution."""
    if h < 1 or m < 3 or dr < 0:
        raise ValueError('Flasher 高度阶和增量须有效。')
    turn = max(i + 1, j)
    offset = i * (i + 1) + j if j <= i + 1 else j * (j + 1) - (i + 1)
    t = math.tan(math.pi / m)
    height = abs(((min(i + 1, j) - h) % (2 * h)) - h)
    base = np.array((.5 * (1 + dr * offset / h),
                     .5 * t * (1 + dr * offset / h), height * t * t))
    return _rotate(base, k + turn, m)


def _sector_topology(r, h, m, diagonal):
    quads = flasher_sector_quads(r, h, m)
    x_picks = flasher_x_diagonal_picks(r, h, m) if diagonal == 'X' else None
    # In[4120] constructs the sharp/medium/border creases explicitly. Quad
    # perimeters are *not* equivalent: the central polygon edges are omitted
    # by the quad enumeration and must participate in isometry.
    edges = []

    def add(a, b):
        edges.append((_wrap((*a, 0), m), _wrap((*b, 0), m)))

    n = r * h
    for ig in range(r):
        j = h * ig
        for i in range(j, n + 1):
            add((i, j), (i - 1, j))
            add((i, j), (i, min(j + h, i + 1)))
    add((n, n), (n - 1, n))
    for ig in range(r):
        for j in range(h):
            i = h * ig + j
            add((i - 1, i), (i, i + 1))
    for ig in range(r):
        i = h * ig - 1
        for j in range(h * ig + 1, n + 1):
            if ig:
                add((i, j), (i, j - 1))
            add((i, j), (min(i + h, j - 1), j))
    for source_index, quad in enumerate(quads):
        pick_13 = diagonal == 'Y' or x_picks is not None and x_picks[source_index] == '13'
        edges.append((quad[0], quad[2]) if pick_13 else (quad[1], quad[3]))
    labels = sorted({(i, j) for edge in edges for i, j, k in edge if k == 0})
    return labels, edges


def _assign_fold_types(cp, ff, faces, minimum_angle_deg):
    """In[1443]/[1445]/[1809]/[1825]: oriented face normals and M/V/U/B."""
    oriented_edge_face = {}
    normals = []
    for face_no, source_face in enumerate(faces):
        face = list(source_face)
        points = cp[face]
        twice_area = sum(points[i, 0] * points[(i + 1) % len(face), 1] -
                         points[(i + 1) % len(face), 0] * points[i, 1]
                         for i in range(len(face)))
        if abs(twice_area) < 1e-10:
            raise ValueError(f'Flasher 面 {face_no} 的 CP 面积退化。')
        if twice_area < 0:
            face.reverse()
        a, b, c = face[:3]
        normal = np.cross(ff[b] - ff[a], ff[c] - ff[a])
        length = np.linalg.norm(normal)
        if length < 1e-10:
            raise ValueError(f'Flasher 面 {face_no} 的 FF 法向退化。')
        normals.append(normal / length)
        for u, v in zip(face, face[1:] + face[:1]):
            if (u, v) in oriented_edge_face:
                raise ValueError('Flasher 面邻接方向冲突。')
            oriented_edge_face[u, v] = face_no
    edges = sorted({tuple(sorted(edge)) for edge in oriented_edge_face})
    epsilon = math.radians(minimum_angle_deg)
    angles = []
    types = []
    for u, v in edges:
        left = oriented_edge_face.get((u, v))
        right = oriented_edge_face.get((v, u))
        if left is None or right is None:
            angles.append(0.)
            types.append('B')
            continue
        a, b = normals[right], normals[left]
        edge = ff[v] - ff[u]
        # Origamica DirectedAngle3D[a,b,c] = ArcTan[a.b |c|, a.(b×c)].
        angle = math.atan2(float(np.dot(a, np.cross(b, edge))),
                           float(np.dot(a, b) * np.linalg.norm(edge)))
        angles.append(angle)
        types.append('V' if angle > epsilon else 'M' if angle < -epsilon else 'U')
    return [list(edge) for edge in edges], angles, types


def solve_flasher(r, h, m, dr, diagonal='Y', *, minimum_angle_deg=0.5, max_nfev=2000):
    """Solve In[4193]'s first-sector equations and check every panel edge.

    Returns a numeric reference payload only if each isometry equation is
    satisfied to the notebook's 1e-6 *sum* tolerance and all panel facets
    have valid two-sided incidence. A nonconverged result raises ValueError.
    """
    if diagonal not in ('X', 'Y', 'Z'):
        raise ValueError('Flasher 对角线须为 X、Y 或 Z。')
    if any(isinstance(value, bool) or not isinstance(value, int) for value in (r, h, m)) or r < 1 or h < 1 or m < 3:
        raise ValueError('Flasher 圈数、高度阶和旋转阶须有效。')
    if not np.isfinite(dr) or dr < 0:
        raise ValueError('Flasher 径向增量须为有限非负数。')
    if not np.isfinite(minimum_angle_deg) or not 0 <= minimum_angle_deg < 180:
        raise ValueError('Flasher 最小折角须在 0° 到 180° 之间。')
    labels, edges = _sector_topology(r, h, m, diagonal)
    n = len(labels)
    cp0 = np.array([flasher_default_cp_point(i, j, 0, m) for i, j in labels])
    ff0 = np.array([flasher_default_ff_point(i, j, 0, h, m, dr) for i, j in labels])
    ff_xy = ff0[:, :2]
    index = {label: pos for pos, label in enumerate(labels)}
    outer = [(r * h, j * h) for j in range(r + 1)] + [(i * h - 1, r * h) for i in range(1, r + 1)]
    outer_pos = [index[label] for label in outer]
    outer_heights = np.array([flasher_default_ff_point(*label, 0, h, m, 0)[2] for label in outer])
    center_pos = index[(0, 0)]
    center_default = cp0[center_pos]
    perpendicular = np.array((-center_default[1], center_default[0]))

    def point(array, reference):
        i, j, k = reference
        return _rotate(array[index[(i, j)]], k, m)

    def unpack(x):
        cp = x[:2 * n].reshape((n, 2))
        ff = np.column_stack((ff_xy, x[2 * n:3 * n]))
        dz = x[-1]
        return cp, ff, dz

    def residual(x):
        cp, ff, dz = unpack(x)
        iso = [np.linalg.norm(point(ff, a) - point(ff, b)) -
               np.linalg.norm(point(cp, a) - point(cp, b)) for a, b in edges]
        return np.array([np.dot(cp[center_pos], perpendicular), *iso,
                         *(ff[outer_pos, 2] - (1 + dz) * outer_heights),
                         ff[center_pos, 2]])

    x0 = np.r_[cp0.ravel(), ff0[:, 2], 0.]
    if len(residual(x0)) != len(x0):
        raise ValueError('Flasher 方程数与未知量不平衡。')
    sol = least_squares(residual, x0, method='lm', max_nfev=max_nfev,
                        xtol=1e-12, ftol=1e-12, gtol=1e-12)
    values = residual(sol.x)
    iso_sum = float(np.abs(values[1:1 + len(edges)]).sum())
    if not sol.success or iso_sum > 1e-6 or float(np.max(np.abs(values))) > 1e-6:
        raise ValueError(f'Flasher 方程未收敛：isometry_sum={iso_sum:.6g}, '
                         f'max_error={np.max(np.abs(values)):.6g}, {sol.message}')
    cp, ff, dz = unpack(sol.x)
    seed = flasher_ideal_cp_seed(r, h, m, diagonal)
    cp_all = np.array([point(cp, reference) for reference in seed['vertex_ijk']])
    ff_all = np.array([point(ff, reference) for reference in seed['vertex_ijk']])
    seed_cp = np.asarray(seed['vertices_coords'])
    face_errors = []
    cp_areas = []
    ff_areas = []
    inverted_faces = []
    for face_no, (a, b, c) in enumerate(seed['faces_vertices']):
        for u, v in ((a, b), (b, c), (c, a)):
            face_errors.append(abs(np.linalg.norm(cp_all[u] - cp_all[v]) -
                                   np.linalg.norm(ff_all[u] - ff_all[v])))
        cp_area = .5 * np.linalg.det(np.array((cp_all[b] - cp_all[a], cp_all[c] - cp_all[a])))
        seed_area = .5 * np.linalg.det(np.array((seed_cp[b] - seed_cp[a], seed_cp[c] - seed_cp[a])))
        ff_area = .5 * np.linalg.norm(np.cross(ff_all[b] - ff_all[a], ff_all[c] - ff_all[a]))
        cp_areas.append(abs(cp_area))
        ff_areas.append(ff_area)
        if cp_area * seed_area <= 0:
            inverted_faces.append(face_no)
    center = seed['center_vertices']
    center_errors = [abs(np.linalg.norm(cp_all[a] - cp_all[b]) -
                         np.linalg.norm(ff_all[a] - ff_all[b]))
                     for a, b in zip(center, center[1:] + center[:1])]
    max_face_error = float(max(face_errors + center_errors))
    if max_face_error > 1e-6 or min(cp_areas) < 1e-10 or min(ff_areas) < 1e-10 or inverted_faces:
        raise ValueError('Flasher 全扇区三角面验证失败：'
                         f'边长误差={max_face_error:.6g}，反向面={len(inverted_faces)}。')
    graph_faces = [*seed['faces_vertices'], center]
    graph_edges, fold_angles, edge_types = _assign_fold_types(
        cp_all, ff_all, graph_faces, minimum_angle_deg)
    vertex_index = {tuple(label): pos for pos, label in enumerate(seed['vertex_ijk'])}
    source_edges = {
        tuple(sorted((vertex_index[a[0], a[1], (a[2] + sector) % m],
                      vertex_index[b[0], b[1], (b[2] + sector) % m])))
        for sector in range(m) for a, b in edges
    }
    if {tuple(edge) for edge in graph_edges} != source_edges:
        raise ValueError('Flasher 原版折线与面邻接不一致。')
    return {
        'kind': 'flasher-solved-cp-ff-reference', 'rings': r,
        'heightOrder': h, 'rotationalOrder': m, 'radialIncrement': dr,
        'diagonal': diagonal, 'vertex_ij': [list(label) for label in labels],
        'cp_first_sector': cp.tolist(), 'ff_first_sector': ff.tolist(),
        'vertices_coords': cp_all.tolist(),
        'folded_vertices_coords': ff_all.tolist(),
        'vertex_ijk': seed['vertex_ijk'],
        'quads_vertices': seed['quads_vertices'],
        'faces_vertices': seed['faces_vertices'],
        'source_triangles_vertices': seed['source_triangles_vertices'],
        'center_vertices': center,
        'edges_vertices': graph_edges,
        'edge_types': edge_types,
        'fold_angles_rad': fold_angles,
        'minimumAngleDegrees': minimum_angle_deg,
        'edge_references': [[list(a), list(b)] for a, b in edges],
        'outerHeightAdjustment': float(dz), 'isometryResidualSum': iso_sum,
        'maxEquationResidual': float(np.max(np.abs(values))),
        'maxFaceEdgeError': max_face_error,
        'minimumCPFaceArea': float(min(cp_areas)),
        'minimumFFFaceArea': float(min(ff_areas)),
        'deployedPattern': False, 'solvedCreasePattern': True,
        'mountainValleyAssigned': True, 'foldedForm': True,
        'isometryVerified': True,
    }
