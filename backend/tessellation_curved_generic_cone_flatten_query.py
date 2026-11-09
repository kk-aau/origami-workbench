"""Closed-form read-only subdomain of Origamica NFlattenGeneric2D In[3885/3886]."""

import math


FAMILY = 'generic-cone-flatten-in3886'


def validate_generic_cone_flatten_query(data):
    if not isinstance(data, dict) or data.get('family') != FAMILY:
        raise ValueError('Expected the saved In[3886] generic-cone family.')
    if set(data) - {'family', 'angleDeg', 'curveSegments', 'rulingSegments',
                    'rulingEnd'}:
        raise ValueError('Generic-cone query contains unsupported fields.')
    angle = data.get('angleDeg', 30)
    end = data.get('rulingEnd', 1)
    for key, value, low, high in (('angleDeg', angle, 15, 60),
                                  ('rulingEnd', end, .2, 1)):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or \
                not math.isfinite(value) or not low <= value <= high:
            raise ValueError(f'{key} must be a finite number in [{low}, {high}].')
    curves = data.get('curveSegments', 64)
    rulings = data.get('rulingSegments', 8)
    for key, value, low, high in (('curveSegments', curves, 16, 256),
                                  ('rulingSegments', rulings, 2, 16)):
        if type(value) is not int or not low <= value <= high:
            raise ValueError(f'{key} must be an integer in [{low}, {high}].')
    return {'family': FAMILY, 'angleDeg': float(angle), 'curveSegments': curves,
            'rulingSegments': rulings, 'rulingEnd': float(end)}


def source_base(u, angle_deg=30):
    a = math.sin(math.radians(angle_deg))
    c = math.cos(math.radians(angle_deg))
    return (c, -a * math.cos(u), a * math.sin(u))


def source_normal(u, angle_deg=30):
    a = math.sin(math.radians(angle_deg))
    c = math.cos(math.radians(angle_deg))
    return (-a, -c * math.cos(u), c * math.sin(u))


def flat_base(u, angle_deg=30):
    a = math.sin(math.radians(angle_deg))
    return (math.cos(a * u), math.sin(a * u))


def surface(u, v, *, angle_deg=30, space=False):
    if isinstance(u, bool) or not isinstance(u, (int, float)) or \
            not math.isfinite(u) or not 0 <= u <= math.pi:
        raise ValueError('u must lie in [0, pi].')
    if isinstance(v, bool) or not isinstance(v, (int, float)) or \
            not math.isfinite(v) or not -1 <= v <= 1:
        raise ValueError('v must lie in [-1, 1].')
    base = source_base(u, angle_deg) if space else flat_base(u, angle_deg)
    return tuple((1-v)*coordinate for coordinate in base)


def first_fundamental_form(v, angle_deg=30):
    if not math.isfinite(v) or not -1 <= v <= 1:
        raise ValueError('v must lie in [-1, 1].')
    a = math.sin(math.radians(angle_deg))
    return (a*a*(1-v)**2, 0.0, 1.0)


def query_generic_cone_flatten(data):
    query = validate_generic_cone_flatten_query(data)
    angle = query['angleDeg']
    us = [math.pi*i/query['curveSegments']
          for i in range(query['curveSegments']+1)]
    vs = [-1+(query['rulingEnd']+1)*j/query['rulingSegments']
          for j in range(query['rulingSegments']+1)]
    vs[-1] = query['rulingEnd']
    flat = [[list(surface(u, v, angle_deg=angle)) for v in vs] for u in us]
    folded = [[list(surface(u, v, angle_deg=angle, space=True)) for v in vs]
              for u in us]
    a = math.sin(math.radians(angle))
    c = math.cos(math.radians(angle))
    return {
        'family': 'origamica-generic-cone-flatten-pair',
        'query': query,
        'source': {'definitionCell': 'In[3885]', 'savedCell': 'In[3886]',
                   'function': 'NFlattenGeneric2D',
                   'machineReadableWolframOut': False,
                   'sampledSurfaceExactFOLD': False},
        'initial': {'parameter': 0, 'flatBase': [1, 0],
                    'flatTangent': [0, 1], 'orientation': 1,
                    'sourceDirectorIsNegativeBase': True},
        'invariants': {'sinTheta': a, 'cosTheta': c,
                       'planarTurningRate': a, 'geodesicCurvature': 1,
                       'commonMetric': {
                           'E': 'sin(theta)^2 * (1-v)^2', 'F': '0', 'G': '1',
                           'determinant': 'sin(theta)^2 * (1-v)^2'}},
        'certification': {'continuousIsometryAnalytic': True,
                          'bothSurfacesDevelopableAnalytic': True,
                          'regularExactlyForVLessThanOne': True,
                          'apexAtVOneSingular': True,
                          'sampleIncludesApex': query['rulingEnd'] == 1,
                          'sampledSurfaceExactFOLD': False,
                          'adoptableCreasePattern': False,
                          'deploymentPathChecked': False,
                          'selfIntersectionChecked': False},
        'sample': {'parameterValues': us, 'rulingValues': vs,
                   'flatSamples': flat, 'foldedSamples': folded,
                   'flatBaseCurve': [list(flat_base(u, angle)) for u in us],
                   'foldedBaseCurve': [list(source_base(u, angle)) for u in us]},
    }
