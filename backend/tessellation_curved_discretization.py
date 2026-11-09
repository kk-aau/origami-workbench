"""Numerical tools for Origamica 15.0 section 45, In[4087]--In[4093].

The uniform discretizer solves the notebook's *coupled chord-direction*
equations.  Its name does not mean equal arc length or equal chord length.
Only the increasing parameter branch reached from equally spaced initial
values is supported; arbitrary nonlinear roots are not enumerated.
"""

import math

import numpy as np
from scipy.optimize import root


class LocalFlatFoldabilityError(ValueError):
    """An interior vertex fails the notebook's Kawasaki alternating sum."""

    def __init__(self, vertex, sum_rad):
        self.vertex = vertex  # Origamica's 1-based index
        self.kawasaki_sum_rad = sum_rad
        super().__init__(f'Vertex {vertex} is not locally flat-foldable: '
                         f'Kawasaki alternating sum is {math.degrees(sum_rad):.12g}°.')


class SingularMultiplierError(ValueError):
    """The prescribed sine quotient has a zero or unresolved denominator."""

    def __init__(self, vertex):
        self.vertex = vertex  # Origamica's 1-based index
        super().__init__(f'Fold-angle multiplier is singular at vertex {vertex}: '
                         'the sine denominator is zero or too close to zero.')


def discretize_system(system, parameters):
    """Apply an ordered ``[(key, function), ...]`` system at every parameter.

    The result has the same ordered pair structure and preserves each
    function's return values.  This corresponds to the notebook's list of
    ``key -> function`` rules, not a dictionary that might collapse keys.
    """
    if not isinstance(system, (list, tuple)) or not isinstance(parameters, (list, tuple)):
        raise ValueError('system and parameters must be ordered sequences.')
    result = []
    for entry in system:
        if not isinstance(entry, (list, tuple)) or len(entry) != 2 or not callable(entry[1]):
            raise ValueError('Each system entry must be a (key, function) pair.')
        key, function = entry
        result.append((key, [function(t) for t in parameters]))
    return result


def _real(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{name} must be a finite real number.')
    value = float(value)
    if not math.isfinite(value):
        raise ValueError(f'{name} must be a finite real number.')
    return value


def _vector(value, name, dimension=None):
    try:
        values = tuple(value)
    except TypeError as exc:
        raise ValueError(f'{name} must be a 2D or 3D real vector.') from exc
    if len(values) not in (2, 3) or (dimension is not None and len(values) != dimension):
        raise ValueError(f'{name} must be a {dimension or "2D or 3D"} real vector.')
    return np.array([_real(component, name) for component in values], dtype=float)


def _finite_difference(curve, t, start, end, dimension):
    """Five-point derivative only when the caller has no analytic derivative."""
    h = min(1e-5 * max(1.0, end - start), (t - start) / 4, (end - t) / 4)
    if h <= 1e-13 * max(1.0, abs(t), end - start):
        raise ValueError('Numerical derivative is unresolved near an interval endpoint.')
    values = [_vector(curve(t + factor * h), 'curve value', dimension)
              for factor in (-2, -1, 1, 2)]
    return (values[0] - 8 * values[1] + 8 * values[2] - values[3]) / (12 * h)


def _increasing_parameters(log_gaps, start, end):
    # n-1 free gaps, final reference gap fixed at exp(0).  Equal spacing is
    # log_gaps=0, matching the notebook's FindRoot initial parameter list.
    weights = np.concatenate((np.asarray(log_gaps, dtype=float), [0.0]))
    if not np.all(np.isfinite(weights)):
        return None
    weights = np.exp(weights - np.max(weights))
    gaps = weights / np.sum(weights)
    if np.any(gaps <= 1e-13):
        return None
    parameters = np.concatenate(([start], start + (end - start) * np.cumsum(gaps)))
    parameters[-1] = end
    if not np.all(np.diff(parameters) > 0):
        return None
    return parameters


def _chord_residual(curve, derivative, parameters, start, end, dimension):
    points = [_vector(curve(float(t)), 'curve value', dimension) for t in parameters]
    chords = [b - a for a, b in zip(points, points[1:])]
    lengths = [math.hypot(*chord) for chord in chords]
    if any(not math.isfinite(length) or length == 0 for length in lengths):
        raise ValueError('A sampled chord has zero or nonfinite length.')
    units = [chord / length for chord, length in zip(chords, lengths)]
    residuals = []
    for i in range(1, len(parameters) - 1):
        tangent = (_vector(derivative(float(parameters[i])), 'curve derivative', dimension)
                   if derivative is not None else
                   _finite_difference(curve, float(parameters[i]), start, end, dimension))
        speed = math.hypot(*tangent)
        if not math.isfinite(speed) or speed == 0:
            raise ValueError('Curve derivative vanishes at an interior parameter.')
        # Dividing by speed leaves the original zero set unchanged and gives
        # a dimensionless convergence test independent of curve scale.
        residuals.append(float(np.dot(units[i - 1] - units[i], tangent / speed)))
    return np.asarray(residuals, dtype=float)


def discretize_curve_uniformly(curve, divisions, interval, *, derivative=None,
                               tolerance=1e-9, max_evaluations=None):
    """Solve Origamica's uniform-fold-angle discretization in 2D or 3D.

    At each interior parameter ``t_i`` the exact condition is
    ``(unit(f(t_i)-f(t_{i-1})) - unit(f(t_{i+1})-f(t_i))) · f'(t_i) = 0``.
    Endpoints are fixed.  The coupled root starts from equal *parameter*
    spacing and is constrained to increasing parameters.  ``derivative``
    should be supplied when available; otherwise a five-point numerical
    derivative is used within the interval.  Failure raises ``ValueError``.
    """
    if not callable(curve) or (derivative is not None and not callable(derivative)):
        raise ValueError('curve and derivative must be callable.')
    if type(divisions) is not int or not 1 <= divisions <= 128:
        raise ValueError('divisions must be an integer in [1, 128].')
    if not isinstance(interval, (list, tuple)) or len(interval) != 2:
        raise ValueError('interval must contain two endpoints.')
    start, end = (_real(interval[0], 'interval start'),
                  _real(interval[1], 'interval end'))
    if not start < end or not math.isfinite(end - start):
        raise ValueError('The parameter interval must be increasing.')
    tolerance = _real(tolerance, 'tolerance')
    if not 0 < tolerance <= 1e-3:
        raise ValueError('tolerance must be in (0, 1e-3].')
    if max_evaluations is not None and (type(max_evaluations) is not int or
                                         max_evaluations < 1):
        raise ValueError('max_evaluations must be a positive integer.')

    dimension = len(_vector(curve(start), 'curve value'))
    _vector(curve(end), 'curve value', dimension)
    if divisions == 1:
        _chord_residual(curve, derivative, [start, end], start, end, dimension)
        return [start, end]
    # Reject an initially singular curve with the specific geometric cause.
    # Nonregular probes during root iterations are handled in residual().
    _chord_residual(curve, derivative,
                    np.linspace(start, end, divisions + 1), start, end, dimension)

    def residual(log_gaps):
        parameters = _increasing_parameters(log_gaps, start, end)
        if parameters is None:
            return np.full(divisions - 1, 1000.0)
        try:
            return _chord_residual(curve, derivative, parameters, start, end, dimension)
        except ValueError:
            # FindRoot may probe outside the regular branch.  The final
            # candidate is checked again and never accepted on this penalty.
            return np.full(divisions - 1, 1000.0)

    budget = max_evaluations if max_evaluations is not None else 100 * divisions
    solution = root(residual, np.zeros(divisions - 1), method='hybr',
                    options={'xtol': min(tolerance * .1, 1e-11), 'maxfev': budget})
    parameters = _increasing_parameters(solution.x, start, end)
    if parameters is None or np.max(np.abs(residual(solution.x))) > tolerance:
        raise ValueError('The coupled chord-direction root did not converge on '
                         'the increasing parameter branch.')
    return [float(value) for value in parameters]


def _point2(value, name):
    return _vector(value, name, 2)


def _rotation_angle(first, second):
    """Origamica RotationAngle: signed CCW angle in (-pi, pi]."""
    # Direction is scale-invariant.  Normalize by the largest component
    # before products so otherwise valid 1e200-scale rulings do not overflow.
    first = first / max(abs(first[0]), abs(first[1]))
    second = second / max(abs(second[0]), abs(second[1]))
    cross = float(first[0] * second[1] - first[1] * second[0])
    dot = float(np.dot(first, second))
    angle = math.atan2(cross, dot)
    return math.pi if angle == -math.pi else angle


def fold_angle_multipliers_2d(fold, rulings, *,
                              kawasaki_tolerance=1e-10,
                              denominator_tolerance=1e-12):
    """Return Origamica's per-vertex sine quotients for a 2D discrete fold.

    ``fold`` is an ordered list of 2D vertices; ``rulings`` is ``(left,
    right)`` where each is a same-length list of vectors *from* its vertex.
    A locally non-flat-foldable interior vertex and a singular quotient are
    both rejected.  No global folding motion or layer order is implied.
    """
    if not isinstance(fold, (list, tuple)) or len(fold) < 2:
        raise ValueError('fold must contain at least two 2D points.')
    if not isinstance(rulings, (list, tuple)) or len(rulings) != 2:
        raise ValueError('rulings must be a pair (left, right).')
    left, right = rulings
    n = len(fold)
    if not isinstance(left, (list, tuple)) or not isinstance(right, (list, tuple)) or len(left) != n or len(right) != n:
        raise ValueError('Both ruling lists must match the number of fold points.')
    kawasaki_tolerance = _real(kawasaki_tolerance, 'kawasaki_tolerance')
    denominator_tolerance = _real(denominator_tolerance, 'denominator_tolerance')
    if not 0 <= kawasaki_tolerance <= 1e-3 or not 0 <= denominator_tolerance <= 1e-3:
        raise ValueError('Angle and denominator tolerances must be in [0, 1e-3].')
    points = [_point2(value, 'fold point') for value in fold]
    left = [_point2(value, 'left ruling') for value in left]
    right = [_point2(value, 'right ruling') for value in right]
    if any(math.hypot(*vector) == 0 for vector in left + right):
        raise ValueError('Ruling vectors must be nonzero.')
    if any(not math.isfinite(math.hypot(*(b - a))) or
           math.hypot(*(b - a)) == 0 for a, b in zip(points, points[1:])):
        raise ValueError('Consecutive fold points must be distinct.')

    sectors = []
    for i in range(n):
        previous = points[i - 1] - points[i] if i > 0 else None
        following = points[i + 1] - points[i] if i < n - 1 else None
        a1 = _rotation_angle(left[i], previous) if previous is not None else None
        a2 = _rotation_angle(previous, right[i]) if previous is not None else None
        a3 = _rotation_angle(right[i], following) if following is not None else None
        a4 = _rotation_angle(following, left[i]) if following is not None else None
        sectors.append((a1, a2, a3, a4))

    for i in range(1, n - 1):
        a1, a2, a3, a4 = sectors[i]
        alternating_sum = math.fsum((a1, -a2, a3, -a4))
        if abs(alternating_sum) > kawasaki_tolerance:
            raise LocalFlatFoldabilityError(i + 1, alternating_sum)

    multipliers = []
    for i, (a1, a2, a3, a4) in enumerate(sectors):
        if i == 0:
            numerator = math.sin((a4 + a3) / 2)
            denominator = math.sin((a4 - a3) / 2)
        else:
            numerator = math.sin((a1 + a2) / 2)
            denominator = math.sin((a1 - a2) / 2)
        if abs(denominator) <= denominator_tolerance:
            raise SingularMultiplierError(i + 1)
        multipliers.append(numerator / denominator)
    return multipliers
