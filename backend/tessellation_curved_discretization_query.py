"""Closed JSON queries for Origamica section 45 discretization examples.

The notebook saves input cells but no Wolfram numerical Out for these examples.
This endpoint never evaluates a user expression.  Its variable subdivision count
still follows only the increasing root reached from equal parameter spacing.
"""

import math

from tessellation_curved_discretization import (
    discretize_curve_uniformly,
    discretize_system,
    fold_angle_multipliers_2d,
)


EXAMPLES = ('in-4088', 'in-4090', 'in-4093', 'multiplier-fixture')


def validate_curved_discretization_query(data):
    if not isinstance(data, dict):
        raise ValueError('Discretization query must be a JSON object.')
    example = data.get('example')
    if example not in EXAMPLES or type(example) is not str:
        raise ValueError('Unsupported section-45 discretization example.')
    allowed = {'example', 'divisions'} if example in ('in-4090', 'in-4093') else {'example'}
    if set(data) - allowed:
        raise ValueError('Discretization query contains unsupported fields.')
    if example not in ('in-4090', 'in-4093'):
        return {'example': example}
    divisions = data.get('divisions', 4 if example == 'in-4090' else 5)
    if type(divisions) is not int or not 2 <= divisions <= 16:
        raise ValueError('divisions must be an integer in [2, 16].')
    return {'example': example, 'divisions': divisions}


def _source(cell, function, origin='saved-input'):
    return {'inputCell': cell, 'function': function, 'origin': origin,
            'wolframNumericOutAvailable': False}


def _parabola(t):
    return (-t * t, t)


def _parabola_derivative(t):
    return (-2 * t, 1)


def _chord_row(points, index):
    dx = points[index + 1][0] - points[index][0]
    dy = points[index + 1][1] - points[index][1]
    length = math.hypot(dx, dy)
    return {'index': index + 1, 'vector': [dx, dy], 'length': length,
            'unit': [dx / length, dy / length]}


def _direction_row(parameters, chords, index):
    t = parameters[index]
    before, after = chords[index - 1]['unit'], chords[index]['unit']
    tangent = _parabola_derivative(t)
    residual = math.fsum(((before[0] - after[0]) * tangent[0],
                          (before[1] - after[1]) * tangent[1]))
    return {'vertex': index + 1, 'parameter': t, 'tangent': list(tangent),
            'residual': residual,
            'normalizedResidual': residual / math.hypot(*tangent)}


def _ray(degrees):
    angle = math.radians(degrees)
    return [math.cos(angle), math.sin(angle)]


# In[4019] cone-cone branch of ConicSection2DSystem, specialized only to the
# exact fl=-2, fr=-1, hl=-3/2, hr=1 saved by In[4093].
def _ellipse_fold(t):
    cosine, sine = math.cos(t), math.sin(t)
    return [-2 + 4 * cosine / (3 - cosine), 4 * sine / (3 - cosine)]


def _ellipse_fold_derivative(t):
    cosine, sine = math.cos(t), math.sin(t)
    denominator = (3 - cosine) ** 2
    return [-12 * sine / denominator, 4 * (3 * cosine - 1) / denominator]


def _ellipse_left_second(t):
    return [-2 + .5 * math.cos(t), .5 * math.sin(t)]


def _ellipse_right_second(t):
    half_tangent = math.tan(t / 2)
    denominator = 1 + 4 * half_tangent ** 2
    return [-3 + 4 / denominator, 8 * half_tangent / denominator]


def _ellipse_right_director(t):
    half_tangent = math.tan(t / 2)
    denominator = 1 + 4 * half_tangent ** 2
    return [1 - 2 / denominator, -4 * half_tangent / denominator]


def _ellipse_system():
    """Preserve In[4019]'s nine-rule order, including the two second crosses."""
    return [
        ('CurvedFold2D', _ellipse_fold),
        ('DirectrixLeft2D', lambda _t: [-2, 0]),
        ('DirectorLeft2D', lambda t: [-math.cos(t), -math.sin(t)]),
        ('CrossCurveLeft2D', lambda _t: [-2, 0]),
        ('SecondCrossCurveLeft2D', _ellipse_left_second),
        ('DirectrixRight2D', lambda _t: [-1, 0]),
        ('DirectorRight2D', _ellipse_right_director),
        ('CrossCurveRight2D', lambda _t: [-1, 0]),
        ('SecondCrossCurveRight2D', _ellipse_right_second),
    ]


def _ellipse_saved_example(query, common):
    divisions = query['divisions']
    parameters = discretize_curve_uniformly(
        _ellipse_fold, divisions, (0, math.pi / 2),
        derivative=_ellipse_fold_derivative)
    system = [{'key': key, 'values': values}
              for key, values in discretize_system(_ellipse_system(), parameters)]
    by_key = {row['key']: row['values'] for row in system}
    fold = by_key['CurvedFold2D']
    left = by_key['SecondCrossCurveLeft2D']
    right = by_key['SecondCrossCurveRight2D']
    left_rulings = [[a - b for a, b in zip(point, crease)]
                    for point, crease in zip(left, fold)]
    right_rulings = [[a - b for a, b in zip(point, crease)]
                     for point, crease in zip(right, fold)]
    multipliers = fold_angle_multipliers_2d(
        fold, (left_rulings, right_rulings))
    chords = [_chord_row(fold, i) for i in range(divisions)]
    residuals = []
    for index in range(1, divisions):
        tangent = _ellipse_fold_derivative(parameters[index])
        before, after = chords[index - 1]['unit'], chords[index]['unit']
        residual = math.fsum(((before[0] - after[0]) * tangent[0],
                              (before[1] - after[1]) * tangent[1]))
        residuals.append({
            'vertex': index + 1, 'parameter': parameters[index],
            'tangent': tangent, 'residual': residual,
            'normalizedResidual': residual / math.hypot(*tangent),
        })
    ellipse_residuals = [8 * (x + 1.5) ** 2 + 9 * y ** 2 - 18
                         for x, y in fold]
    return {**common,
            'source': {**_source('In[4093]', 'ConicSection2DSystem'),
                       'definitionCell': 'In[4019]',
                       'savedDivisions': 5,
                       'parameterStatus': ('saved-input' if divisions == 5
                                           else 'bounded-local-extension'),
                       'functionChain': ['ConicSection2DSystem',
                                         'DiscretizeCurveUniformly',
                                         'DiscretizeSystem',
                                         'FoldAngleMultipliers2D']},
            'sample': {
                'conicParameters': {'leftFocus': -2, 'rightFocus': -1,
                                    'leftDirectrix': -1.5, 'rightDirectrix': 1,
                                    'simplification': 'Simplify'},
                'intervalRad': [0, math.pi / 2], 'divisions': divisions,
                'parameterValuesRad': parameters,
                'parameterValuesDeg': [math.degrees(t) for t in parameters],
                'system': system, 'foldPoints': fold,
                'leftSecondCrossPoints': left,
                'rightSecondCrossPoints': right,
                'leftRulings': left_rulings, 'rightRulings': right_rulings,
                'chords': chords, 'directionResiduals': residuals,
                'maximumAbsoluteResidual': max(abs(row['residual'])
                                               for row in residuals),
                'multipliers': multipliers,
                'maximumMultiplierDeviation': max(abs(value - multipliers[0])
                                                  for value in multipliers),
                'maximumEllipseEquationResidual': max(abs(value)
                                                      for value in ellipse_residuals),
                'increasingRootFromEqualParameterGuess': True,
            }}


def query_curved_discretization(data):
    query = validate_curved_discretization_query(data)
    example = query['example']
    common = {'family': 'origamica-curved-discretization', 'query': query}
    if example == 'in-4088':
        parameters = [i / 4 for i in range(5)]
        rows = discretize_system([
            ('Curve2D', lambda t: [t, t * t]),
            ('Curve3D', lambda t: [t, t * t, 0]),
        ], parameters)
        return {**common, 'source': _source('In[4088]', 'DiscretizeSystem'),
                'sample': {'parameterValues': parameters,
                           'system': [{'key': key, 'values': values}
                                      for key, values in rows]}}
    if example == 'in-4090':
        n = query['divisions']
        parameters = discretize_curve_uniformly(
            _parabola, n, (0, 1), derivative=_parabola_derivative)
        points = [list(_parabola(t)) for t in parameters]
        chords = [_chord_row(points, i) for i in range(n)]
        residuals = [_direction_row(parameters, chords, i)
                     for i in range(1, n)]
        return {**common, 'source': _source('In[4090]', 'DiscretizeCurveUniformly'),
                'sample': {'curve': '(-t², t)', 'interval': [0, 1],
                           'parameterValues': parameters, 'points': points,
                           'chords': chords, 'directionResiduals': residuals,
                           'maximumAbsoluteResidual': max(abs(row['residual'])
                                                          for row in residuals),
                           'initialGuess': [i / n for i in range(n + 1)],
                           'increasingRootFromEqualParameterGuess': True}}
    if example == 'in-4093':
        return _ellipse_saved_example(query, common)
    # A fixed, independently verified kink exercises In[4092]'s endpoint and
    # interior quotient formulas separately from the saved In[4093] ellipse.
    kink = math.radians(20)
    fold = [[-math.cos(kink), math.sin(kink)], [0, 0],
            [math.cos(kink), math.sin(kink)]]
    left, right = [_ray(100)] * 3, [_ray(260)] * 3
    multipliers = fold_angle_multipliers_2d(fold, (left, right))
    return {**common, 'source': _source('In[4092]', 'FoldAngleMultipliers2D',
                                      'verification-fixture'),
            'sample': {'foldPoints': fold, 'leftRulings': left,
                       'rightRulings': right, 'multipliers': multipliers,
                       'interiorKawasakiResidualDeg': [0.0],
                       'locallyFlatFoldable': True,
                       'globalFoldingCertified': False,
                       'in4093EllipseReproduced': False}}
