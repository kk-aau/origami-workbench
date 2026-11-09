"""Closed JSON contract for read-only queries of certified curved folds.

No request field is interpreted as Python or SymPy source. Only the explicit
curve families below are turned into symbolic expressions by this module.
"""

import math

import sympy as sp

from tessellation_curved_space_curve import (
    flatten_fold_2d, fold_space_curve_3d, nflatten_fold_2d,
)


_COMMON = frozenset({
    'family', 'parameterStartPi', 'parameterEndPi',
    'foldAngleStartDeg', 'foldAngleEndDeg', 'orientation',
    'rulingWidth', 'curveSegments', 'rulingSegments',
})
_FAMILY_FIELDS = {
    'planar-circle': frozenset({'radius'}),
    'circular-helix': frozenset({'radius', 'pitchPerRadian'}),
    'planar-ellipse': frozenset({'axisX', 'axisY'}),
}
_DEFAULTS = {
    'planar-circle': {'radius': 1, 'foldAngleStartDeg': 120,
                      'rulingWidth': 1},
    'circular-helix': {'radius': 1, 'pitchPerRadian': .5,
                       'foldAngleStartDeg': 90, 'rulingWidth': 1},
    'planar-ellipse': {'axisX': 2, 'axisY': 1,
                       'foldAngleStartDeg': 120, 'rulingWidth': .5},
}


def _number(data, key, default, *, lower, upper, strict_lower=False,
            strict_upper=False):
    value = data.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{key} must be a JSON number.')
    try:
        value = float(value)
    except (ValueError, OverflowError) as exc:
        raise ValueError(f'{key} must be a finite JSON number.') from exc
    if not math.isfinite(value):
        raise ValueError(f'{key} must be finite.')
    if ((value <= lower if strict_lower else value < lower)
            or (value >= upper if strict_upper else value > upper)):
        raise ValueError(f'{key} is outside its certified query range.')
    return value


def _integer(data, key, default, lower, upper):
    value = data.get(key, default)
    if type(value) is not int or not lower <= value <= upper:
        raise ValueError(f'{key} must be an integer in [{lower}, {upper}].')
    return value


def validate_curved_space_curve_query(data):
    """Return canonical, JSON-native request values or fail closed.

    Structural validation is followed by exact smooth-domain and width checks
    in ``query_curved_space_curve``. This function never evaluates expressions.
    """
    if not isinstance(data, dict):
        raise ValueError('curved-fold query must be a JSON object.')
    family = data.get('family')
    if not isinstance(family, str) or family not in _FAMILY_FIELDS:
        raise ValueError('unsupported curved-fold family.')
    if set(data) - _COMMON - _FAMILY_FIELDS[family]:
        raise ValueError('curved-fold query has unsupported fields.')
    defaults = _DEFAULTS[family]
    start = _number(data, 'parameterStartPi', 0, lower=-2, upper=2)
    end = _number(data, 'parameterEndPi', 1, lower=-2, upper=2)
    if not 1e-6 < end - start <= 2:
        raise ValueError('parameter interval must be positive and at most 2π.')
    angle_start = _number(data, 'foldAngleStartDeg',
                          defaults['foldAngleStartDeg'], lower=0, upper=180,
                          strict_lower=True, strict_upper=True)
    angle_end = _number(data, 'foldAngleEndDeg', angle_start,
                        lower=0, upper=180,
                        strict_lower=True, strict_upper=True)
    if family != 'planar-circle' and angle_end != angle_start:
        raise ValueError('this curve family only certifies constant fold angle.')
    orientation = _integer(data, 'orientation', 1, -1, 1)
    if orientation == 0:
        raise ValueError('orientation must be +1 or -1.')
    width = _number(data, 'rulingWidth', defaults['rulingWidth'],
                    lower=0, upper=4, strict_lower=True)
    curve_segments = _integer(data, 'curveSegments', 96, 8, 512)
    ruling_segments = _integer(data, 'rulingSegments', 4, 1, 16)
    if (curve_segments + 1) * (2 * ruling_segments + 1) > 16000:
        raise ValueError('sample request exceeds the 16000-vertex limit.')
    result = {'family': family, 'parameterStartPi': start,
              'parameterEndPi': end, 'foldAngleStartDeg': angle_start,
              'foldAngleEndDeg': angle_end, 'orientation': orientation,
              'rulingWidth': width, 'curveSegments': curve_segments,
              'rulingSegments': ruling_segments}
    if family in ('planar-circle', 'circular-helix'):
        result['radius'] = _number(data, 'radius', defaults['radius'],
                                   lower=.25, upper=4)
    if family == 'circular-helix':
        result['pitchPerRadian'] = _number(data, 'pitchPerRadian',
                                           defaults['pitchPerRadian'],
                                           lower=-4, upper=4)
    if family == 'planar-ellipse':
        result['axisX'] = _number(data, 'axisX', defaults['axisX'],
                                  lower=.25, upper=4)
        result['axisY'] = _number(data, 'axisY', defaults['axisY'],
                                  lower=.25, upper=4)
        if result['axisX'] == result['axisY']:
            raise ValueError('planar-ellipse requires unequal axes.')
    return result


def _exact_decimal(value):
    return sp.Rational(str(value))


def _json_native(value):
    if isinstance(value, dict):
        return {key: _json_native(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [_json_native(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError('non-finite value in curved-fold result.')
    return value


def query_curved_space_curve(data):
    """Return paired sampled geometry and precise analytic-certification flags.

    The result is JSON serializable. It is a read-only smooth curved-fold
    analysis, never an exact straight-crease FOLD graph.
    """
    params = validate_curved_space_curve_query(data)
    u = sp.symbols('u', real=True)
    u0 = _exact_decimal(params['parameterStartPi']) * sp.pi
    u1 = _exact_decimal(params['parameterEndPi']) * sp.pi
    angle_start = _exact_decimal(params['foldAngleStartDeg']) * sp.pi / 180
    angle_end = _exact_decimal(params['foldAngleEndDeg']) * sp.pi / 180
    gamma = angle_start + (angle_end - angle_start) * (u - u0) / (u1 - u0)
    family = params['family']
    if family == 'planar-circle':
        radius = _exact_decimal(params['radius'])
        curve = (radius * sp.cos(u), radius * sp.sin(u), sp.Integer(0))
        flat_origin = (radius, 0)
    elif family == 'circular-helix':
        radius = _exact_decimal(params['radius'])
        pitch = _exact_decimal(params['pitchPerRadian'])
        curve = (radius * sp.cos(u), radius * sp.sin(u), pitch * u)
        flat_origin = (radius, 0)
    else:
        axis_x = _exact_decimal(params['axisX'])
        axis_y = _exact_decimal(params['axisY'])
        curve = (axis_x * sp.cos(u), axis_y * sp.sin(u), sp.Integer(0))
        flat_origin = (axis_x, 0)
    fold = fold_space_curve_3d(curve, gamma, parameter=u,
                               interval=(u0, u1),
                               orientation=params['orientation'])
    flat = flatten_fold_2d(fold, initial_parameter=u0,
                           initial_point=flat_origin,
                           initial_tangent=(0, 1))
    sample = nflatten_fold_2d(
        flat, ruling_width=params['rulingWidth'],
        curve_segments=params['curveSegments'],
        ruling_segments=params['rulingSegments'])
    return _json_native({
        'family': 'certified-space-curve-fold',
        'query': params,
        'sourceFunctions': ['FoldSpaceCurve3D', 'FlattenFold2D',
                            'NSpaceCurveFold3D', 'NFlattenFold2D'],
        'certification': {
            'curveRegularOnClosedInterval': True,
            'frenetCurvatureNonzeroOnClosedInterval': True,
            'foldAngleInOpenRangeOnClosedInterval': True,
            'bothSidesDevelopableAnalytic': True,
            'pairedContinuousIsometryAnalytic': True,
            'rulingWidthBeforeFocalSetCertified': True,
            'sampledMeshExactIsometry': False,
            'exactStraightCreaseFOLD': False,
            'deploymentPathChecked': False,
            'selfCollisionChecked': False,
        },
        'sample': sample,
    })
