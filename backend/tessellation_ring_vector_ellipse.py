"""Certified two-component ring functions of the form R A (cos(phi), sin(phi)).

This is a deliberately narrow subset of Origamica's vector-valued pfn/rfn:
positive determinant makes the parameterized curve a simple CCW ellipse,
ray exits are exact quadratic roots, and the spectral norm of B_out^-1 B_in
certifies strict nesting over *all* angles without sampling.
"""
import math


class LinearEllipse:
    def __init__(self, matrix):
        self.matrix = validate_linear_map(matrix)


def singular_extrema(matrix):
    (a, b), (c, d) = matrix
    first, second, mixed = a*a+c*c, b*b+d*d, a*b+c*d
    maximum = math.sqrt(max(0., (first+second+math.hypot(first-second, 2*mixed))/2))
    minimum = abs(a*d-b*c)/maximum if maximum else 0.
    return minimum, maximum


def validate_linear_map(matrix):
    if (not isinstance(matrix, list) or len(matrix) != 2 or
            any(not isinstance(row, list) or len(row) != 2 for row in matrix) or
            any(type(value) not in (int, float) or not math.isfinite(value) or abs(value) > 2
                for row in matrix for value in row)):
        raise ValueError('二维线性曲线须是有限的 2×2 矩阵，系数在 -2–2 之间。')
    result = [[float(value) for value in row] for row in matrix]
    (a, b), (c, d) = result
    minimum, maximum = singular_extrema(result)
    if a*d-b*c <= 1e-4 or minimum < .08 or maximum > 2.5:
        raise ValueError('二维线性曲线须保持逆时针、无退化且不过度拉伸。')
    return result


def _scaled(matrix, radius):
    if type(radius) not in (int, float) or not math.isfinite(radius) or not 0 < radius <= 1e4:
        raise ValueError('二维线性曲线的半径须为有限正数。')
    result = [[radius*value for value in row] for row in matrix]
    if any(not math.isfinite(value) or abs(value) > 1e6 for row in result for value in row):
        raise ValueError('二维线性曲线的坐标超出范围。')
    return result


def ellipse_point(matrix, radius, phi):
    (a, b), (c, d) = _scaled(matrix, radius)
    co, si = math.cos(phi), math.sin(phi)
    return [a*co+b*si, c*co+d*si]


def _inverse_apply(matrix, point):
    (a, b), (c, d) = matrix
    det = a*d-b*c
    return [(d*point[0]-b*point[1])/det, (-c*point[0]+a*point[1])/det]


def ellipse_radial_radius(matrix, radius, phi):
    inverse = _inverse_apply(_scaled(matrix, radius), [math.cos(phi), math.sin(phi)])
    return 1/math.hypot(*inverse)


def ellipse_radius_bounds(matrix, radius):
    low, high = singular_extrema(matrix)
    return radius*low, radius*high


def ellipse_first_ray_exit(matrix, radius, point, direction):
    """First positive ray crossing, using the quadratic of the ellipse gauge."""
    transform = _scaled(matrix, radius)
    x, y = _inverse_apply(transform, point), _inverse_apply(transform, direction)
    squared = x[0]*x[0]+x[1]*x[1]
    if squared >= 1-1e-9:
        raise ValueError('传播起点不在目标二维线性曲线内部；请增大曲线间距。')
    a = y[0]*y[0]+y[1]*y[1]
    if a <= 1e-24:
        raise ValueError('传播射线方向退化。')
    b = x[0]*y[0]+x[1]*y[1]
    # The start is strictly inside, so the discriminant is positive and the
    # positive root is unique; a nonradial ellipse needs no angular search.
    root = math.sqrt(b*b+a*(1-squared))
    crossing = (1-squared)/(root+b) if b > 0 else (-b+root)/a
    if not math.isfinite(crossing) or crossing <= 1e-9:
        raise ValueError('传播射线未向外到达目标二维线性曲线。')
    return [point[0]+crossing*direction[0], point[1]+crossing*direction[1]]


def certify_nested_ellipses(inner_matrix, inner_radius, outer_matrix, outer_radius, gap=1e-5):
    """Require min Euclidean boundary gap >= gap by a spectral-norm bound.

    For all ||u||=1, ||B_out^-1 B_in u|| <= q.  If q<1, each inner point
    lies inside the outer ellipse.  The radial gap is at least
    (1-q)*sigma_min(B_out), hence this condition also excludes tangency.
    """
    inner, outer = _scaled(inner_matrix, inner_radius), _scaled(outer_matrix, outer_radius)
    minimum, _ = singular_extrema(outer)
    if minimum <= gap:
        raise ValueError('二维线性曲线间距不足，无法可靠验证逐环嵌套。')
    first = _inverse_apply(outer, [inner[0][0], inner[1][0]])
    second = _inverse_apply(outer, [inner[0][1], inner[1][1]])
    q = singular_extrema([[first[0], second[0]], [first[1], second[1]]])[1]
    if q >= 1-gap/minimum-1e-10:
        raise ValueError('二维线性曲线必须逐环严格嵌套且保持间距。')
    return q
