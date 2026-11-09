"""Certified smooth vector-valued pfn/rfn for Origamica ring propagation.

Each curve is R * (offset + sum(M[k] (cos((k+1) phi), sin((k+1) phi)))).
The first harmonic is a nondegenerate oriented ellipse; bounded higher
harmonics may distort it without replacing the *parameter* angle by a polar
angle. Analytic perturbation bounds prove winding one and strictly increasing
polar angle. Interval enclosures certify radii and all intersections.
"""
import bisect
import math

from tessellation_ring_vector_ellipse import singular_extrema, validate_linear_map


def _norm(point):
    return math.hypot(*point)


def _trig_bounds(low, high, cosine=False):
    if high-low >= math.tau:
        return -1., 1.
    function, maximum = (math.cos, 0.) if cosine else (math.sin, math.pi/2)
    values = [function(low), function(high)]
    if math.ceil((low-maximum)/math.tau-1e-12) <= math.floor((high-maximum)/math.tau+1e-12):
        values.append(1.)
    minimum = maximum+math.pi
    if math.ceil((low-minimum)/math.tau-1e-12) <= math.floor((high-minimum)/math.tau+1e-12):
        values.append(-1.)
    return min(values), max(values)


def _scaled_interval(interval, factor):
    a, b = factor*interval[0], factor*interval[1]
    return min(a, b), max(a, b)


def _add_intervals(a, b):
    return a[0]+b[0], a[1]+b[1]


def _subtract_intervals(a, b):
    return a[0]-b[1], a[1]-b[0]


def validate_fourier_curve(value):
    if not isinstance(value, dict) or set(value)-{'offset', 'harmonics'}:
        raise ValueError('二维傅里叶曲线只能包含 offset 与 harmonics。')
    harmonics = value.get('harmonics')
    offset = value.get('offset', [0, 0])
    if (not isinstance(harmonics, list) or not 1 <= len(harmonics) <= 4 or
            any(not isinstance(matrix, list) or len(matrix) != 2 or
                any(not isinstance(row, list) or len(row) != 2 or
                    any(type(v) not in (int, float) or not math.isfinite(v) or abs(v) > 2 for v in row)
                    for row in matrix) for matrix in harmonics)):
        raise ValueError('二维傅里叶曲线须有 1–4 个有限的 2×2 谐波矩阵。')
    if (not isinstance(offset, list) or len(offset) != 2 or
            any(type(v) not in (int, float) or not math.isfinite(v) or abs(v) > .5 for v in offset)):
        raise ValueError('二维傅里叶曲线的 offset 须为 -0.5–0.5 的二维向量。')
    first = validate_linear_map(harmonics[0])
    rest = [[[float(v) for v in row] for row in matrix] for matrix in harmonics[1:]]
    offset = [float(v) for v in offset]
    sigma_min, sigma_max = singular_extrema(first)
    h0 = _norm(offset)+sum(singular_extrema(matrix)[1] for matrix in rest)
    h1 = sum((index+2)*singular_extrema(matrix)[1] for index, matrix in enumerate(rest))
    determinant = first[0][0]*first[1][1]-first[0][1]*first[1][0]
    if (h0 >= sigma_min-.01 or
            determinant <= sigma_max*(h0+h1)+h0*h1+.01 or
            (sigma_max+h1)/(sigma_min-h0) >= 64):
        raise ValueError('二维傅里叶扰动过大，无法证明曲线绕原点单圈且每条射线恰交一次。')
    return {'offset': offset, 'harmonics': [first]+rest}


class FourierCurve:
    """Smooth simple curve with certified monotone geometric polar angle."""

    def __init__(self, value):
        normalized = validate_fourier_curve(value)
        self.offset = normalized['offset']
        self.harmonics = normalized['harmonics']
        minimum, maximum = singular_extrema(self.harmonics[0])
        remainder = _norm(self.offset)+sum(singular_extrema(m)[1] for m in self.harmonics[1:])
        self.min_norm, self.max_norm = minimum-remainder, maximum+remainder
        self._samples = 256
        first_angle = math.atan2(self.point(1., 0.)[1], self.point(1., 0.)[0])
        self.first_angle = first_angle
        angles = [0.]
        previous = first_angle
        for index in range(1, self._samples+1):
            phi = math.tau*index/self._samples
            point = self.point(1., phi)
            angle = math.atan2(point[1], point[0])
            increment = (angle-previous+math.pi) % math.tau-math.pi
            if not 0 < increment < math.pi/2:
                raise ValueError('二维傅里叶曲线角度未严格递增。')
            angles.append(angles[-1]+increment)
            previous = angle
        if abs(angles[-1]-math.tau) > 1e-10:
            raise ValueError('二维傅里叶曲线未闭合一周。')
        self.angles = angles

    def point(self, radius, phi):
        x, y = self.offset
        for harmonic, matrix in enumerate(self.harmonics, 1):
            co, si = math.cos(harmonic*phi), math.sin(harmonic*phi)
            x += matrix[0][0]*co+matrix[0][1]*si
            y += matrix[1][0]*co+matrix[1][1]*si
        return [radius*x, radius*y]

    def _components(self, low, high, derivative=False):
        coordinates = [(0., 0.), (0., 0.)] if derivative else [(v, v) for v in self.offset]
        for harmonic, matrix in enumerate(self.harmonics, 1):
            cosine = _trig_bounds(harmonic*low, harmonic*high, True)
            sine = _trig_bounds(harmonic*low, harmonic*high)
            for dimension in range(2):
                a, b = matrix[dimension]
                terms = ((_scaled_interval(sine, -harmonic*a),
                          _scaled_interval(cosine, harmonic*b)) if derivative else
                         (_scaled_interval(cosine, a), _scaled_interval(sine, b)))
                coordinates[dimension] = _add_intervals(coordinates[dimension],
                                                       _add_intervals(*terms))
        return coordinates

    def _parameter_at_relative_angle(self, relative):
        if relative <= 0:
            return 0.
        if relative >= math.tau:
            return math.tau
        index = min(self._samples-1, bisect.bisect_right(self.angles, relative)-1)
        low_phi, high_phi = math.tau*index/self._samples, math.tau*(index+1)/self._samples
        start_angle = math.atan2(*self.point(1., low_phi)[::-1])
        for _ in range(48):
            middle = (low_phi+high_phi)/2
            point = self.point(1., middle)
            angle = math.atan2(point[1], point[0])
            unwrapped = self.angles[index]+(angle-start_angle+math.pi)%math.tau-math.pi
            if unwrapped < relative:
                low_phi = middle
            else:
                high_phi = middle
        return (low_phi+high_phi)/2

    def radius_at_angle(self, radius, angle):
        relative = (angle-self.first_angle) % math.tau
        return _norm(self.point(radius, self._parameter_at_relative_angle(relative)))

    def radius_bounds(self, radius, low_angle, high_angle):
        if high_angle-low_angle >= math.tau:
            return radius*self.min_norm, radius*self.max_norm
        breaks = [low_angle]
        for turn in range(math.floor((low_angle-self.first_angle)/math.tau)+1,
                          math.ceil((high_angle-self.first_angle)/math.tau)):
            split = self.first_angle+turn*math.tau
            if low_angle < split < high_angle:
                breaks.append(split)
        breaks.append(high_angle)
        low_radius, high_radius = math.inf, 0.
        for a, b in zip(breaks, breaks[1:]):
            # A split lies mathematically on a period boundary, but floating
            # subtraction can put it one ulp before the boundary. The segment
            # midpoint is unambiguously in the intended period.
            turn = math.floor(((a+b)/2-self.first_angle)/math.tau)
            a_rel, b_rel = a-self.first_angle-turn*math.tau, b-self.first_angle-turn*math.tau
            left = self._parameter_at_relative_angle(max(0., a_rel))
            right = self._parameter_at_relative_angle(min(math.tau, b_rel))
            coordinates = self._components(left, right)
            distance_from_zero = lambda bounds: max(0., bounds[0], -bounds[1])
            low = math.hypot(*(distance_from_zero(item) for item in coordinates))
            high = math.hypot(*(max(abs(item[0]), abs(item[1])) for item in coordinates))
            low_radius, high_radius = min(low_radius, low), max(high_radius, high)
        margin = 1e-12*max(1., radius)
        return max(0., radius*low_radius-margin), radius*high_radius+margin

    def first_ray_exit(self, radius, point, direction):
        if _norm(point)+1e-9*max(1., radius) >= self.radius_at_angle(radius, math.atan2(point[1], point[0])):
            raise ValueError('传播起点不在目标二维傅里叶曲线内部；请增大曲线间距。')
        length_sq = direction[0]**2+direction[1]**2
        if length_sq < 1e-24:
            raise ValueError('传播射线方向退化。')
        candidates = []
        checked = 0

        def signed(phi):
            x, y = self.point(radius, phi)
            return (x-point[0])*direction[1]-(y-point[1])*direction[0]

        def crossing(low, high, depth):
            nonlocal checked
            checked += 1
            if checked > 20000:
                raise ValueError('二维傅里叶曲线过于复杂，无法认证首次射线交点。')
            xy = self._components(low, high)
            f = _subtract_intervals(_scaled_interval(_subtract_intervals(xy[0], (point[0]/radius, point[0]/radius)), direction[1]),
                                    _scaled_interval(_subtract_intervals(xy[1], (point[1]/radius, point[1]/radius)), direction[0]))
            if f[0] > 1e-13 or f[1] < -1e-13:
                return
            derivatives = self._components(low, high, True)
            df = _subtract_intervals(_scaled_interval(derivatives[0], direction[1]),
                                     _scaled_interval(derivatives[1], direction[0]))
            f_low, f_high = signed(low), signed(high)
            if df[0] > 0 or df[1] < 0:
                if f_low*f_high > 0:
                    return
                a, b, sign_a = low, high, f_low
                for _ in range(52):
                    mid = (a+b)/2
                    if signed(mid)*sign_a > 0:
                        a = mid
                    else:
                        b = mid
                candidate = self.point(radius, (a+b)/2)
                distance = ((candidate[0]-point[0])*direction[0]+(candidate[1]-point[1])*direction[1])/length_sq
                if distance > 1e-9:
                    candidates.append(distance)
                return
            if depth >= 24:
                raise ValueError('二维傅里叶曲线与射线近切，无法认证首次交点。')
            middle = (low+high)/2
            crossing(low, middle, depth+1)
            crossing(middle, high, depth+1)

        for index in range(128):
            crossing(math.tau*index/128, math.tau*(index+1)/128, 0)
        if not candidates:
            raise ValueError('传播射线未与目标二维傅里叶曲线相交。')
        distance = min(candidates)
        return [point[0]+distance*direction[0], point[1]+distance*direction[1]]
