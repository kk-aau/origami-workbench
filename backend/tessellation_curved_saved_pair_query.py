"""Bounded JSON preview for two saved Origamica section-45 analytic pairs.

Only numeric parameters are accepted. The returned rows are samples of smooth
surfaces, not exact straight-crease FOLD geometry or an adoptable pattern.
"""

import math

from tessellation_curved_across_right_cone import certify_cone_across_right
from tessellation_curved_fold_from_planar_circle import fold_curved_circle_3d


FAMILIES = ('cone-across-right', 'planar-circle-to-curved-fold-3d')
_COMMON = frozenset({'family', 'leftWidth', 'rightWidth',
                     'curveSegments', 'rulingSegments'})
_CONE = frozenset({'thetaDeg', 'parameterStartPi', 'parameterEndPi'})
_CIRCLE = frozenset({'orientation'})


def _number(data, name, default, low, high):
    value = data.get(name, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{name} must be a finite number in [{low}, {high}].')
    value = float(value)
    if not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f'{name} must be a finite number in [{low}, {high}].')
    return value


def _integer(data, name, default, low, high):
    value = data.get(name, default)
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f'{name} must be an integer in [{low}, {high}].')
    return value


def validate_curved_saved_pair_query(data):
    if not isinstance(data, dict):
        raise ValueError('Curved saved-pair query must be a JSON object.')
    family = data.get('family')
    if family not in FAMILIES:
        raise ValueError('Unsupported saved curved-fold family.')
    allowed = _COMMON | (_CONE if family == FAMILIES[0] else _CIRCLE)
    if set(data) - allowed:
        raise ValueError('Saved curved-fold query contains unsupported fields.')
    curve_segments = _integer(data, 'curveSegments', 64, 16, 256)
    ruling_segments = _integer(data, 'rulingSegments', 4, 1, 8)
    if (curve_segments + 1) * (2 * ruling_segments + 1) > 4000:
        raise ValueError('Saved curved-fold sample exceeds 4000 points.')
    query = {'family': family, 'curveSegments': curve_segments,
             'rulingSegments': ruling_segments}
    if family == FAMILIES[0]:
        query.update({
            'thetaDeg': _number(data, 'thetaDeg', 30, 5, 85),
            'parameterStartPi': _number(data, 'parameterStartPi', -.5, -2, 2),
            'parameterEndPi': _number(data, 'parameterEndPi', .5, -2, 2),
            'leftWidth': _number(data, 'leftWidth', .75, .05, .95),
            'rightWidth': _number(data, 'rightWidth', .75, .05, 4),
        })
        span = query['parameterEndPi'] - query['parameterStartPi']
        if not 1e-6 < span <= 1:
            raise ValueError('Cone parameter interval must be in (0, pi].')
    else:
        query.update({
            'orientation': _integer(data, 'orientation', 1, -1, 1),
            'leftWidth': _number(data, 'leftWidth', 1, .05, 1.8),
            'rightWidth': _number(data, 'rightWidth', 1, .05, 1.8),
        })
        if query['orientation'] not in (-1, 1):
            raise ValueError('orientation must be +1 or -1.')
    return query


def query_curved_saved_pair(data):
    query = validate_curved_saved_pair_query(data)
    if query['family'] == FAMILIES[0]:
        fold = certify_cone_across_right(
            theta_deg=query['thetaDeg'],
            parameter_start=math.pi * query['parameterStartPi'],
            parameter_end=math.pi * query['parameterEndPi'],
            left_width=query['leftWidth'], right_width=query['rightWidth'])
        source = {'symbolicCell': 'In[3999]', 'numericalCell': 'In[4002]',
                  'symbolicFunction': 'FoldAcrossRightBoth',
                  'numericalFunction': 'NFoldAcrossRightBoth'}
        fold_angle = fold.fold_angle_deg
    else:
        fold = fold_curved_circle_3d(
            orientation=query['orientation'],
            left_width=query['leftWidth'], right_width=query['rightWidth'])
        source = {'symbolicCell': 'In[3973]' if query['orientation'] == 1 else 'In[3974]',
                  'numericalCell': 'In[3978]' if query['orientation'] == 1 else 'In[3979]',
                  'symbolicFunction': 'FoldCurvedFold3D',
                  'numericalFunction': 'NFoldCurvedFold3D'}
        fold_angle = query['orientation'] * 120
    sampled = fold.sample(query['curveSegments'], query['rulingSegments'])
    return {
        'family': 'origamica-curved-saved-pair',
        'query': query, 'source': source, 'foldAngleDeg': fold_angle,
        'certification': {
            'continuousIsometryAnalytic': True,
            'bothSidesDevelopableAnalytic': True,
            'rulingWidthBeforeFocalSet': True,
            'sampledChordsExactIsometry': False,
            'exactStraightCreaseFOLD': False,
            'adoptableCreasePattern': False,
            'deploymentPathChecked': False,
            'selfCollisionChecked': False,
        },
        'sample': {key: sampled[key] for key in (
            'parameterValues', 'rulingDistances', 'flatSamples',
            'foldedSamples', 'creaseIndices', 'sideRows')},
    }
