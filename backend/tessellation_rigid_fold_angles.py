"""Origamica RigidlyScaleFoldAngles (notebook lines 151001–151184).

This changes the folding state of an existing rigidly compatible pattern. It
does not construct the crease pattern or establish global rigid foldability.
The notebook formula, in radians, is 2 ArcTan[mu Tan[gamma / 2]].
"""

import math


def _finite_number(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{label}必须是有限数值。')
    try:
        number = float(value)
    except OverflowError as exc:
        raise ValueError(f'{label}必须是有限数值。') from exc
    if not math.isfinite(number):
        raise ValueError(f'{label}必须是有限数值。')
    return number


def _fold_angle(value, label):
    angle = _finite_number(value, label)
    # At +/-pi, Tan[gamma/2] is singular in the original expression.
    if not -math.pi < angle < math.pi:
        raise ValueError(f'{label}必须严格位于 -180° 与 180° 之间。')
    return angle


def rigidly_scale_fold_angles(angles_rad, multiplier):
    """Scale an angle list using Origamica's common half-tangent multiplier.

    The principal branch is the original ArcTan range (-pi, pi). Positive and
    negative multipliers both work; zero unfolds every crease. ``atan2``
    avoids intermediate Tan overflow near +/-pi without changing the branch.
    """
    if not isinstance(angles_rad, (tuple, list)) or not angles_rad:
        raise ValueError('折角列表至少需要一个角。')
    mu = _finite_number(multiplier, '半角正切倍率')
    angles = [_fold_angle(value, f'第 {i + 1} 个折角')
              for i, value in enumerate(angles_rad)]
    return [2 * math.atan2(mu * math.sin(angle / 2), math.cos(angle / 2))
            for angle in angles]


def rigidly_scale_fold_angles_to_anchor(angles_rad, old_angle_rad, new_angle_rad):
    """Original rule overload: old fold angle -> new fold angle.

    An old angle of zero cannot define a unique half-tangent multiplier.
    """
    old_angle = _fold_angle(old_angle_rad, '原锚定折角')
    new_angle = _fold_angle(new_angle_rad, '目标锚定折角')
    old_tangent = math.tan(old_angle / 2)
    if old_tangent == 0:
        raise ValueError('原锚定折角为 0°，无法确定半角正切倍率。')
    multiplier = math.tan(new_angle / 2) / old_tangent
    if not math.isfinite(multiplier):
        raise ValueError('锚定映射得到非有限倍率。')
    return rigidly_scale_fold_angles(angles_rad, multiplier), multiplier


def rigid_fold_angle_scale_query(data):
    """JSON contract using degrees: exactly one of multiplier or mapAngleDeg."""
    if not isinstance(data, dict) or data.get('operation') != 'rigid-fold-angle-scale':
        raise ValueError('刚性折角缩放操作无效。')
    has_multiplier = 'multiplier' in data
    has_mapping = 'mapAngleDeg' in data
    if has_multiplier == has_mapping:
        raise ValueError('必须且只能提供倍率或锚定折角映射。')
    allowed = ({'operation', 'anglesDeg', 'multiplier'} if has_multiplier
               else {'operation', 'anglesDeg', 'mapAngleDeg'})
    if set(data) != allowed:
        raise ValueError('刚性折角缩放包含不支持的参数。')
    input_angles = data['anglesDeg']
    if not isinstance(input_angles, list) or not 1 <= len(input_angles) <= 256:
        raise ValueError('折角列表必须包含 1–256 个角。')
    angles_rad = [math.radians(_finite_number(value, f'第 {i + 1} 个折角'))
                  for i, value in enumerate(input_angles)]
    if has_multiplier:
        multiplier = _finite_number(data['multiplier'], '半角正切倍率')
        output_rad = rigidly_scale_fold_angles(angles_rad, multiplier)
    else:
        mapping = data['mapAngleDeg']
        if not isinstance(mapping, list) or len(mapping) != 2:
            raise ValueError('锚定折角映射必须为 [原折角, 目标折角]。')
        old, new = [_finite_number(value, label) for value, label in
                    zip(mapping, ('原锚定折角', '目标锚定折角'))]
        output_rad, multiplier = rigidly_scale_fold_angles_to_anchor(
            angles_rad, math.radians(old), math.radians(new))
    return {
        'kind': 'origamica-rigid-fold-angle-scale',
        'inputAnglesDeg': [math.degrees(value) for value in angles_rad],
        'scaledAnglesDeg': [math.degrees(value) for value in output_rad],
        'multiplier': multiplier,
        'halfTangentScaleCommon': True,
        'globalRigidFoldingChecked': False,
        'selfCollisionChecked': False,
    }
