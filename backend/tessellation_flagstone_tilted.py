"""Origamica's local degree-three star twist used by tilted flagstone pleats.

The notebook defines TriangleStarTwistTriangle[plist, dir] but contains no
whole-sheet tilted-pleat flagstone assembler. This query returns only its
three central points and the reflected-corner collinearity witness.
"""
from __future__ import annotations

import math

import numpy as np
from scipy.optimize import least_squares, minimize


def _cross(a, b):
    return float(a[0] * b[1] - a[1] * b[0])


def _line_intersection(p, direction, a, b, tolerance):
    edge = b - a
    denominator = _cross(direction, edge)
    if abs(denominator) <= tolerance:
        raise ValueError('星形尖角平分线与相邻边平行，无法构造中心三角形。')
    return p + _cross(a - p, edge) / denominator * direction


def _reflect(point, a, b):
    direction = b - a
    length2 = float(direction @ direction)
    if length2 <= 1e-20:
        raise ValueError('中心三角形退化，无法计算反射点。')
    foot = a + float((point - a) @ direction) / length2 * direction
    return 2 * foot - point


def _segments_cross(a, b, c, d, tolerance):
    ab, cd = b - a, d - c
    signs = (_cross(ab, c - a), _cross(ab, d - a),
             _cross(cd, a - c), _cross(cd, b - c))
    return signs[0] * signs[1] <= tolerance and signs[2] * signs[3] <= tolerance


def tilted_star_query(data: dict) -> dict:
    """Solve the notebook's six-point local construction for dir=+1 or -1.

    The original minimizes the squared signed area of three reflected reflex
    corners subject to strict bounds on three inward bisector distances. It
    does not assign M/V creases or stitch adjacent stars into a tessellation.
    """
    if not isinstance(data, dict) or set(data) - {'operation', 'points', 'direction'}:
        raise ValueError('倾斜褶局部查询只接受 points 与 direction。')
    raw = data.get('points')
    if not isinstance(raw, list) or len(raw) != 6 or any(
            not isinstance(p, list) or len(p) != 2 or any(
                isinstance(x, bool) or not isinstance(x, (int, float)) or
                not math.isfinite(x) or abs(x) > 1000 for x in p) for p in raw):
        raise ValueError('points 必须是逆时针排列的六个有限二维坐标（绝对值不超过 1000）。')
    direction = data.get('direction', 1)
    if type(direction) is not int or direction not in (-1, 1):
        raise ValueError('direction 只能为逆时针 +1 或顺时针 -1。')
    points = np.asarray(raw, dtype=float)
    scale = float(np.ptp(points, axis=0).max())
    if scale <= 1e-8:
        raise ValueError('六点星形太小，无法稳定计算。')
    # Work in local unit-scale coordinates so the optimizer tolerances have
    # the same meaning for geometrically similar stars.
    origin = points.mean(axis=0)
    p = (points - origin) / scale
    area = sum(_cross(p[i], p[(i + 1) % 6]) for i in range(6)) / 2
    turn = [_cross(p[(i + 1) % 6] - p[i], p[(i + 2) % 6] - p[(i + 1) % 6])
            for i in range(6)]
    if area <= 1e-6 or any(turn[i] >= -1e-6 for i in (0, 2, 4)) or any(
            turn[i] <= 1e-6 for i in (1, 3, 5)):
        raise ValueError('顶点必须按逆时针排列，p1/p3/p5 为尖角、p2/p4/p6 为凹角。')
    for i in (0, 2, 4):
        before = float(np.linalg.norm(p[i] - p[(i - 1) % 6]))
        after = float(np.linalg.norm(p[i] - p[(i + 1) % 6]))
        if abs(before - after) > 1e-5 * max(before, after):
            raise ValueError('p1、p3、p5 的尖角必须是等腰三角形。')
    for i in range(6):
        a, b = p[i], p[(i + 1) % 6]
        for j in range(i + 2, 6):
            if i == 0 and j == 5:
                continue
            if _segments_cross(a, b, p[j], p[(j + 1) % 6], 1e-10):
                raise ValueError('六点星形边界不能自交。')

    tips = p[[0, 2, 4]]
    midpoints = (p[[5, 1, 3]] + p[[1, 3, 5]]) / 2
    vectors = midpoints - tips
    lengths = np.linalg.norm(vectors, axis=1)
    if float(np.min(lengths)) <= 1e-10:
        raise ValueError('尖角平分线长度为零。')
    vectors /= lengths[:, None]
    common = _line_intersection(tips[0], vectors[0], tips[1],
                                tips[1] + vectors[1], 1e-10)
    maximum = np.sum((common - tips) * vectors, axis=1)
    if np.max(np.linalg.norm(tips + maximum[:, None] * vectors - common, axis=1)) > 1e-5:
        raise ValueError('三条尖角平分线不相交，请检查等腰条件。')
    adjacent = ((4, 5), (0, 1), (2, 3)) if direction == 1 else (
        (2, 1), (4, 3), (0, 5))
    minimum = np.zeros(3)
    for index, (a, b) in enumerate(adjacent):
        intersection = _line_intersection(tips[index], vectors[index],
                                          p[a], p[b], 1e-10)
        minimum[index] = max(0., float((intersection - tips[index]) @ vectors[index]))
    margin = 1e-7
    if np.any(maximum - minimum <= 2 * margin):
        raise ValueError('该旋向没有满足原版严格界限的中心三角形。')
    lower, upper = minimum + margin, maximum - margin

    def geometry(distances):
        q1, q3, q5 = tips + distances[:, None] * vectors
        s2 = _reflect(p[1], q1, q3)
        s4 = _reflect(p[3], q3, q5)
        s6 = _reflect(p[5], q5, q1)
        return np.asarray([q1, q3, q5]), np.asarray([s2, s4, s6])

    def double_area(distances):
        _, reflected = geometry(distances)
        s2, s4, s6 = reflected
        return _cross(s6 - s4, s2 - s4)

    def shared_reflection_residual(distances):
        _, reflected = geometry(distances)
        s2, s4, s6 = reflected
        return np.r_[s2 - s4, s2 - s6]

    starts = [lower + (upper - lower) * fraction for fraction in (.12, .35, .5, .7)]
    starts += [lower + (upper - lower) * np.asarray(fractions) for fractions in
               ((.15, .45, .65), (.65, .15, .45), (.45, .65, .15))]
    best = None
    for start in starts:
        found = minimize(lambda values: double_area(values) ** 2, start,
                         bounds=list(zip(lower, upper)), method='SLSQP',
                         options={'maxiter': 300, 'ftol': 1e-14})
        if np.all(np.isfinite(found.x)) and np.all(found.x >= lower - 1e-9) and np.all(found.x <= upper + 1e-9):
            # Area zero alone admits three distinct collinear reflected
            # corners. The notebook's example draws all three to the same s;
            # check that stronger fold witness before claiming a valid star.
            refined = least_squares(shared_reflection_residual,
                                    found.x, bounds=(lower, upper),
                                    ftol=1e-14, xtol=1e-14, gtol=1e-14,
                                    max_nfev=300)
            candidate = refined.x
            if best is None or np.linalg.norm(shared_reflection_residual(candidate)) < np.linalg.norm(shared_reflection_residual(best)):
                best = candidate
            if np.linalg.norm(shared_reflection_residual(best)) <= 1e-9:
                break
    if best is None or np.linalg.norm(shared_reflection_residual(best)) > 1e-6:
        raise ValueError('未找到三个反射凹角汇聚的局部中心三角形。')
    triangle, reflected = geometry(best)
    reflected_gap = max(float(np.linalg.norm(reflected[i] - reflected[j]))
                        for i, j in ((0, 1), (1, 2), (2, 0)))
    return {
        'kind': 'origamica-tilted-pleat-degree3-local',
        'points': points.tolist(), 'direction': direction,
        'centralTriangle': (triangle * scale + origin).tolist(),
        'reflectedCorners': (reflected * scale + origin).tolist(),
        'inwardDistances': (best * scale).tolist(),
        'minimumDistances': (minimum * scale).tolist(),
        'maximumDistances': (maximum * scale).tolist(),
        'reflectedDoubleArea': abs(double_area(best)) * scale * scale,
        'reflectedCornerMaxGap': reflected_gap * scale,
        'normalizedClosureError': reflected_gap,
        'geometricConditionSatisfied': True,
        'creaseAssignmentsKnown': False,
        'wholeTessellationConstructed': False,
    }
