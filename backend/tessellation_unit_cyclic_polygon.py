"""Bounded unit cyclic mother polygons from Origamica In[357/373/378].

For consecutive central gaps g_i and interior angles theta_i, the inscribed
angle theorem gives g_(i-1)+g_i=2*(180-theta_i), with indices modulo n.
Odd n has a unique solution.  Even n has the alternating free mode; a
specified edge length fixes it relative to the first unit edge.  This module
constructs only the mother polygon, not a twist tile or global layer order.
"""
import math


MIN_GAP = 1.       # degrees, bounded strictly convex/circle-center-inside branch
MAX_GAP = 179.


def complete_cyclic_angles(angles):
    """Recompute the ignored last one (odd n) or last two (even n) angles.

    Input angles are degrees, including finite placeholders for ignored slots.
    The source's accepted symbolic domain is broader; this numerical adapter
    restricts to finite 3–24 corner lists and positive convex effective angles.
    """
    if (not isinstance(angles, list) or not 3 <= len(angles) <= 24 or
            any(isinstance(value, bool) or not isinstance(value, (int, float)) or
                not math.isfinite(value) for value in angles)):
        raise ValueError('需提供 3–24 个有限内角，末尾可为有限占位值。')
    n = len(angles)
    fixed = [float(value) for value in angles[:n-1 if n % 2 else n-2]]
    total = (n-2)*180.
    if n % 2:
        completed = fixed + [total-sum(fixed)]
    else:
        remaining = total-sum(fixed)
        alternating = sum((-1)**index*value for index, value in enumerate(fixed))
        completed = fixed + [(remaining-alternating)/2,
                             (remaining+alternating)/2]
    if any(not 1 <= angle <= 179 for angle in completed):
        raise ValueError('已指定角推得退化或非凸的圆内接多边形。')
    return completed


def _gaps_from_first(equations, first):
    gaps = [first]
    for value in equations[1:]:
        gaps.append(value-gaps[-1])
    return gaps


def cyclic_center_gaps(angles):
    """Return effective corners and the unique or zero-alternation gaps.

    For even n these are the particular solution with alternating gap sum
    zero.  Every solution is base_i+(-1)^i*zeta; it is not yet fixed by side.
    """
    effective = complete_cyclic_angles(angles)
    equations = [360.-2*angle for angle in effective]
    n = len(effective)
    zero = _gaps_from_first(equations, 0.)
    if n % 2:
        first = (equations[0]-zero[-1])/2
    else:
        first = -sum((-1)**index*value for index, value in enumerate(zero))/n
    gaps = _gaps_from_first(equations, first)
    if (abs(gaps[-1]+gaps[0]-equations[0]) > 1e-8 or
            abs(sum(gaps)-360.) > 1e-8):
        raise ValueError('顶角未闭合为圆内接多边形。')
    return effective, gaps


def _even_gap_adjustment(base, side, side_index):
    n = len(base)
    if (isinstance(side, bool) or not isinstance(side, (int, float)) or
            not math.isfinite(side) or not .05 <= side <= 5. or
            isinstance(side_index, bool) or not isinstance(side_index, int) or
            not 2 <= side_index <= n):
        raise ValueError('偶数边形需指定第 2 至第 n 边及 0.05–5 的边长。')
    signs = [1 if index % 2 == 0 else -1 for index in range(n)]
    lower = max((MIN_GAP-gap if sign > 0 else gap-MAX_GAP)
                for gap, sign in zip(base, signs))
    upper = min((MAX_GAP-gap if sign > 0 else gap-MIN_GAP)
                for gap, sign in zip(base, signs))
    if lower >= upper:
        raise ValueError('中心弧角没有非退化的凸形分支。')
    chosen = side_index-1
    def residual(shift):
        gaps = [gap+sign*shift for gap, sign in zip(base, signs)]
        first = math.sin(math.radians(gaps[0]/2))
        return math.sin(math.radians(gaps[chosen]/2))/first-side
    left, right = residual(lower), residual(upper)
    if abs(left) < 1e-11 and abs(right) < 1e-11:
        raise ValueError('指定边长不能消除偶数边形的自由度。')
    if left*right > 0:
        raise ValueError('指定边长在当前凸形分支不可达。')
    if abs(left) < 1e-12:
        return lower
    if abs(right) < 1e-12:
        return upper
    for _ in range(90):
        middle = (lower+upper)/2
        value = residual(middle)
        if abs(value) < 1e-13 or upper-lower < 1e-12:
            return middle
        if left*value < 0:
            upper = middle
        else:
            lower, left = middle, value
    return (lower+upper)/2


def unit_cyclic_polygon_info(angles, side=1., side_index=2):
    """Return a checked convex cyclic polygon with first edge (0,0)–(1,0).

    Odd n ignores side/side_index, as the source does.  Even n uses a bounded
    interior-center branch (all central gaps 1°–179°) and rejects side 1,
    whose length is already fixed and cannot select the free solution.
    """
    effective, base = cyclic_center_gaps(angles)
    n = len(effective)
    shift = _even_gap_adjustment(base, side, side_index) if n % 2 == 0 else 0.
    gaps = [gap+(-1)**index*shift for index, gap in enumerate(base)]
    if any(not MIN_GAP-1e-9 <= gap <= MAX_GAP+1e-9 for gap in gaps):
        raise ValueError('中心弧角越过受限凸形分支。')
    half = math.radians(gaps[0]/2)
    radius = .5/math.sin(half)
    center = [.5, .5/math.tan(half)]
    vertices = [[0., 0.], [1., 0.]]
    direction = -math.pi/2-half+math.radians(gaps[0])
    for gap in gaps[1:-1]:
        direction += math.radians(gap)
        vertices.append([center[0]+radius*math.cos(direction),
                         center[1]+radius*math.sin(direction)])
    if len(vertices) != n:
        raise ValueError('圆内接多边形顶点数不匹配。')
    edges = [[b[0]-a[0], b[1]-a[1]]
             for a, b in zip(vertices, vertices[1:]+vertices[:1])]
    def cross(a, b):
        return a[0]*b[1]-a[1]*b[0]
    if (any(not math.isfinite(value) or abs(value)>100 for point in vertices
            for value in point) or
            min(math.hypot(*edge) for edge in edges) < 1e-6 or
            min(cross(edges[index], edges[(index+1)%n]) for index in range(n))
            <= 1e-9 or
            max(abs(math.dist(point, center)-radius) for point in vertices) > 1e-8):
        raise ValueError('推得多边形退化、非凸或不共圆。')
    if n % 2 == 0 and abs(math.hypot(*edges[side_index-1])-side) > 1e-8:
        raise ValueError('指定边长未达到求解精度。')
    return {'inputAngles': angles.copy(), 'effectiveAngles': effective,
            'centerAngles': gaps, 'vertices': vertices,
            'circumcenter': center, 'circumradius': radius,
            'sideConstraint': None if n % 2 else {'length': float(side),
                                                   'index': side_index},
            'alternatingAdjustment': shift if n % 2 == 0 else None,
            'scope': 'strictly convex, central gaps 1–179 degrees'}


def unit_cyclic_polygon_vertices(angles, side=1., side_index=2):
    """Vertex-only form of the bounded In[378] numerical mother polygon."""
    return unit_cyclic_polygon_info(angles, side, side_index)['vertices']
