"""Numerical 3D vertex closure using Origamica's alternating x/z rotations.

The notebook's HatVertexConsistencyConditions3D (lines 51534–51735) forms
Rx(fold[0]) Rz(sector[0]) ... and requires the product to be the identity.
Its hat-matrix split clears rational denominators. The normalized rotation
calculation below keeps the same zero set, including at 180-degree folds.
"""

import math

from tessellation_spherical_vertex import validate_developable_sectors


_IDENTITY = ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))
_TOLERANCE_RAD = 1e-6


def _multiply(left, right):
    return tuple(tuple(math.fsum(left[row][k] * right[k][column]
                                  for k in range(3)) for column in range(3))
                 for row in range(3))


def _transpose(matrix):
    return tuple(tuple(matrix[column][row] for column in range(3))
                 for row in range(3))


def _x_rotation(angle):
    cosine, sine = math.cos(angle), math.sin(angle)
    return ((1.0, 0.0, 0.0), (0.0, cosine, -sine), (0.0, sine, cosine))


def _z_rotation(angle):
    cosine, sine = math.cos(angle), math.sin(angle)
    return ((cosine, -sine, 0.0), (sine, cosine, 0.0), (0.0, 0.0, 1.0))


def _validate_pair(sectors, folds):
    if (not isinstance(sectors, (list, tuple)) or not isinstance(folds, (list, tuple))
            or len(sectors) != len(folds) or not 3 <= len(sectors) <= 12):
        raise ValueError('须按环向给出相同数量的扇区角与有向折角（3–12 个）。')
    if any(isinstance(value, bool) or not isinstance(value, (int, float))
           or abs(value) > math.tau or not math.isfinite(value)
           for value in (*sectors, *folds)):
        raise ValueError('扇区角与折角须为有限数值。')
    if any(not 0 < value < math.pi for value in sectors):
        raise ValueError('扇区角须在 0 到 π 之间。')
    if any(abs(value) > math.pi for value in folds):
        raise ValueError('有向折角须在 −π 到 π 之间。')
    if abs(math.fsum(sectors) - math.tau) > math.radians(1e-7):
        raise ValueError('可展顶点的扇区角总和须为 2π（360°）。')


def vertex_rotation_closure(sectors, folds):
    """Return the full R-I matrix and geodesic SO(3) closure error in radians.

    A 3-vector from only the antisymmetric part would incorrectly call a
    180-degree mismatch closed. The Frobenius norm of R-I is nonzero there.
    """
    _validate_pair(sectors, folds)
    rotation = _IDENTITY
    for fold, sector in zip(folds, sectors):
        rotation = _multiply(_multiply(rotation, _x_rotation(fold)), _z_rotation(sector))
    residual = tuple(tuple(rotation[row][column] - (1.0 if row == column else 0.0)
                           for column in range(3)) for row in range(3))
    frobenius = math.sqrt(math.fsum(value * value for row in residual for value in row))
    angle = 2 * math.asin(min(1.0, frobenius / (2 * math.sqrt(2))))
    return residual, angle


def _hat_numerator(hat, axis):
    squared = hat * hat
    double = 2 * hat
    if axis == 'x':
        return ((1 + squared, 0.0, 0.0),
                (0.0, 1 - squared, -double),
                (0.0, double, 1 - squared))
    return ((1 - squared, -double, 0.0),
            (double, 1 - squared, 0.0),
            (0.0, 0.0, 1 + squared))


def hat_vertex_consistency_matrix(fold_hats, sector_hats, split='automatic'):
    """Numerically evaluate Origamica's denominator-cleared 3×3 condition.

    ``split`` follows HatMatrixSplit: automatic, None, or number of matrices
    on the left. The entries are polynomial in the hat-transformed angles;
    the function intentionally does not perform symbolic expansion.
    """
    if (not isinstance(fold_hats, (list, tuple)) or not isinstance(sector_hats, (list, tuple))
            or len(fold_hats) != len(sector_hats) or not 3 <= len(fold_hats) <= 12):
        raise ValueError('帽变换折角与扇区角数量须相同，且为 3–12 个。')
    if any(isinstance(value, bool) or not isinstance(value, (int, float))
           or abs(value) > 1e3 or not math.isfinite(value)
           for value in (*fold_hats, *sector_hats)):
        raise ValueError('帽变换角须为绝对值不超过 1000 的有限数值。')
    pairs = []
    for fold, sector in zip(fold_hats, sector_hats):
        pairs.extend(((_hat_numerator(fold, 'x'), 1 + fold * fold),
                      (_hat_numerator(sector, 'z'), 1 + sector * sector)))
    if split == 'automatic':
        count = (len(pairs) + 1) // 2
    elif split is None:
        count = len(pairs)
    elif type(split) is int and 0 <= split <= len(pairs):
        count = split
    else:
        raise ValueError('帽矩阵分割位置超出范围。')
    left, right = pairs[:count], pairs[count:]
    lhs, rhs = _IDENTITY, _IDENTITY
    left_denominator, right_denominator = 1.0, 1.0
    for numerator, denominator in left:
        lhs = _multiply(lhs, numerator)
        left_denominator *= denominator
    for numerator, denominator in reversed(right):
        rhs = _multiply(rhs, _transpose(numerator))
        right_denominator *= denominator
    result = tuple(tuple(right_denominator * lhs[row][column]
                         - left_denominator * rhs[row][column]
                         for column in range(3)) for row in range(3))
    if any(not math.isfinite(value) for row in result for value in row):
        raise ValueError('帽变换多项式超出安全数值范围。')
    return result


def degree4_fold_consistency_query(data):
    """JSON-facing local test; input and displayed error use degrees."""
    if (not isinstance(data, dict)
            or set(data) != {'operation', 'sectorAnglesDeg', 'foldAnglesDeg'}
            or data['operation'] != 'degree4-fold-consistency'):
        raise ValueError('折角相容查询只接受四个扇区角与四个有向折角。')
    sectors, folds = data['sectorAnglesDeg'], data['foldAnglesDeg']
    if not isinstance(sectors, list) or not isinstance(folds, list) or len(folds) != 4:
        raise ValueError('四度顶点须按环向给出四个扇区角与四个有向折角。')
    if any(isinstance(value, bool) or not isinstance(value, (int, float))
           or not -180 <= value <= 180 or not math.isfinite(value) for value in folds):
        raise ValueError('有向折角须在 −180° 到 180° 之间。')
    if any(isinstance(value, bool) or not isinstance(value, (int, float))
           or not 0 < value < 180 or not math.isfinite(value) for value in sectors):
        raise ValueError('扇区角须在 0° 到 180° 之间。')
    validate_developable_sectors([math.radians(value) for value in sectors])
    residual, angle = vertex_rotation_closure(
        [math.radians(value) for value in sectors],
        [math.radians(value) for value in folds])
    return {
        'kind': 'local-degree4-fold-consistency',
        'sectorAnglesDeg': sectors.copy(),
        'foldAnglesDeg': folds.copy(),
        'closureErrorDeg': math.degrees(angle),
        'closureResidualMatrix': residual,
        'compatible': angle <= _TOLERANCE_RAD,
        'toleranceDeg': math.degrees(_TOLERANCE_RAD),
        'selfCollisionChecked': False,
        'foldedForm3D': False,
    }
