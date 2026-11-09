"""Fixed diagnostic source equations for In[3812]/[3816]/[3818].

Numeric recovery is a local RK4 replay, not Mathematica interpolation.
"""

import math

PI = math.pi
S = C = math.sqrt(.5)


def saved_input(cell):
    if cell in ('3812', '3816'):
        return {'sourceCell': f'In[{cell}]',
                'sourceFunction': ('RecoverDarboux3D' if cell == '3812'
                                   else 'NRecoverDarboux3D'),
                'products': (1, 1, 0, 0), 'uRange': (0, PI),
                'frameAt': PI/2, 'frameLength': .5,
                'numericInterpolationReproduced': False,
                'wolframNumericOutAvailable': False,
                'exactFOLD': False}
    if cell == '3818':
        return {'sourceCell': 'In[3818]',
                'sourceFunction': 'RuledSurfaceNormal',
                'thetaDeg': 45, 'uRange': (-PI/2, 1.4*PI),
                'vRange': (-1, 1), 'orientations': (1, -1),
                'curveDivisions': 200, 'normalVectors': 11,
                'wolframNumericOutAvailable': False, 'exactFOLD': False}
    raise ValueError('Only three fixed source diagnostics are supported.')


def _u(u, lo=0, hi=PI):
    if not math.isfinite(u) or not lo <= u <= hi:
        raise ValueError('u outside saved interval.')


def _v(v):
    if not math.isfinite(v) or not -1 <= v <= 1:
        raise ValueError('v outside saved interval.')


def analytic_darboux(u):
    _u(u)
    return {'u': u, 'c': (math.sin(u), 0, 1-math.cos(u)),
            't': (math.cos(u), 0, math.sin(u)),
            'l': (0, 1, 0), 'n': (-math.sin(u), 0, math.cos(u))}


def _derivative(a):
    return (a[3], a[4], a[5], a[9], a[10], a[11], 0, 0, 0,
            -a[3], -a[4], -a[5])


def _rk4(a, h):
    k1 = _derivative(a)
    k2 = _derivative([x+h*k1[i]/2 for i, x in enumerate(a)])
    k3 = _derivative([x+h*k2[i]/2 for i, x in enumerate(a)])
    k4 = _derivative([x+h*k3[i] for i, x in enumerate(a)])
    return [x+h*(k1[i]+2*k2[i]+2*k3[i]+k4[i])/6
            for i, x in enumerate(a)]


def numeric_darboux(u, steps=512):
    _u(u)
    if not isinstance(steps, int) or not 16 <= steps <= 4096:
        raise ValueError('RK4 steps outside bounded range.')
    a = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]
    h = u/steps
    for _ in range(steps):
        a = _rk4(a, h)
    return {'u': u, 'c': tuple(a[:3]), 't': tuple(a[3:6]),
            'l': tuple(a[6:9]), 'n': tuple(a[9:12])}


def hyperboloid_base(u):
    _u(u, -PI/2, 1.4*PI)
    return (math.cos(u), math.sin(u), 0)


def hyperboloid_director(u):
    _u(u, -PI/2, 1.4*PI)
    return (-S*math.sin(u), S*math.cos(u), C)


def hyperboloid_point(u, v):
    _v(v)
    b, d = hyperboloid_base(u), hyperboloid_director(u)
    return tuple(b[i]+v*d[i] for i in range(3))


def hyperboloid_partials(u, v):
    _u(u, -PI/2, 1.4*PI)
    _v(v)
    return ((-math.sin(u)-v*S*math.cos(u),
             math.cos(u)-v*S*math.sin(u), 0),
            hyperboloid_director(u))


def hyperboloid_normal(u, v, sigma):
    _u(u, -PI/2, 1.4*PI)
    _v(v)
    if sigma not in (-1, 1):
        raise ValueError('Source has only ±1 orientations.')
    er = (math.cos(u), math.sin(u), 0)
    ephi = (-math.sin(u), math.cos(u), 0)
    raw = (C*er[0]+v*S*C*ephi[0],
           C*er[1]+v*S*C*ephi[1], -v*S*S)
    size = math.sqrt(sum(x*x for x in raw))
    return tuple(sigma*x/size for x in raw)


def hyperboloid_area(u, v):
    _u(u, -PI/2, 1.4*PI)
    _v(v)
    return math.hypot(C, v*S)


def sinusoid_saved_input():
    return {'sourceCell': 'In[3795]', 'sourceFunction': 'Darboux3DSystem',
            'surfaceXRange': (-1, .5), 'surfaceYRange': (-1, 1),
            'curveRange': (-1, 1), 'frameAt': .5, 'vectorLength': .3,
            'surfaceOrientation': 1, 'numericWolframOutAvailable': False,
            'exactFOLD': False, 'adoptablePaper': False}


def _sinusoid_parameter(t):
    if not math.isfinite(t) or not -1 <= t <= 1:
        raise ValueError('In[3795] curve parameter outside [-1,1].')


def sinusoid_surface(x, y):
    if (not math.isfinite(x) or not -1 <= x <= .5 or
            not math.isfinite(y) or not -1 <= y <= 1):
        raise ValueError('In[3795] surface parameter outside saved patch.')
    return (x, y, 1-math.cos(y))


def sinusoid_curve(t):
    _sinusoid_parameter(t)
    return (math.cos(t)-1, t, 1-math.cos(t))


def sinusoid_frame(t):
    _sinusoid_parameter(t)
    sin, cos = math.sin(t), math.cos(t)
    p, q = math.sqrt(1+2*sin*sin), math.sqrt(1+sin*sin)
    tangent = (-sin/p, 1/p, sin/p)
    normal = (-1/(math.sqrt(2)*p), -math.sqrt(2)*sin/p,
              1/(math.sqrt(2)*p))
    binormal = (math.sqrt(.5), 0, math.sqrt(.5))
    surface_normal = (0, -sin/q, 1/q)
    tangent_normal = (-q/p, -sin/(p*q), -sin*sin/(p*q))
    return {'t': t, 'point': sinusoid_curve(t), 'speed': p,
            'tangent': tangent, 'normal': normal, 'binormal': binormal,
            'tangentNormal': tangent_normal, 'surfaceNormal': surface_normal,
            'curvature': math.sqrt(2)*cos/p**3, 'torsion': 0,
            'geodesicCurvature': cos/(p**3*q),
            'normalCurvature': cos/(p*p*q),
            'geodesicTorsion': -cos*sin/(p*p*q*q)}
