"""Bounded, read-only preview of Origamica In[3855]/In[3859].

This is one smooth developable ribbon, not a crease pattern. The paired
samples are observations of an analytically isometric surface and must not
be exported as an exact straight-crease FOLD mesh.
"""

import math

from tessellation_curved_helix_ribbon_pair import certify_helix_ribbon_pair


_FIELDS = frozenset({
    'radius', 'pitch', 'etaPi', 'orientation', 'parameterStartPi',
    'parameterEndPi', 'halfWidth', 'curveSegments', 'rulingSegments',
})


def _number(data, key, default, low, high):
    value = data.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{key} must be a finite number in [{low}, {high}].')
    value = float(value)
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f'{key} must be a finite number in [{low}, {high}].')
    return value


def _integer(data, key, default, low, high):
    value = data.get(key, default)
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f'{key} must be an integer in [{low}, {high}].')
    return value


def validate_curved_ribbon_pair_query(data):
    if not isinstance(data, dict) or set(data) - _FIELDS:
        raise ValueError('Ribbon-pair query must be a JSON object with supported fields.')
    query = {
        'radius': _number(data, 'radius', 1, .25, 4),
        'pitch': _number(data, 'pitch', .5, .05, 2),
        'etaPi': _number(data, 'etaPi', .35, .05, .45),
        'orientation': _integer(data, 'orientation', 1, -1, 1),
        'parameterStartPi': _number(data, 'parameterStartPi', 0, -2, 2),
        'parameterEndPi': _number(data, 'parameterEndPi', 1, -2, 2),
        'halfWidth': _number(data, 'halfWidth', .5, .05, 2),
        'curveSegments': _integer(data, 'curveSegments', 200, 16, 256),
        'rulingSegments': _integer(data, 'rulingSegments', 20, 2, 20),
    }
    if query['orientation'] not in (-1, 1):
        raise ValueError('orientation must be +1 or -1.')
    if query['rulingSegments'] % 2:
        raise ValueError('rulingSegments must be even so the base row is retained.')
    span = query['parameterEndPi'] - query['parameterStartPi']
    if not 1e-6 < span <= 1:
        raise ValueError('The parameter interval must be in (0, pi].')
    if (query['curveSegments'] + 1) * (query['rulingSegments'] + 1) > 5000:
        raise ValueError('Ribbon sample exceeds 5000 paired points.')
    certify_helix_ribbon_pair(
        radius=query['radius'], pitch=query['pitch'],
        eta=math.pi * query['etaPi'], orientation=query['orientation'],
        start=math.pi * query['parameterStartPi'],
        end=math.pi * query['parameterEndPi'],
        half_width=query['halfWidth'],
    )
    return query


def query_curved_ribbon_pair(data):
    query = validate_curved_ribbon_pair_query(data)
    ribbon = certify_helix_ribbon_pair(
        radius=query['radius'], pitch=query['pitch'],
        eta=math.pi * query['etaPi'], orientation=query['orientation'],
        start=math.pi * query['parameterStartPi'],
        end=math.pi * query['parameterEndPi'],
        half_width=query['halfWidth'],
    )
    sampled = ribbon.sample(query['curveSegments'], query['rulingSegments'])
    return {
        'family': 'origamica-helix-ribbon-pair',
        'query': query,
        'source': {
            'symbolicCell': 'In[3855]', 'numericalCell': 'In[3859]',
            'symbolicFunction': 'RibbonPair', 'numericalFunction': 'NRibbonPair',
            'machineReadableWolframOut': False,
        },
        'certification': {
            'continuousIsometryAnalytic': True,
            'surfaceDevelopableAnalytic': True,
            'rulingWidthBeforeFocalSet': True,
            'sampledChordsExactIsometry': False,
            'exactStraightCreaseFOLD': False,
            'adoptableCreasePattern': False,
            'deploymentPathChecked': False,
            'selfCollisionChecked': False,
        },
        'sample': {
            'parameters': sampled['parameters'],
            'flatSamples': sampled['flat'],
            'spaceSamples': sampled['space'],
            'baseIndices': sampled['base_indices'],
            'focalDistance': sampled['focal_distance'],
        },
    }
