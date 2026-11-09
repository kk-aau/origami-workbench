"""Fixed, read-only continuous geometry for Origamica In[3793/3794/3796/3797]."""
import math

CELLS = ('3793', '3794', '3796', '3797')
A, B = math.sqrt(3)/2, .5


def dot(x, y):
    return sum(a*b for a, b in zip(x, y))


def cross(x, y):
    return (x[1]*y[2]-x[2]*y[1], x[2]*y[0]-x[0]*y[2],
            x[0]*y[1]-x[1]*y[0])


def norm(x):
    return math.sqrt(dot(x, x))


def scale(x, s):
    return tuple(s*v for v in x)


def sub(x, y):
    return tuple(a-b for a, b in zip(x, y))


def _check(cell, t):
    if cell not in CELLS:
        raise ValueError('Only four fixed source diagnostics are supported.')
    end = math.pi/2 if cell == '3794' else .3
    if not math.isfinite(t) or not -end <= t <= end:
        raise ValueError('Curve parameter outside saved plot interval.')


def saved_input(cell):
    _check(cell, 0)
    return {'sourceCell': f'In[{cell}]', 'sourceFunction': 'Darboux3DSystem',
            'curveRange': (-math.pi/2, math.pi/2) if cell == '3794' else (-.3, .3),
            'sourceFrameAt': .15 if cell == '3793' else None,
            'sourceVectorLength': .1 if cell == '3793' else None,
            'plotAngleDeg': None if cell == '3794' else 30,
            'plotK1': 2 if cell == '3793' else None if cell == '3794' else 1,
            'plotK2': 6 if cell == '3793' else None if cell == '3794' else 2,
            'printedAt': .15 if cell == '3793' else None if cell == '3794' else 0,
            'printedBeforeNumericPlotAssignments': cell in ('3796', '3797'),
            'wolframNumericOutAvailable': False, 'exactFOLD': False,
            'adoptablePaper': False}


def surface(cell, x, y, side=1):
    _check(cell, 0)
    if not math.isfinite(x) or not math.isfinite(y):
        raise ValueError('Surface parameters must be finite.')
    if cell == '3794':
        if side not in (1, 2):
            raise ValueError('Only the two source cylinders are supported.')
        low = -1 if side == 1 else -.5
        if not low <= x <= 1.5 or not -math.pi/2 <= y <= math.pi/2:
            raise ValueError('Cylinder parameters outside saved patch.')
        return (x, math.sin(y), 1-math.cos(y)) if side == 1 else (
            1-math.cos(y), math.sin(y), x)
    if not -.3 <= x <= .3 or not -.3 <= y <= .3:
        raise ValueError('Paraboloid parameters outside saved patch.')
    kx, ky = (2, 6) if cell == '3793' else (1, 2)
    return (x, y, (kx*x*x+ky*y*y)/2)


def _parameter(cell, t):
    bent = cell == '3797'
    return (A*t-(B*t*t if bent else 0), B*t+(A*t*t if bent else 0),
            A-(2*B*t if bent else 0), B+(2*A*t if bent else 0),
            -2*B if bent else 0, 2*A if bent else 0)


def curve(cell, t):
    _check(cell, t)
    if cell == '3794':
        return (1-math.cos(t), math.sin(t), 1-math.cos(t))
    x, y, *_ = _parameter(cell, t)
    kx, ky = (2, 6) if cell == '3793' else (1, 2)
    return (x, y, (kx*x*x+ky*y*y)/2)


def frame(cell, t):
    _check(cell, t)
    if cell == '3794':
        s, c = math.sin(t), math.cos(t)
        point, first = (1-c, s, 1-c), (s, c, s)
        second, third = (c, -s, c), (-s, -c, -s)
        normal_raw, normal_raw_prime = (0, -s, c), (0, -c, -s)
    else:
        x, y, dx, dy, ddx, ddy = _parameter(cell, t)
        kx, ky = (2, 6) if cell == '3793' else (1, 2)
        point = (x, y, (kx*x*x+ky*y*y)/2)
        first = (dx, dy, kx*x*dx+ky*y*dy)
        second = (ddx, ddy, kx*(dx*dx+x*ddx)+ky*(dy*dy+y*ddy))
        third = (0, 0, 3*(kx*dx*ddx+ky*dy*ddy))
        normal_raw, normal_raw_prime = (-kx*x, -ky*y, 1), (-kx*dx, -ky*dy, 0)
    speed = norm(first)
    tangent = scale(first, 1/speed)
    tangent_prime = scale(sub(second, scale(tangent, dot(tangent, second))), 1/speed)
    turn = norm(tangent_prime)
    frenet_normal = scale(tangent_prime, 1/turn)
    binormal = cross(tangent, frenet_normal)
    area = norm(normal_raw)
    up = scale(normal_raw, 1/area)
    up_prime = scale(sub(normal_raw_prime, scale(up, dot(up, normal_raw_prime))), 1/area)
    lateral = cross(up, tangent)
    cross12 = cross(first, second)
    return {'t': t, 'point': point, 'first': first, 'second': second,
            'third': third, 'speed': speed, 'tangent': tangent,
            'frenetNormal': frenet_normal, 'binormal': binormal,
            'surfaceNormal': up, 'tangentNormal': lateral,
            'curvature': turn/speed,
            'torsion': dot(cross12, third)/dot(cross12, cross12),
            'geodesicCurvature': dot(lateral, tangent_prime)/speed,
            'normalCurvature': dot(up, tangent_prime)/speed,
            'geodesicTorsion': -dot(lateral, up_prime)/speed,
            'surfaceArea': area}


def intersection_tangency(t):
    _check('3794', t)
    s, c = math.sin(t), math.cos(t)
    return {'point': curve('3794', t), 'surface1Normal': (0, -s, c),
            'surface2Normal': (-c, s, 0),
            'normalCrossMagnitude': abs(c)*math.sqrt(1+s*s)}
