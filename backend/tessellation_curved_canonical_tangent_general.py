"""Read-only fixed In[3833]/[3834]/[3837]–[3839] canonical developables.

The planar maps are derived comparison geometry, not notebook outputs.
"""

import math

C = math.sqrt(3) / 2
S = .5
CASES = (
    'tangent-clipped-3833', 'tangent-both-3834',
    'general-cylinder-3837', 'general-cone-3838',
    'general-tangent-3839',
)


def _case(case):
    if case not in CASES:
        raise ValueError('Only five fixed saved inputs are supported.')


def _tangent(case):
    _case(case)
    return case in (CASES[0], CASES[1], CASES[4])


def _clipped(case):
    _case(case)
    return case in (CASES[0], CASES[4])


def saved_input(case):
    _case(case)
    return {
        'sourceCell': 'In[' + case.split('-')[-1] + ']',
        'sourceFunction': ('CanonicalTangentDevelopableSystem'
                           if case.startswith('tangent-') else
                           'CanonicalDevelopableSystem'),
        'uRange': [0, math.pi],
        'vRange': ([-1, 1] if case == CASES[2] else
                   [0, math.pi] if _tangent(case) else [0, 1]),
        'savedAngleDeg': None if case == CASES[2] else 30,
        'positiveBranchClipped': _clipped(case),
        'scrambledInput': case.startswith('general-'),
        'flatDevelopmentDerivedLocally': True,
        'numericWolframOutAvailable': False,
        'exactStraightCreaseFOLD': False,
        'adoptableCreasePattern': False,
    }


def _u(case, u):
    _case(case)
    if not math.isfinite(u) or not 0 <= u <= math.pi:
        raise ValueError('u outside the saved interval.')


def _v(case, v):
    lo, hi = saved_input(case)['vRange']
    if not math.isfinite(v) or not lo <= v <= hi:
        raise ValueError('v outside the saved interval.')


def _add(a, b, scale=1):
    return tuple(a[i] + scale * b[i] for i in range(3))


def source_director(case, u):
    _u(case, u)
    if _tangent(case):
        return (-C * math.sin(u), C * math.cos(u), S)
    if case == CASES[3]:
        return (C, S * math.sin(u), -S * math.cos(u))
    return (0., 0., 1.)


def seed_directrix(case, u):
    _u(case, u)
    if _tangent(case):
        return (C * math.cos(u), C * math.sin(u), S * u)
    if case == CASES[3]:
        return (0., 0., .5)
    return (math.cos(u), math.sin(u), 0.)


def source_directrix(case, u):
    b, d = seed_directrix(case, u), source_director(case, u)
    return _add(b, d, u) if case.startswith('general-') else b


def source_point(case, u, w):
    if not math.isfinite(w):
        raise ValueError('Ruling parameter must be finite.')
    return _add(source_directrix(case, u), source_director(case, u), w)


def canonical_directrix(case, u):
    b, d = source_directrix(case, u), source_director(case, u)
    return _add(b, d, -u) if case.startswith('general-') else b


def canonical_director(case, u):
    return source_director(case, u)


def developable_point(case, u, w):
    if not math.isfinite(w):
        raise ValueError('Ruling parameter must be finite.')
    return _add(canonical_directrix(case, u), canonical_director(case, u), w)


def cross_curve_point(case, u, v):
    _u(case, u)
    _v(case, v)
    return developable_point(case, u, v - u if _tangent(case) else v)


def saved_plot_point(case, u, v):
    _u(case, u)
    _v(case, v)
    return (canonical_directrix(case, u) if _clipped(case) and v < u
            else cross_curve_point(case, u, v))


def flat_cross_point(case, u, v):
    _u(case, u)
    _v(case, v)
    if _tangent(case):
        return (math.sin(C * u) / C + (v-u) * math.cos(C * u),
                -math.cos(C * u) / C + (v-u) * math.sin(C * u))
    if case == CASES[3]:
        return (v * math.cos(S * u), v * math.sin(S * u))
    return (u, v)


def flat_saved_plot_point(case, u, v):
    _u(case, u)
    _v(case, v)
    if _clipped(case) and v < u:
        return (math.sin(C * u) / C, -math.cos(C * u) / C)
    return flat_cross_point(case, u, v)


def first_form(case, u, v):
    _u(case, u)
    _v(case, v)
    if _tangent(case):
        area = C * abs(v-u)
        return {'E': area*area, 'F': 0., 'G': 1.,
                'area': area, 'regular': area > 0}
    if case == CASES[3]:
        area = S * abs(v)
        return {'E': area*area, 'F': 0., 'G': 1.,
                'area': area, 'regular': v != 0}
    return {'E': 1., 'F': 0., 'G': 1., 'area': 1., 'regular': True}


def plot_v(case, u, t):
    _u(case, u)
    if not math.isfinite(t) or not 0 <= t <= 1:
        raise ValueError('Plot t must be in [0,1].')
    lo, hi = saved_input(case)['vRange']
    return u+t*(math.pi-u) if _clipped(case) else lo+t*(hi-lo)
