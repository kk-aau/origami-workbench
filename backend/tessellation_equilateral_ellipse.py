"""Finite numerical domain of Origamica DiscreteEllipseEquilateral In[458].

The frontend uses damped analytic Newton; this independent backend uses SciPy
on the literal distance equations and the notebook's initial seed. No failed
or unordered root is replaced by a saved vertex table.
"""
import math

import numpy as np
from scipy.optimize import least_squares, root


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('椭圆来源须为有限数值。')
    return float(value)


def read_ellipse_source(value):
    keys = {'kind', 'count', 'semiAxes', 'phaseDeg', 'rotationDeg'}
    if not isinstance(value, dict) or set(value) != keys or value['kind'] != 'equilateral-ellipse':
        raise ValueError('等弦椭圆来源字段无效。')
    count = _number(value['count'])
    axes = value['semiAxes']
    if not isinstance(axes, list) or len(axes) != 2:
        raise ValueError('椭圆须指定长、短两个半轴。')
    a, b = map(_number, axes)
    phase, rotation = _number(value['phaseDeg']), _number(value['rotationDeg'])
    if not count.is_integer() or not 3 <= count <= 48 or not .001 <= min(a, b) <= max(a, b) <= 1000 or max(a, b)/min(a, b) > 4 or max(abs(phase), abs(rotation)) > 360:
        raise ValueError('等弦椭圆超出 3–48 点、正半轴和轴比不超过 4 的数值范围。')
    return {'kind': 'equilateral-ellipse', 'count': int(count), 'semiAxes': [a, b],
            'phaseDeg': phase, 'rotationDeg': rotation}


def solve_equilateral_ellipse(value):
    source = read_ellipse_source(value)
    m = source['count']
    a, b = source['semiAxes']
    ratio = b/a
    phi = math.radians(source['phaseDeg'])

    def points(angles):
        c, s = np.cos(angles), np.sin(angles)
        return np.c_[c, s]/np.sqrt(c*c+s*s/(ratio*ratio))[:, None]

    def equations(variables):
        vertices = points(np.r_[phi, variables[1:]])
        return np.linalg.norm(vertices-np.roll(vertices, -1, axis=0), axis=1)-variables[0]

    seed = np.r_[math.pi*(1+ratio)/m, phi+2*math.pi*np.arange(1, m)/m]
    attempt = root(equations, seed, method='hybr', options={'xtol': 1e-11, 'maxfev': 5000})
    variables = attempt.x
    def valid(candidate):
        return (np.all(np.isfinite(candidate)) and candidate[0] > 1e-10
                and np.min(np.diff(np.r_[phi, candidate[1:], phi+2*math.pi])) > 1e-8
                and np.max(np.abs(equations(candidate))) <= 2e-10)
    if not valid(variables):
        # Independently parameterize the same vertices by eccentric anomaly.
        # Positive softmax angle gaps guarantee one ordered circuit. Its seed
        # is the literal source's uniform *polar* seed converted to anomalies;
        # supplied actual vertices are never used to choose or initialize it.
        polar_seed = np.r_[phi, seed[1:]]
        anomaly_seed = np.unwrap(np.arctan2(np.sin(polar_seed)/ratio, np.cos(polar_seed)))
        origin = anomaly_seed[0]
        gaps_seed = np.diff(np.r_[anomaly_seed, origin+2*math.pi])
        ordered_seed = np.r_[seed[0], np.log(gaps_seed[:-1]/gaps_seed[-1])]

        def ordered_points(candidate):
            weights = np.r_[candidate[1:], 0.]
            weights = np.exp(weights-np.max(weights))
            gaps = 2*math.pi*weights/sum(weights)
            anomalies = origin+np.r_[0., np.cumsum(gaps[:-1])]
            return np.c_[np.cos(anomalies), ratio*np.sin(anomalies)]

        def ordered_equations(candidate):
            vertices = ordered_points(candidate)
            return np.linalg.norm(vertices-np.roll(vertices, -1, axis=0), axis=1)-candidate[0]

        attempt = least_squares(ordered_equations, ordered_seed,
                                bounds=(np.r_[1e-10, np.full(m-1, -25.)],
                                        np.r_[np.inf, np.full(m-1, 25.)]),
                                xtol=1e-13, ftol=1e-13, gtol=1e-13, max_nfev=1000)
        candidate_points = ordered_points(attempt.x)
        polar_angles = phi+np.mod(np.arctan2(candidate_points[:, 1], candidate_points[:, 0])-phi, 2*math.pi)
        variables = np.r_[attempt.x[0], polar_angles[1:]]
    angles = np.r_[phi, variables[1:], phi+2*math.pi]
    if not valid(variables):
        raise ValueError('此椭圆参数未求得按顶点次序闭合的等弦解。')
    vertices = points(angles[:-1])
    edges = np.roll(vertices, -1, axis=0)-vertices
    next_edges = np.roll(edges, -1, axis=0)
    if np.min(edges[:, 0]*next_edges[:, 1]-edges[:, 1]*next_edges[:, 0]) <= 1e-12:
        raise ValueError('等弦解未通过凸性核验。')
    theta = math.radians(source['rotationDeg'])
    matrix = np.array([[math.cos(theta), -math.sin(theta)], [math.sin(theta), math.cos(theta)]])
    vertices = a*vertices@matrix.T
    if np.min(np.linalg.norm(np.roll(vertices, -1, axis=0)-vertices, axis=1)) < 1e-8:
        raise ValueError('等弦解的边长退化。')
    return vertices


def _match(actual, expected):
    actual = np.asarray(actual, dtype=float)
    return (actual.shape == expected.shape and
            np.max(np.linalg.norm(actual-expected, axis=1)) <= 2e-9*float(np.max(np.abs(expected))))


def validate_closed_ellipse_source(value, actual):
    source = read_ellipse_source(value)
    if not _match(actual, solve_equilateral_ellipse(source)):
        raise ValueError('椭圆来源与实际截面点列不符。')
    return source


def validate_joined_ellipse_source(value, bottom, top, double=False):
    allowed = {'ellipse', 'topRotationDeg', 'topShift'} | ({'pleatReduction'} if double else set())
    if not isinstance(value, dict) or set(value) != allowed:
        raise ValueError('连接管椭圆来源字段无效。')
    source = read_ellipse_source(value['ellipse'])
    rotation, shift = _number(value['topRotationDeg']), _number(value['topShift'])
    if abs(rotation) > 360 or not shift.is_integer() or not 0 <= shift < (2 if double else 1)*source['count']:
        raise ValueError('上圈旋转或顶点左移超出范围。')
    generated_bottom = solve_equilateral_ellipse(source)
    generated_top = generated_bottom.copy()
    clean = {'ellipse': source, 'topRotationDeg': rotation, 'topShift': int(shift)}
    if double:
        reduction = _number(value['pleatReduction'])
        if not 0 < reduction < 1:
            raise ValueError('褶皱收缩比须在 0 与 1 之间。')
        # Literal CCW PleatReducePolygon In[466], including its RotateRight.
        generated_top = np.array([q for p, nxt in zip(generated_bottom, np.roll(generated_bottom, -1, axis=0))
                                  for q in (reduction*p, reduction*p+(1+reduction)/2*(nxt-p))])
        generated_top = np.roll(generated_top, 1, axis=0)
        clean['pleatReduction'] = reduction
    theta = math.radians(rotation)
    matrix = np.array([[math.cos(theta), -math.sin(theta)], [math.sin(theta), math.cos(theta)]])
    generated_top = np.roll(generated_top@matrix.T, -int(shift), axis=0)
    if not _match(bottom, generated_bottom) or not _match(top, generated_top):
        raise ValueError('椭圆来源或上圈变换与实际点列不符。')
    return clean
