"""Origamica's p/q/r/s ring propagation for circular or bounded curves.

The notebook accepts arbitrary symbolic polar functions. This implementation
uses exact circle intersections or numerical intersections with periodic,
piecewise-linear radial profiles, Cartesian polygons, or bounded expressions; it keeps the edge order,
M/V assignments, and independently propagated flat coordinates.
"""
import ast
import math

from tessellation_patterns import make_fold, planar_faces
from tessellation_ring_vector_ellipse import (
    LinearEllipse, certify_nested_ellipses, ellipse_first_ray_exit,
    ellipse_point, ellipse_radial_radius, ellipse_radius_bounds,
)
from tessellation_ring_vector_fourier import FourierCurve
from tessellation_ring_vector_expression import vector_expression_curve
from tessellation_ring_signed_power import SignedPowerSuperellipse


_RADIUS_FUNCTIONS = {'sin': math.sin, 'cos': math.cos, 'sqrt': math.sqrt, 'abs': abs}
_RADIUS_NAMES = {'phi', 'r', 'pi', 'tau'}


class _VectorPolygon:
    """A simple Cartesian polygon star-shaped about the origin."""

    def __init__(self, vertices):
        self.vertices = vertices


def validate_vector_polygon(vertices):
    """Validate a simple, origin-visible polygonal vector curve.

    Every edge leaves the origin to its left, so each origin ray has one
    intersection. Concave outlines are allowed; self-crossings are not.
    """
    if not isinstance(vertices, list) or not 3 <= len(vertices) <= 64:
        raise ValueError('二维向量曲线须有 3–64 个逆时针控制点。')
    points = []
    for vertex in vertices:
        if (not isinstance(vertex, list) or len(vertex) != 2 or
                any(type(value) not in (int, float) or not math.isfinite(value) or abs(value) > 2
                    for value in vertex)):
            raise ValueError('二维向量曲线控制点须为有限的 [x,y]，每个坐标在 -2–2 之间。')
        points.append([float(vertex[0]), float(vertex[1])])
    for i, a in enumerate(points):
        b, c = points[(i+1) % len(points)], points[(i+2) % len(points)]
        first, second = [b[0]-a[0], b[1]-a[1]], [c[0]-b[0], c[1]-b[1]]
        first_length, second_length = math.hypot(*first), math.hypot(*second)
        if (first_length < 1e-5 or second_length < 1e-5 or
                abs(_cross(first, second)) <= 1e-8*first_length*second_length):
            raise ValueError('二维向量曲线不能有重合或共线控制点。')
        if _cross(first, [-a[0], -a[1]]) <= 1e-6*first_length:
            raise ValueError('二维向量曲线必须逆时针且每条边从原点可见。')
    for i in range(len(points)):
        a,b=points[i],points[(i+1)%len(points)]
        for j in range(i+2,len(points)):
            if i==0 and j==len(points)-1:continue
            if _segments_intersect(a,b,points[j],points[(j+1)%len(points)]):
                raise ValueError('二维向量曲线不能自交。')
    return points


def squaring_circle_radius_expressions(rings):
    """The notebook's Squaring the Circle superellipses as polar radii.

    Its Cartesian curve is R {Sign[Cos t] Abs[Cos t]^(1/(i+1)),
    Sign[Sin t] Abs[Sin t]^(1/(i+1))}.  Eliminating t gives the same
    locus at polar angle phi with exponent 2(i+1).
    """
    if type(rings) is not int or not 1 <= rings <= 4:
        raise ValueError('圆到方形示例需要 1–4 个传播环。')
    expression = lambda i: (
        f'r/(abs(cos(phi))**{2*(i+1)}+'
        f'abs(sin(phi))**{2*(i+1)})**(1/{2*(i+1)})')
    return ([expression(i) for i in range(rings+1)],
            [expression(i) for i in range(rings)])


def _literal_exponent(node):
    """Resolve a bounded numeric fraction such as 1/6 at parse time."""
    if isinstance(node, ast.Constant) and type(node.value) in (int, float):
        value = float(node.value)
    elif isinstance(node, ast.UnaryOp) and type(node.op) in (ast.UAdd, ast.USub):
        value = _literal_exponent(node.operand)
        if isinstance(node.op, ast.USub):
            value = -value
    elif isinstance(node, ast.BinOp) and type(node.op) in (ast.Add, ast.Sub, ast.Mult, ast.Div):
        a, b = _literal_exponent(node.left), _literal_exponent(node.right)
        try:
            if isinstance(node.op, ast.Add): value = a+b
            elif isinstance(node.op, ast.Sub): value = a-b
            elif isinstance(node.op, ast.Mult): value = a*b
            else: value = a/b
        except ZeroDivisionError as error:
            raise ValueError('极坐标公式的幂指数不能除以零。') from error
    else:
        raise ValueError('极坐标公式的幂指数须为有限常数或常数分式。')
    if not math.isfinite(value) or abs(value) > 1e3:
        raise ValueError('极坐标公式的幂指数超出范围。')
    return value


def _trig_bounds(low, high, function, maximum_at, minimum_at):
    if not math.isfinite(low) or not math.isfinite(high) or high - low >= math.tau:
        return -1., 1.
    values = [function(low), function(high)]
    if math.ceil((low - maximum_at) / math.tau - 1e-12) <= math.floor((high - maximum_at) / math.tau + 1e-12):
        values.append(1.)
    if math.ceil((low - minimum_at) / math.tau - 1e-12) <= math.floor((high - minimum_at) / math.tau + 1e-12):
        values.append(-1.)
    return min(values), max(values)


def compile_radius_expression(expression):
    """Parse a small numerical pfn/rfn expression without exposing Python APIs."""
    if not isinstance(expression, str) or not 1 <= len(expression) <= 120:
        raise ValueError('极坐标公式须为 1–120 字符。')
    try:
        tree = ast.parse(expression, mode='eval')
    except SyntaxError as error:
        raise ValueError('极坐标公式语法无效。') from error
    if sum(1 for _ in ast.walk(tree)) > 64:
        raise ValueError('极坐标公式过于复杂。')
    exponents = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.Expression, ast.Load)):
            continue
        if isinstance(node, ast.BinOp) and type(node.op) in (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow):
            if isinstance(node.op, ast.Pow):
                exponent = _literal_exponent(node.right)
                if not 0 <= exponent <= 12:
                    raise ValueError('极坐标公式的幂指数须为 0–12 的常数。')
                exponents[node] = exponent
            continue
        if isinstance(node, ast.UnaryOp) and type(node.op) in (ast.UAdd, ast.USub):
            continue
        if isinstance(node, (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow, ast.UAdd, ast.USub)):
            continue
        if isinstance(node, ast.Constant) and type(node.value) in (int, float) and abs(node.value) <= 1e3:
            continue
        if isinstance(node, ast.Name) and node.id in _RADIUS_NAMES | _RADIUS_FUNCTIONS.keys():
            continue
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in _RADIUS_FUNCTIONS and not node.keywords and len(node.args) == 1:
            continue
        raise ValueError('极坐标公式只能使用 r、phi、pi、tau、四则运算、有限幂及 sin/cos/sqrt/abs。')
    def evaluate(radius, phi):
        names = {'r': radius, 'phi': phi, 'pi': math.pi, 'tau': math.tau}

        def bounded(value):
            try:
                if type(value) not in (int, float) or not math.isfinite(value) or abs(value) > 1e6:
                    raise ValueError('极坐标公式的中间值超出范围。')
            except OverflowError as error:
                raise ValueError('极坐标公式的中间值超出范围。') from error
            return float(value)

        def calculate(node):
            if isinstance(node, ast.Expression):
                return calculate(node.body)
            if isinstance(node, ast.Constant):
                return bounded(node.value)
            if isinstance(node, ast.Name):
                if node.id not in names:
                    raise ValueError('函数名必须带括号和一个参数。')
                return bounded(names[node.id])
            if isinstance(node, ast.UnaryOp):
                value = calculate(node.operand)
                return bounded(value if isinstance(node.op, ast.UAdd) else -value)
            if isinstance(node, ast.BinOp):
                left, right = calculate(node.left), calculate(node.right)
                try:
                    if isinstance(node.op, ast.Add):value = left+right
                    elif isinstance(node.op, ast.Sub):value = left-right
                    elif isinstance(node.op, ast.Mult):value = left*right
                    elif isinstance(node.op, ast.Div):value = left/right
                    else:value = left**exponents[node]
                except (ArithmeticError, ValueError) as error:
                    raise ValueError('极坐标公式在当前角度无法求值。') from error
                return bounded(value)
            try:
                return bounded(_RADIUS_FUNCTIONS[node.func.id](calculate(node.args[0])))
            except (ArithmeticError, ValueError) as error:
                raise ValueError('极坐标公式在当前角度无法求值。') from error

        value = calculate(tree)
        if not 1e-6 < value < 1e5:
            raise ValueError('极坐标公式必须得到有限正半径。')
        return value

    def evaluate_range(radius, low_phi, high_phi):
        """Conservative interval extension, used to find the *first* ray crossing."""
        names = {'r': (radius, radius), 'phi': (low_phi, high_phi),
                 'pi': (math.pi, math.pi), 'tau': (math.tau, math.tau)}

        def calculate_range(node):
            if isinstance(node, ast.Expression):
                return calculate_range(node.body)
            if isinstance(node, ast.Constant):
                return float(node.value), float(node.value)
            if isinstance(node, ast.Name):
                if node.id not in names:
                    raise ValueError('函数名必须带括号和一个参数。')
                return names[node.id]
            if isinstance(node, ast.UnaryOp):
                low, high = calculate_range(node.operand)
                return (low, high) if isinstance(node.op, ast.UAdd) else (-high, -low)
            if isinstance(node, ast.BinOp):
                a, b = calculate_range(node.left), calculate_range(node.right)
                if not all(math.isfinite(value) for value in (*a, *b)):
                    return -math.inf, math.inf
                if isinstance(node.op, ast.Add):
                    return a[0]+b[0], a[1]+b[1]
                if isinstance(node.op, ast.Sub):
                    return a[0]-b[1], a[1]-b[0]
                if isinstance(node.op, ast.Mult):
                    products = [x*y for x in a for y in b]
                    return min(products), max(products)
                if isinstance(node.op, ast.Div):
                    if b[0] <= 0 <= b[1]:
                        return -math.inf, math.inf
                    products = [x/y for x in a for y in b]
                    return min(products), max(products)
                exponent = exponents[node]
                if exponent == 0:
                    return 1., 1.
                if not float(exponent).is_integer():
                    if a[0] < 0:
                        return -math.inf, math.inf
                    return a[0]**exponent, a[1]**exponent
                exponent = int(exponent)
                if exponent % 2:
                    return a[0]**exponent, a[1]**exponent
                values = [a[0]**exponent, a[1]**exponent]
                return (0. if a[0] <= 0 <= a[1] else min(values)), max(values)
            low, high = calculate_range(node.args[0])
            name = node.func.id
            if name == 'sin':
                return _trig_bounds(low, high, math.sin, math.pi/2, -math.pi/2)
            if name == 'cos':
                return _trig_bounds(low, high, math.cos, 0., math.pi)
            if name == 'abs':
                return (0. if low <= 0 <= high else min(abs(low), abs(high))), max(abs(low), abs(high))
            if high < 0:
                return -math.inf, math.inf
            return math.sqrt(max(0., low)), math.sqrt(max(0., high))

        try:
            low, high = calculate_range(tree)
        except (ArithmeticError, ValueError, OverflowError):
            return -math.inf, math.inf
        margin = 1e-12 * (1 + max(abs(low), abs(high))) if math.isfinite(low) and math.isfinite(high) else 0.
        return low-margin, high+margin

    evaluate.bounds = evaluate_range

    return evaluate


def _add(a, b):
    return [a[0] + b[0], a[1] + b[1]]


def _sub(a, b):
    return [a[0] - b[0], a[1] - b[1]]


def _mul(a, factor):
    return [a[0] * factor, a[1] * factor]


def _rotate(v, angle):
    c, s = math.cos(angle), math.sin(angle)
    return [c * v[0] - s * v[1], s * v[0] + c * v[1]]


def _unit(v):
    length = math.hypot(*v)
    if length < 1e-10:
        raise ValueError('环状传播方向退化；请调整半径或褶角。')
    return _mul(v, 1 / length)


def _cross(a, b):
    return a[0] * b[1] - a[1] * b[0]


def _segments_intersect(a, b, c, d):
    """Include touching endpoints; nesting needs strictly separate outlines."""
    u, v, displacement = _sub(b, a), _sub(d, c), _sub(c, a)
    determinant = _cross(u, v)
    tolerance = 1e-10 * max(1., math.hypot(*u) * math.hypot(*v))
    if abs(determinant) <= tolerance:
        if abs(_cross(u, displacement)) > tolerance:
            return False
        axis = 0 if abs(u[0]) >= abs(u[1]) else 1
        return max(min(a[axis], b[axis]), min(c[axis], d[axis])) <= min(max(a[axis], b[axis]), max(c[axis], d[axis])) + 1e-9
    along_u = _cross(displacement, v) / determinant
    along_v = _cross(displacement, u) / determinant
    return -1e-9 <= along_u <= 1+1e-9 and -1e-9 <= along_v <= 1+1e-9


def _point_in_polygon(point, vertices, margin=0.):
    """Strict containment, including a positive distance from every edge."""
    x, y = point
    inside = False
    for a, b in zip(vertices, vertices[1:] + vertices[:1]):
        edge = _sub(b, a)
        length_sq = edge[0]**2 + edge[1]**2
        fraction = max(0., min(1., ((x-a[0])*edge[0] + (y-a[1])*edge[1]) / length_sq))
        closest = _add(a, _mul(edge, fraction))
        if math.dist(point, closest) <= margin:
            return False
        if (a[1] > y) != (b[1] > y) and x < a[0] + (b[0]-a[0]) * (y-a[1]) / (b[1]-a[1]):
            inside = not inside
    return inside


def _line(a, da, b, db):
    determinant = _cross(da, db)
    if abs(determinant) < 1e-10:
        raise ValueError('环状传播中的直线平行；请调整半径或褶角。')
    return _add(a, _mul(da, _cross(_sub(b, a), db) / determinant))


def _vector_ray(curve, point, direction):
    """Exact first ray exit from a simple, possibly concave polygon."""
    base, profile = curve
    vertices = [_mul(vertex, base) for vertex in profile.vertices]
    if not _point_in_polygon(point, vertices, 1e-9 * max(1., base)):
        raise ValueError('传播起点不在目标二维向量曲线内部；请增大曲线间距。')
    first_exit = math.inf
    for a, b in zip(vertices, vertices[1:]+vertices[:1]):
        edge = _sub(b, a)
        determinant = _cross(direction, edge)
        if abs(determinant) <= 1e-12 * math.hypot(*direction) * math.hypot(*edge):
            continue
        displacement = _sub(a, point)
        distance = _cross(displacement, edge) / determinant
        along = _cross(displacement, direction) / determinant
        if distance > 1e-9 and -1e-9 <= along <= 1+1e-9:
            first_exit = min(first_exit, distance)
    if not math.isfinite(first_exit):
        raise ValueError('传播射线未与目标二维向量曲线相交。')
    return _add(point, _mul(direction, first_exit))


def _radius(curve, angle):
    base, profile = curve
    if profile is None:
        return base
    if isinstance(profile, LinearEllipse):
        return ellipse_radial_radius(profile.matrix, base, angle)
    if isinstance(profile, FourierCurve):
        return profile.radius_at_angle(base, angle)
    if isinstance(profile, SignedPowerSuperellipse):
        return profile.radial_radius(base, angle)
    if isinstance(profile, _VectorPolygon):
        return math.hypot(*_vector_ray(curve, [0., 0.], [math.cos(angle), math.sin(angle)]))
    if callable(profile):
        return profile(base, angle % math.tau)
    position = angle % math.tau * len(profile) / math.tau
    index = math.floor(position)
    fraction = position - index
    return base * (profile[index % len(profile)] * (1 - fraction) + profile[(index+1) % len(profile)] * fraction)


def _radius_bounds(curve, low, high):
    """Enclose every radius on an unwrapped angular interval."""
    base, profile = curve
    if profile is None:
        return base, base
    if isinstance(profile, LinearEllipse):
        return ellipse_radius_bounds(profile.matrix, base)
    if isinstance(profile, FourierCurve):
        return profile.radius_bounds(base, low, high)
    if isinstance(profile, SignedPowerSuperellipse):
        return profile.radial_bounds(base, low, high)
    if isinstance(profile, _VectorPolygon):
        vertices = [_mul(vertex, base) for vertex in profile.vertices]
        minimum = min(abs(_cross(_sub(b, a), a))/math.dist(a, b)
                      for a, b in zip(vertices, vertices[1:]+vertices[:1]))
        return minimum, max(math.hypot(*vertex) for vertex in vertices)
    if high-low >= math.tau:
        if callable(profile):
            return profile.bounds(base, 0., math.tau)
        return base*min(profile), base*max(profile)
    if callable(profile):
        if not hasattr(profile, 'bounds'):
            raise ValueError('解析极坐标曲线缺少区间界，无法可靠求首次交点。')
        first, last = math.floor(low/math.tau), math.floor(high/math.tau)
        if first == last:
            return profile.bounds(base, low-first*math.tau, high-first*math.tau)
        a = profile.bounds(base, low-first*math.tau, math.tau)
        b = profile.bounds(base, 0., high-last*math.tau)
        return min(a[0], b[0]), max(a[1], b[1])
    count = len(profile)
    values = [_radius(curve, low), _radius(curve, high)]
    for knot in range(math.ceil(low*count/math.tau), math.floor(high*count/math.tau)+1):
        values.append(base*profile[knot % count])
    return min(values), max(values)


def _ray_angle_bounds(point, direction, low, high):
    a = _add(point, _mul(direction, low))
    b = _add(point, _mul(direction, high))
    if abs(_cross(a, b)) <= 1e-12*max(1., math.hypot(*a)*math.hypot(*b)) and a[0]*b[0]+a[1]*b[1] <= 0:
        return 0., math.tau
    first, last = math.atan2(a[1], a[0]), math.atan2(b[1], b[0])
    delta = (last-first+math.pi) % math.tau-math.pi
    return min(first, first+delta), max(first, first+delta)


def _ray_signed_bounds(curve, point, direction, low, high):
    first = _add(point, _mul(direction, low))
    last = _add(point, _mul(direction, high))
    distances = [math.hypot(*first), math.hypot(*last)]
    length_squared = direction[0]**2+direction[1]**2
    closest = -(point[0]*direction[0]+point[1]*direction[1])/length_squared
    if low < closest < high:
        distances.append(math.hypot(*_add(point, _mul(direction, closest))))
    angular = _ray_angle_bounds(point, direction, low, high)
    radii = _radius_bounds(curve, *angular)
    return min(distances)-radii[1], max(distances)-radii[0]


def _check_nested_curves(inner, outer):
    """Reject narrow crossings that a fixed-angle nesting scan would miss."""
    if isinstance(inner[1], LinearEllipse) and isinstance(outer[1], LinearEllipse):
        certify_nested_ellipses(inner[1].matrix, inner[0], outer[1].matrix, outer[0])
        return
    if (isinstance(inner[1], FourierCurve) and isinstance(outer[1], FourierCurve) and
            inner[1].offset == outer[1].offset and inner[1].harmonics == outer[1].harmonics):
        if (outer[0]-inner[0])*inner[1].min_norm <= 1e-5:
            raise ValueError('二维傅里叶曲线必须逐环严格嵌套且保持间距。')
        return
    if isinstance(inner[1], _VectorPolygon) and isinstance(outer[1], _VectorPolygon):
        inner_vertices = [_mul(vertex, inner[0]) for vertex in inner[1].vertices]
        outer_vertices = [_mul(vertex, outer[0]) for vertex in outer[1].vertices]
        if any(not _point_in_polygon(point, outer_vertices, 1e-5) for point in inner_vertices):
            raise ValueError('二维向量曲线必须逐环严格嵌套且保持间距。')
        if any(_segments_intersect(a,b,c,d)
               for a,b in zip(inner_vertices,inner_vertices[1:]+inner_vertices[:1])
               for c,d in zip(outer_vertices,outer_vertices[1:]+outer_vertices[:1])):
            raise ValueError('二维向量曲线必须逐环严格嵌套且保持间距。')
        return
    checked = 0

    def check(low, high, depth):
        nonlocal checked
        checked += 1
        if checked > 25000:
            raise ValueError('极坐标曲线波动过快，无法可靠验证逐环嵌套。')
        inside = _radius_bounds(inner, low, high)
        outside = _radius_bounds(outer, low, high)
        if inside[1]+1e-5 < outside[0]:
            return
        middle = (low+high)/2
        for angle in (low, middle, high):
            if _radius(inner, angle)+1e-5 >= _radius(outer, angle):
                raise ValueError('极坐标曲线必须逐环严格嵌套且保持间距。')
        if depth >= 16:
            raise ValueError('极坐标曲线间距过小或波动过快，无法可靠验证逐环嵌套。')
        check(low, middle, depth+1)
        check(middle, high, depth+1)

    for j in range(256):
        check(math.tau*j/256, math.tau*(j+1)/256, 0)


def _check_positive_curve(curve):
    if not callable(curve[1]):
        return
    checked = 0

    def check(low, high, depth):
        nonlocal checked
        checked += 1
        if checked > 25000:
            raise ValueError('极坐标曲线波动过快，无法可靠验证正半径。')
        lower, _ = _radius_bounds(curve, low, high)
        if lower > 1e-6:
            return
        middle = (low+high)/2
        for angle in (low, middle, high):
            if _radius(curve, angle) <= 1e-6:
                raise ValueError('极坐标公式在所有角度都必须保持正半径。')
        if depth >= 16:
            raise ValueError('极坐标曲线波动过快，无法可靠验证正半径。')
        check(low, middle, depth+1)
        check(middle, high, depth+1)

    for j in range(256):
        check(math.tau*j/256, math.tau*(j+1)/256, 0)


def _polar_ray(curve, point, direction, maximum=None):
    radius, profile = curve
    if isinstance(profile, LinearEllipse):
        return ellipse_first_ray_exit(profile.matrix, radius, point, direction)
    if isinstance(profile, FourierCurve):
        return profile.first_ray_exit(radius, point, direction)
    if isinstance(profile, _VectorPolygon):
        return _vector_ray(curve, point, direction)
    if profile is not None:
        def signed(t):
            candidate = _add(point, _mul(direction, t))
            return math.hypot(*candidate) - _radius(curve, math.atan2(candidate[1], candidate[0]))
        if signed(0) >= -1e-9:
            raise ValueError('起点不在目标极坐标曲线内部；请增大曲线间距。')
        if maximum is None:
            maximum = (radius*profile.maximum if isinstance(profile, SignedPowerSuperellipse) else
                       max(_radius(curve, math.tau*i/256) for i in range(256)) if callable(profile) else radius*max(profile))
        limit = 4 * max(maximum, math.hypot(*point), 1)
        while signed(limit) < 0 and limit < 4e5:
            limit *= 2
        if signed(limit) < 0:
            raise ValueError('传播射线未与目标极坐标曲线相交。')
        checked = 0
        tolerance = 1e-11 * max(1., math.hypot(*point))

        def first_crossing(low, high):
            nonlocal checked
            checked += 1
            if checked > 50000:
                raise ValueError('极坐标曲线过于复杂，无法可靠确定首次交点。')
            _, upper = _ray_signed_bounds(curve, point, direction, low, high)
            if upper < 0:
                return None
            if high-low <= tolerance:
                if signed(high) < 0:
                    if upper < 1e-8*max(1., radius, math.hypot(*point)):
                        return None
                    raise ValueError('极坐标曲线在射线附近过于贴近，无法可靠确定首次交点。')
                if signed(low) > 1e-9:
                    raise ValueError('极坐标曲线在射线附近过于贴近，无法可靠确定首次交点。')
                for _ in range(45):
                    middle = (low+high)/2
                    if signed(middle) >= 0:
                        high = middle
                    else:
                        low = middle
                return (low+high)/2
            middle = (low+high)/2
            first = first_crossing(low, middle)
            return first if first is not None else first_crossing(middle, high)

        crossing = first_crossing(0., limit)
        if crossing is None:
            raise ValueError('传播射线未与目标极坐标曲线相交。')
        return _add(point, _mul(direction, crossing))
    direction_squared = direction[0]**2+direction[1]**2
    if direction_squared < 1e-24:
        raise ValueError('传播射线方向退化。')
    projection = point[0] * direction[0] + point[1] * direction[1]
    inside = radius*radius-point[0]**2-point[1]**2
    discriminant = projection*projection+direction_squared*inside
    if discriminant < -1e-10:
        raise ValueError('传播射线未与目标圆相交；请调整半径或褶角。')
    root = math.sqrt(max(0, discriminant))
    t = inside/(root+projection) if inside > 0 and projection > 0 else (-projection+root)/direction_squared
    if t < 1e-9:
        raise ValueError('传播射线未向外到达目标圆；请调整半径或褶角。')
    return _add(point, _mul(direction, t))


def _ring_curves(p_radii, r_radii, outer_profiles=None, crease_profiles=None,
                 outer_expressions=None, crease_expressions=None,
                 outer_vectors=None, crease_vectors=None,
                 outer_linear_maps=None, crease_linear_maps=None,
                 outer_fourier_curves=None, crease_fourier_curves=None,
                 outer_signed_powers=None, crease_signed_powers=None,
                 outer_vector_expressions=None, crease_vector_expressions=None,
                 outer_vector_template=None, crease_vector_template=None,
                 vector_function_definitions=None):
    n = len(r_radii)
    if len(p_radii) != n+1 or n < 1:
        raise ValueError('原版环状传播需要 n+1 个外环半径和 n 个中间半径。')
    variants = sum((outer_profiles is not None or crease_profiles is not None,
                    outer_expressions is not None or crease_expressions is not None,
                    outer_vectors is not None or crease_vectors is not None,
                    outer_linear_maps is not None or crease_linear_maps is not None,
                    outer_fourier_curves is not None or crease_fourier_curves is not None,
                    outer_signed_powers is not None or crease_signed_powers is not None,
                    outer_vector_expressions is not None or crease_vector_expressions is not None,
                    outer_vector_template is not None or crease_vector_template is not None))
    if variants > 1:
        raise ValueError('极坐标采样、公式与二维向量曲线不能同时使用。')
    if outer_expressions is not None or crease_expressions is not None:
        if not isinstance(outer_expressions, list) or not isinstance(crease_expressions, list) or len(outer_expressions) != n+1 or len(crease_expressions) != n:
            raise ValueError('极坐标公式组数与环数不一致。')
        outer_profiles = [compile_radius_expression(text) for text in outer_expressions]
        crease_profiles = [compile_radius_expression(text) for text in crease_expressions]
    if outer_vectors is not None or crease_vectors is not None:
        if (not isinstance(outer_vectors, list) or not isinstance(crease_vectors, list)
                or len(outer_vectors) != n+1 or len(crease_vectors) != n):
            raise ValueError('二维向量曲线组数与环数不一致。')
        outer_profiles = [_VectorPolygon(validate_vector_polygon(row)) for row in outer_vectors]
        crease_profiles = [_VectorPolygon(validate_vector_polygon(row)) for row in crease_vectors]
    if outer_linear_maps is not None or crease_linear_maps is not None:
        if (not isinstance(outer_linear_maps, list) or not isinstance(crease_linear_maps, list)
                or len(outer_linear_maps) != n+1 or len(crease_linear_maps) != n):
            raise ValueError('二维线性曲线组数与环数不一致。')
        outer_profiles = [LinearEllipse(row) for row in outer_linear_maps]
        crease_profiles = [LinearEllipse(row) for row in crease_linear_maps]
    if outer_fourier_curves is not None or crease_fourier_curves is not None:
        if (not isinstance(outer_fourier_curves, list) or not isinstance(crease_fourier_curves, list)
                or len(outer_fourier_curves) != n+1 or len(crease_fourier_curves) != n):
            raise ValueError('二维傅里叶曲线组数与环数不一致。')
        outer_profiles = [FourierCurve(row) for row in outer_fourier_curves]
        crease_profiles = [FourierCurve(row) for row in crease_fourier_curves]
    if outer_signed_powers is not None or crease_signed_powers is not None:
        if (not isinstance(outer_signed_powers, list) or not isinstance(crease_signed_powers, list)
                or len(outer_signed_powers) != n+1 or len(crease_signed_powers) != n):
            raise ValueError('圆到方形二维向量幂组数与环数不一致。')
        outer_profiles = [SignedPowerSuperellipse(power) for power in outer_signed_powers]
        crease_profiles = [SignedPowerSuperellipse(power) for power in crease_signed_powers]
    if outer_vector_expressions is not None or crease_vector_expressions is not None:
        if (not isinstance(outer_vector_expressions, list) or not isinstance(crease_vector_expressions, list)
                or len(outer_vector_expressions) != n+1 or len(crease_vector_expressions) != n):
            raise ValueError('二维向量公式组数与环数不一致。')
        outer_profiles = [vector_expression_curve(row, function_definitions=vector_function_definitions) for row in outer_vector_expressions]
        crease_profiles = [vector_expression_curve(row, function_definitions=vector_function_definitions) for row in crease_vector_expressions]
    if outer_vector_template is not None or crease_vector_template is not None:
        if not isinstance(outer_vector_template, list) or not isinstance(crease_vector_template, list):
            raise ValueError('索引二维公式须同时提供 pfn 与 rfn。')
        outer_profiles = [vector_expression_curve(outer_vector_template, i, vector_function_definitions) for i in range(n+1)]
        crease_profiles = [vector_expression_curve(crease_vector_template, i, vector_function_definitions) for i in range(n)]
    p_curves = list(zip(p_radii, outer_profiles or [None]*(n+1)))
    r_curves = list(zip(r_radii, crease_profiles or [None]*n))
    return p_curves, r_curves, outer_profiles is not None or crease_profiles is not None


def _ring_curve_point(curve, phi):
    base, profile = curve
    if isinstance(profile, LinearEllipse):
        return ellipse_point(profile.matrix, base, phi)
    if isinstance(profile, (FourierCurve, SignedPowerSuperellipse)):
        return profile.point(base, phi)
    radial = _radius(curve, phi)
    return [radial*math.cos(phi), radial*math.sin(phi)]


def ring_function_graphics_query(data):
    """The original RingFunctionGraphics pfn/rfn lines, not a CP or FF.

    In[2676] samples phi=0..2 Pi in steps of .02 Pi, with n+1 pfn
    (Gray) and n rfn (Lighter[Gray,.25]) curves. This query evaluates
    the actual vector parameter, including its phase, for each mode.
    """
    from tessellation_advanced import validate_advanced
    if not isinstance(data, dict):
        raise ValueError('环状输入曲线查询需要原版环状参数。')
    request = {key:value for key,value in data.items() if key != 'operation'}
    params = validate_advanced(request)
    if params['family'] != 'ring' or params.get('ringMode') != 'origamica':
        raise ValueError('输入曲线预览只用于原版环状传播。')
    p_curves, r_curves, _ = _ring_curves(
        params['outerRadii'], params['creaseRadii'],
        outer_profiles=params.get('outerProfiles'), crease_profiles=params.get('creaseProfiles'),
        outer_expressions=params.get('outerExpressions'), crease_expressions=params.get('creaseExpressions'),
        outer_vectors=params.get('outerVectors'), crease_vectors=params.get('creaseVectors'),
        outer_linear_maps=params.get('outerLinearMaps'), crease_linear_maps=params.get('creaseLinearMaps'),
        outer_fourier_curves=params.get('outerFourierCurves'), crease_fourier_curves=params.get('creaseFourierCurves'),
        outer_signed_powers=params.get('outerSignedPowers'), crease_signed_powers=params.get('creaseSignedPowers'),
        outer_vector_expressions=params.get('outerVectorExpressions'), crease_vector_expressions=params.get('creaseVectorExpressions'),
        outer_vector_template=params.get('outerVectorTemplate'), crease_vector_template=params.get('creaseVectorTemplate'),
        vector_function_definitions=params.get('vectorFunctionDefinitions'))
    for curve in p_curves+r_curves:
        _check_positive_curve(curve)
    angles=[math.pi*j/50 for j in range(101)]
    outer=[[_ring_curve_point(curve, phi) for phi in angles] for curve in p_curves]
    crease=[[_ring_curve_point(curve, phi) for phi in angles] for curve in r_curves]
    if any(not all(math.isfinite(value) and abs(value)<1e6 for value in point)
           for line in outer+crease for point in line):
        raise ValueError('输入曲线产生无效或过大的坐标。')
    return {'kind':'origamica-ring-function-graphics','sourceFunction':'RingFunctionGraphics',
            'outerCurves':outer,'creaseCurves':crease,'sampleCount':101,
            'stepRadians':math.pi/50,'outerColor':'Gray','creaseColor':'Lighter[Gray,0.25]',
            'creasePattern':False,'flatFoldedForm':False}


def circular_ring_pattern(sides, p_radii, r_radii, angle_degrees, offset_degrees=0,
                          outer_profiles=None, crease_profiles=None,
                          outer_expressions=None, crease_expressions=None,
                          outer_vectors=None, crease_vectors=None,
                          outer_linear_maps=None, crease_linear_maps=None,
                          outer_fourier_curves=None, crease_fourier_curves=None,
                          outer_signed_powers=None, crease_signed_powers=None,
                          outer_vector_expressions=None, crease_vector_expressions=None,
                          outer_vector_template=None, crease_vector_template=None,
                          vector_function_definitions=None):
    """Return CP, flat coordinates, and construction metadata.

    p_radii[i] and r_radii[i] are the base radii for pfn[i] and rfn[i].
    The notebook's n is len(r_radii), with p_radii having n+1 entries.
    """
    n = len(r_radii)
    if len(p_radii) != n + 1 or n < 1:
        raise ValueError('原版环状传播需要 n+1 个外环半径和 n 个中间半径。')
    alpha = math.radians(angle_degrees)
    p_curves, r_curves, have_profiles = _ring_curves(
        p_radii, r_radii, outer_profiles, crease_profiles,
        outer_expressions, crease_expressions, outer_vectors, crease_vectors,
        outer_linear_maps, crease_linear_maps, outer_fourier_curves, crease_fourier_curves,
        outer_signed_powers, crease_signed_powers, outer_vector_expressions, crease_vector_expressions,
        outer_vector_template, crease_vector_template, vector_function_definitions)
    for curve in p_curves+r_curves:
        _check_positive_curve(curve)
    def max_radius(curve):
        base, profile = curve
        if isinstance(profile, LinearEllipse):
            return ellipse_radius_bounds(profile.matrix, base)[1]
        if isinstance(profile, FourierCurve):
            return base*profile.max_norm
        if isinstance(profile, SignedPowerSuperellipse):
            return base*profile.maximum
        if isinstance(profile, _VectorPolygon):
            return base*max(math.hypot(*vertex) for vertex in profile.vertices)
        return max(_radius(curve, math.tau*j/256) for j in range(256)) if callable(profile) else base*max(profile) if profile is not None else base
    p_max = [max_radius(curve) for curve in p_curves]
    r_max = [max_radius(curve) for curve in r_curves]
    if have_profiles:
        for i in range(n):
            _check_nested_curves(p_curves[i], r_curves[i])
            _check_nested_curves(r_curves[i], p_curves[i+1])
    p, q, r, s = [], [], [], []
    pi, qi, ri, si = [], [], [], []
    vertices = []

    def append(point):
        if not all(math.isfinite(v) and abs(v) < 1e6 for v in point):
            raise ValueError('环状传播产生无效或过大的坐标。')
        vertices.append(point)
        return len(vertices) - 1

    p.append([_ring_curve_point(p_curves[0], math.radians(offset_degrees)+math.tau*j/sides)
              for j in range(sides)])
    q.append(p[0])
    pi.append([append(point) for point in p[0]])
    qi.append(pi[0])
    dr = [[_rotate(_unit(_sub(q[0][(j-1) % sides], p[0][j])), math.pi-alpha) for j in range(sides)]]
    ds = [[_rotate(_unit(_sub(p[0][(j+1) % sides], q[0][j])), -alpha) for j in range(sides)]]
    for i in range(n):
        r.append([_polar_ray(r_curves[i], p[i][j], dr[i][j], r_max[i]) for j in range(sides)])
        ri.append([append(point) for point in r[i]])
        s.append([_line(r[i][(j+1) % sides], _rotate(dr[i][(j+1) % sides], alpha),
                        q[i][j], ds[i][j]) for j in range(sides)])
        si.append([append(point) for point in s[i]])
        dp = [_rotate(_unit(_sub(r[i][j], s[i][j])), alpha) for j in range(sides)]
        p.append([_polar_ray(p_curves[i+1], r[i][j], dp[j], p_max[i+1]) for j in range(sides)])
        pi.append([append(point) for point in p[i+1]])
        q.append([_line(s[i][j], dp[j], p[i+1][j], _rotate(_sub(r[i][j], p[i+1][j]), -alpha))
                  for j in range(sides)])
        qi.append([append(point) for point in q[i+1]])
        dr.append([_rotate(_unit(_sub(q[i+1][(j-1) % sides], p[i+1][j])), math.pi-alpha)
                   for j in range(sides)])
        ds.append([_rotate(_unit(_sub(p[i+1][(j+1) % sides], q[i+1][j])), -alpha)
                   for j in range(sides)])

    edges, assignments = [], []

    def edge(a, b, assignment):
        edges.append([a, b])
        assignments.append(assignment)

    for i in range(n):
        for j in range(sides):
            edge(pi[i][j], ri[i][j], 'M')
            edge(ri[i][j], pi[i+1][j], 'M')
    for i in range(n):
        for j in range(sides):
            edge(qi[i][j], si[i][j], 'V')
            edge(si[i][j], qi[i+1][j], 'V')
    for j in range(sides):
        edge(pi[0][j], pi[0][(j+1) % sides], 'M')
    for i in range(n):
        for j in range(sides):
            edge(ri[i][j], si[i][j], 'M')
            edge(si[i][j], ri[i][(j+1) % sides], 'V')
        for j in range(sides):
            edge(pi[i+1][j], qi[i+1][j], 'B' if i == n-1 else 'V')
            edge(qi[i+1][j], pi[i+1][(j+1) % sides], 'B' if i == n-1 else 'M')

    flat = [point.copy() for point in vertices]
    for j in range(sides):
        for i in range(n):
            flat[ri[i][j]] = _add(flat[pi[i][j]], _rotate(_sub(r[i][j], p[i][j]), 2*alpha))
            flat[si[i][j]] = _add(flat[qi[i][j]], _rotate(_sub(s[i][j], q[i][j]), 2*alpha))
            flat[pi[i+1][j]] = _add(flat[ri[i][j]], _sub(p[i+1][j], r[i][j]))
            flat[qi[i+1][j]] = _add(flat[si[i][j]], _sub(q[i+1][j], s[i][j]))

    if len({tuple(sorted(e)) for e in edges}) != len(edges):
        raise ValueError('环状传播产生重复的边；请调整半径或褶角。')
    faces = planar_faces(vertices, edges)
    if len(faces) != 4*n*sides+1:
        raise ValueError('环状传播形成交叉或缺失面；请调整半径或褶角。')
    fold = make_fold(vertices, edges, assignments, faces)
    max_error = max(abs(math.dist(vertices[a], vertices[b])-math.dist(flat[a], flat[b]))
                    for a, b in edges)
    if max_error > 1e-7 * max(1, max(abs(v) for point in vertices for v in point)):
        raise ValueError('环状传播的折后边长不闭合；请调整半径或褶角。')
    return fold, flat, max_error
