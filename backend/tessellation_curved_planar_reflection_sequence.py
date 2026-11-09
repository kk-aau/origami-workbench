"""Fixed Origamica In[4039]/In[4040]/In[4043] planar mirror sequences.

All surfaces here are continuous reflected ruled patches. Display sampling
does not create straight-crease faces, an editable FOLD, or a motion path.
"""

import math


THETA = math.pi / 6
TILT = math.pi / 18
SQRT2 = math.sqrt(2)
CASES = ('cone-symbolic', 'cylinder-symbolic', 'cone-numeric-input')


def _dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def _add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def _sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def _scale(a, factor):
    return tuple(factor * x for x in a)


def _reflect_point(x, plane):
    p, normal = plane
    return _sub(x, _scale(normal, 2 * _dot(_sub(x, p), normal)))


def _reflect_vector(x, plane):
    normal = plane[1]
    return _sub(x, _scale(normal, 2 * _dot(x, normal)))


def _cone(case):
    return case in ('cone-symbolic', 'cone-numeric-input')


def _check_case(case):
    if case not in CASES:
        raise ValueError('Only the three fixed saved sequence inputs are supported.')


def saved_sequence_input(case):
    _check_case(case)
    cone = _cone(case)
    return {
        'case': case,
        'sourceCells': (['In[4038]', 'In[4039]'] if case == 'cone-symbolic'
                        else ['In[4038]', 'In[4040]'] if not cone
                        else ['In[4042]', 'In[4043]']),
        'sourceSurface': 'z-axis cone' if cone else 'unit half-cylinder',
        'composeReflections': cone,
        'uRange': [0, math.pi] if cone else [-math.pi / 4, math.pi / 4],
        'outerRuling': 4 / math.cos(THETA) if cone else 3,
        'planes': [
            {'point': list(p), 'normal': list(n)} for p, n in _planes(case)
        ],
        'curveCount': 5 if cone else 4,
        'patchCount': 4 if cone else 3,
        'continuousLocalIsometryVerified': True,
        'regularAtApex': False if cone else True,
        'numericInterpolationReproduced': False,
        'exactStraightCreaseFOLD': False,
        'adoptableCreasePattern': False,
        'mountainValleyVerified': False,
        'layerOrderVerified': False,
        'motionVerified': False,
        'selfCollisionVerified': False,
    }


def _planes(case):
    _check_case(case)
    if _cone(case):
        s, c = math.sin(TILT), math.cos(TILT)
        return (
            ((0, 0, 1), (0, 0, 1)),
            ((0, 0, 2), (0, -s, c)),  # RotationXMatrix3D[+10°] . zhat
            ((0, 0, 3), (s, 0, c)),   # RotationYMatrix3D[+10°] . zhat
            ((0, 0, 4), (0, 0, 1)),
        )
    n = (-1 / SQRT2, 0, 1 / SQRT2)
    return (((1, 0, 1), n), ((2, 0, 1), n))


def _source(case, u, v):
    if _cone(case):
        return (v * math.sin(THETA) * math.cos(u),
                v * math.sin(THETA) * math.sin(u), v * math.cos(THETA))
    return (math.cos(u), math.sin(u), v)


def _director(case, u):
    if _cone(case):
        return (math.sin(THETA) * math.cos(u),
                math.sin(THETA) * math.sin(u), math.cos(THETA))
    return (0, 0, 1)


def _parameter(case, u):
    _check_case(case)
    lo, hi = saved_sequence_input(case)['uRange']
    if not math.isfinite(u) or not lo <= u <= hi:
        raise ValueError('The parameter lies outside the saved interval.')


def stage_surface(case, u, v, stage):
    """Original or stage-1... stage-n reflected surface at the same (u,v)."""
    _parameter(case, u)
    planes = _planes(case)
    if not isinstance(stage, int) or not 0 <= stage <= len(planes) or not math.isfinite(v):
        raise ValueError('Invalid stage or ruling parameter.')
    x = _source(case, u, v)
    # True: later mirror planes are carried by prior reflections, yielding
    # R1∘R2∘...∘Ri on the original surface. False: R_i∘...∘R2∘R1.
    indices = range(stage - 1, -1, -1) if _cone(case) else range(stage)
    for index in indices:
        x = _reflect_point(x, planes[index])
    return x


def stage_director(case, u, stage):
    _parameter(case, u)
    planes = _planes(case)
    if not isinstance(stage, int) or not 0 <= stage <= len(planes):
        raise ValueError('Invalid stage.')
    d = _director(case, u)
    indices = range(stage - 1, -1, -1) if _cone(case) else range(stage)
    for index in indices:
        d = _reflect_vector(d, planes[index])
    return d


def cut_distances(case, u):
    """Original ruling parameter values of the original and final boundaries."""
    _parameter(case, u)
    distances = [0.0]
    for index, (p, normal) in enumerate(_planes(case)):
        if _cone(case):
            base, director = _source(case, u, 0), _director(case, u)
        else:
            base = stage_surface(case, u, 0, index)
            director = stage_director(case, u, index)
        denominator = _dot(director, normal)
        if abs(denominator) < 1e-12:
            raise ValueError('The ruling is parallel to a saved mirror plane.')
        distances.append(_dot(_sub(p, base), normal) / denominator)
    if not _cone(case):
        distances.append(3.0)
    outer = 4 / math.cos(THETA) if _cone(case) else 3.0
    if not all(a + 1e-10 < b for a, b in zip(distances, distances[1:])):
        raise ValueError('The saved mirror cuts are not ordered.')
    if abs(distances[-1] - outer) > 1e-10:
        raise ValueError('The final boundary differs from the saved outer ruling.')
    return distances


def saved_curve(case, u, index):
    """One member of the notebook's cclist; cylinder includes its clast."""
    distances = cut_distances(case, u)
    if not isinstance(index, int) or not 0 <= index < len(distances):
        raise ValueError('Invalid saved curve index.')
    stage = max(index - 1, 0)
    return stage_surface(case, u, distances[index], stage)


def flat_point(case, u, v):
    _parameter(case, u)
    if not math.isfinite(v):
        raise ValueError('Invalid ruling parameter.')
    if _cone(case):
        phi = u * math.sin(THETA)
        return (v * math.cos(phi), v * math.sin(phi))
    return (v, u)


def metric(case, v):
    _check_case(case)
    if not math.isfinite(v):
        raise ValueError('Invalid ruling parameter.')
    return {'E': v * v * math.sin(THETA)**2 if _cone(case) else 1.0,
            'F': 0.0, 'G': 1.0, 'regular': v > 0 if _cone(case) else True}
