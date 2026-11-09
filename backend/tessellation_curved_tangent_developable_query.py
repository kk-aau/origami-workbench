"""Closed, bounded read-only query for Origamica In[3913]."""

import math

from tessellation_curved_tangent_developable import (
    first_fundamental_form, flattened_frame, source_frame,
    source_invariants, surface_point)


_FAMILY = 'tangent-developable-in3913'
_FIELDS = frozenset({'family', 'curveSegments', 'rulingSegments', 'rulingEnd'})


def _integer(data, key, default, low, high):
    value = data.get(key, default)
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f'{key} must be an integer in [{low}, {high}].')
    return value


def validate_tangent_developable_query(data):
    if not isinstance(data, dict) or data.get('family') != _FAMILY:
        raise ValueError('Expected the saved tangent-developable family.')
    if set(data) - _FIELDS:
        raise ValueError('Tangent-developable query contains unsupported fields.')
    curves = _integer(data, 'curveSegments', 64, 8, 256)
    rulings = _integer(data, 'rulingSegments', 4, 1, 16)
    width = data.get('rulingEnd', 1.0)
    if isinstance(width, bool) or not isinstance(width, (int, float)):
        raise ValueError('rulingEnd must be a finite number in [0.05, 1].')
    width = float(width)
    if not math.isfinite(width) or not 0.05 <= width <= 1.0:
        raise ValueError('rulingEnd must be a finite number in [0.05, 1].')
    if (curves + 1) * (rulings + 1) > 4096:
        raise ValueError('Tangent-developable sample exceeds 4096 points.')
    return {'family': _FAMILY, 'curveSegments': curves,
            'rulingSegments': rulings, 'rulingEnd': width}


def query_tangent_developable(data):
    query = validate_tangent_developable_query(data)
    parameters = [math.pi * i / query['curveSegments']
                  for i in range(query['curveSegments'] + 1)]
    distances = [query['rulingEnd'] * j / query['rulingSegments']
                 for j in range(query['rulingSegments'] + 1)]
    flat = []
    folded = []
    for u in parameters:
        flat.append([list(surface_point(u, v, space=False)[:2])
                     for v in distances])
        folded.append([list(surface_point(u, v, space=True))
                       for v in distances])
    start_flat = flattened_frame(0)
    start_source = source_frame(0)
    return {
        'family': 'origamica-tangent-developable-pair',
        'query': query,
        'source': {'definitionCell': 'In[3912]', 'savedCell': 'In[3913]',
                   'function': 'ReshapeTandev3D',
                   'machineReadableWolframOut': False},
        'invariants': source_invariants(),
        'initialFrame': {
            'sourceBase': list(start_source['base']),
            'sourceDirector': list(start_source['director']),
            'targetBase': list(start_flat['base']),
            'targetDirector': list(start_flat['director']),
            'targetNormal': [0.0, 0.0, 1.0],
        },
        'certification': {
            'commonFirstFundamentalForm': {
                'E': '1 + 3 v^2 / 4', 'F': '1', 'G': '1',
                'determinant': '3 v^2 / 4'},
            'continuousIsometryAnalytic': True,
            'bothSurfacesDevelopableAnalytic': True,
            'regularForPositiveRulingDistance': True,
            'regressionEdgeSingularAtZero': True,
            'regressionEdgeIsCrease': False,
            'sampledMeshExactIsometry': False,
            'exactStraightCreaseFOLD': False,
            'adoptableCreasePattern': False,
            'deploymentPathChecked': False,
            'selfCollisionChecked': False,
        },
        'sample': {
            'parameterValues': parameters, 'rulingDistances': distances,
            'flatSamples': flat, 'foldedSamples': folded,
            'regressionEdgeRow': 0,
            'flatMetricAtRulingEnd': list(first_fundamental_form(query['rulingEnd'])),
        },
    }
