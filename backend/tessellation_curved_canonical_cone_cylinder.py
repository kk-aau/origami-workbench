"""Fixed read-only In[3826]/In[3830] canonical cylinder/cone systems.

The planar developments are independently derived local comparisons, not
outputs of the notebook's Canonical...DevelopableSystem routines.
"""

import math

THETA = math.pi / 6
CASES = ('cylinder-in3826', 'cone-in3830')


def _cone(case):
    if case not in CASES:
        raise ValueError('Only the two fixed saved canonical inputs are supported.')
    return case == 'cone-in3830'


def saved_input(case):
    cone = _cone(case)
    return {
        'sourceCell': 'In[3830]' if cone else 'In[3826]',
        'sourceFunction': ('CanonicalConeDevelopableSystem' if cone else
                           'CanonicalCylinderDevelopableSystem'),
        'uRange': [0, math.pi] if cone else [-math.pi / 4, 3 * math.pi / 4],
        'displayedRulingRange': [0, 1],
        'sourceDirectorLength': 2,
        'sourceConeAngleDeg': 30 if cone else None,
        'crossCurveAliasesSurface': True,
        'flatDevelopmentDerivedLocally': True,
        'regularAtFirstRuling': not cone,
        'numericWolframOutAvailable': False,
        'exactStraightCreaseFOLD': False,
        'adoptableCreasePattern': False,
        'motionVerified': False,
        'selfCollisionVerified': False,
    }


def _check_u(case, u):
    lo, hi = saved_input(case)['uRange']
    if not math.isfinite(u) or not lo <= u <= hi:
        raise ValueError('u outside the saved interval.')


def _check_v(v):
    if not math.isfinite(v):
        raise ValueError('Ruling parameter must be finite.')


def raw_directrix(case, u):
    _check_u(case, u)
    return (0., 0., .5) if _cone(case) else (math.cos(u), math.sin(u), 2 * u)


def raw_director(case, u):
    _check_u(case, u)
    if _cone(case):
        return (2 * math.cos(THETA), 2 * math.sin(THETA) * math.sin(u),
                -2 * math.sin(THETA) * math.cos(u))
    return (0., 0., 2.)


def raw_point(case, u, lam):
    _check_v(lam)
    b, d = raw_directrix(case, u), raw_director(case, u)
    return tuple(b[i] + lam * d[i] for i in range(3))


def canonical_director(case, u):
    d = raw_director(case, u)
    norm = math.sqrt(sum(value * value for value in d))
    return tuple(value / norm for value in d)


def canonical_directrix(case, u):
    b, d = raw_directrix(case, u), canonical_director(case, u)
    if _cone(case):
        return b
    projection = sum(b[i] * d[i] for i in range(3))
    return tuple(b[i] - projection * d[i] for i in range(3))


def canonical_point(case, u, v):
    _check_v(v)
    b, d = canonical_directrix(case, u), canonical_director(case, u)
    return tuple(b[i] + v * d[i] for i in range(3))


cross_curve_point = canonical_point


def derived_flat_point(case, u, v):
    _check_u(case, u)
    _check_v(v)
    if _cone(case):
        return (v * math.cos(math.sin(THETA) * u),
                v * math.sin(math.sin(THETA) * u))
    return (u, v)


def first_form(case, v):
    _check_v(v)
    if _cone(case):
        return {'E': v * v * math.sin(THETA)**2, 'F': 0., 'G': 1.,
                'area': abs(v * math.sin(THETA)), 'regular': v > 0}
    return {'E': 1., 'F': 0., 'G': 1., 'area': 1., 'regular': True}


# Adjustable numeric functions accepted by the original canonical prototypes.
INPUT_PRESETS = {
    'cylinder-in3826': {'kind': 'cylinder-in3826', 'radius': 1., 'axialPitch': 2.,
                        'directorLength': 2., 'rulingStart': 0., 'rulingEnd': 1.,
                        'segments': 72, 'rulingSteps': 8},
    'cone-in3830': {'kind': 'cone-in3830', 'angleDeg': 30., 'apexZ': .5,
                    'directorLength': 2., 'rulingStart': 0., 'rulingEnd': 1.,
                    'segments': 72, 'rulingSteps': 8},
}


def validate_input_query(value):
    if not isinstance(value, dict) or value.get('kind') not in CASES:
        raise ValueError('Select a canonical cylinder or cone input family.')
    kind = value['kind']
    if set(value) != set(INPUT_PRESETS[kind]):
        raise ValueError('Input query must have complete family-specific keys.')
    bounds = {'directorLength': (.1, 6), 'rulingStart': (0, 2),
              'rulingEnd': (.2, 3), 'segments': (16, 192), 'rulingSteps': (2, 16)}
    bounds.update({'radius': (.1, 3), 'axialPitch': (-4, 4)}
                  if kind == CASES[0] else {'angleDeg': (15, 75), 'apexZ': (-3, 3)})
    q = dict(value)
    for key, (low, high) in bounds.items():
        x = q[key]
        if (isinstance(x, bool) or not isinstance(x, (int, float))
                or not math.isfinite(x) or not low <= x <= high):
            raise ValueError(f'{key} outside the bounded input domain.')
        if key in ('segments', 'rulingSteps'):
            if int(x) != x:
                raise ValueError('Sampling divisions must be integral.')
            q[key] = int(x)
    if q['rulingEnd']-q['rulingStart'] < .05-1e-12:
        raise ValueError('Ruling interval must have width at least .05.')
    return q


def _input_coordinates(q, u, v):
    if q['kind'] == CASES[0]:
        raw_b = (q['radius']*math.cos(u), q['radius']*math.sin(u), q['axialPitch']*u)
        raw_d = (0., 0., q['directorLength'])
    else:
        theta, length = q['angleDeg']*math.pi/180, q['directorLength']
        raw_b = (0., 0., q['apexZ'])
        raw_d = (length*math.cos(theta), length*math.sin(theta)*math.sin(u),
                 -length*math.sin(theta)*math.cos(u))
    # Evaluate the actual original vector operations, not a hard-coded target.
    norm = math.sqrt(sum(x*x for x in raw_d))
    unit = tuple(x/norm for x in raw_d)
    base = raw_b
    if q['kind'] == CASES[0]:
        parallel = sum(b*d for b, d in zip(base, unit))
        base = tuple(b-parallel*d for b, d in zip(base, unit))
    space = tuple(b+v*d for b, d in zip(base, unit))
    if q['kind'] == CASES[0]:
        flat = (q['radius']*u, v)
    else:
        phi = math.sin(q['angleDeg']*math.pi/180)*u
        flat = (v*math.cos(phi), v*math.sin(phi))
    return {'rawBase': raw_b, 'rawTip': tuple(b+d for b, d in zip(raw_b, raw_d)),
            'space': space, 'flat': flat, 'canonicalDirectrix': base,
            'canonicalDirector': unit}


def evaluate_input_query(value):
    q = validate_input_query(value)
    cone = q['kind'] == CASES[1]
    lo, hi = (0., math.pi) if cone else (-math.pi/4, 3*math.pi/4)
    u_values = [hi if i == q['segments'] else lo+(hi-lo)*i/q['segments']
                for i in range(q['segments']+1)]
    v_values = [q['rulingEnd'] if i == q['rulingSteps'] else
                q['rulingStart']+(q['rulingEnd']-q['rulingStart'])*i/q['rulingSteps']
                for i in range(q['rulingSteps']+1)]
    coordinates = [_input_coordinates(q, u, q['rulingStart']) for u in u_values]
    regular = not cone or q['rulingStart'] > 0
    shape_keys = set(q)-{'segments', 'rulingSteps'}
    saved = all(q[key] == INPUT_PRESETS[q['kind']][key] for key in shape_keys)
    return {
        'family': 'origamica-canonical-parameterized', 'query': q,
        'source': {'referenceCell': 'In[3830]' if cone else 'In[3826]',
                   'definitionCell': 'In[3829]' if cone else 'In[3825]',
                   'function': ('CanonicalConeDevelopableSystem' if cone else
                                'CanonicalCylinderDevelopableSystem'),
                   'matchesSavedInput': saved, 'flatDevelopmentDerivedLocally': True,
                   'wolframNumericOut': False},
        'certification': {
            'unitDirectorAnalytic': True, 'cylinderProjectionAnalytic': not cone,
            'continuousIsometryAnalytic': True, 'developableAnalytic': True,
            'completeFiniteDomain': True, 'regularClosedDomain': regular,
            'minimumJacobian': (q['rulingStart']*math.sin(q['angleDeg']*math.pi/180)
                                if cone else q['radius']),
            'includesSingularApex': cone and q['rulingStart'] == 0,
            'globalInjectiveRegularDomain': True, 'globalInjectiveClosedDomain': regular,
            'sameFinitePatchAsRawInput': (q['rulingStart'] == 0
                                          and q['rulingEnd'] == q['directorLength']
                                          and (cone or q['axialPitch'] == 0)),
            'paperThickness': 0,
            'sampledMeshExactFOLD': False, 'adoptableCreasePattern': False,
            'deploymentPathChecked': False},
        'uValues': u_values, 'vValues': v_values,
        'rawBase': [c['rawBase'] for c in coordinates],
        'rawTip': [c['rawTip'] for c in coordinates],
        'canonicalBase': [c['space'] for c in coordinates],
        'canonicalTip': [_input_coordinates(q, u, q['rulingEnd'])['space'] for u in u_values],
        'canonicalGrid': [[_input_coordinates(q, u, v)['space'] for u in u_values]
                          for v in v_values],
        'flatGrid': [[_input_coordinates(q, u, v)['flat'] for u in u_values]
                     for v in v_values],
    }
