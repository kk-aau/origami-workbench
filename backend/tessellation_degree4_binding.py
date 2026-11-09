"""Origamica's local binding fold-angle magnitudes for a degree-four vertex.

The four sector angles are in cyclic order, in radians. Binding concerns the
first contact of faces incident to this one vertex on a selected major/minor
pair branch. It does not test contact elsewhere in a sheet or build a 3D form.
"""

import math

from tessellation_spherical_vertex import validate_developable_sectors


# Origamica's Boolean FlatFoldableAnglesQ uses 1e-6 rad, but its shortcut to
# four 180-degree binding angles is geometrically false for a merely *near*
# flat-foldable vertex. Use numerical equality for angle construction. The
# separate branch-classification query retains the original Boolean tolerance.
_EXACT_ANGLE_TOLERANCE = 1e-12


def _cot(value):
    return math.cos(value) / math.sin(value)


def _csc(value):
    return 1 / math.sin(value)


def _cot_half_fold(value):
    if value < 1e-12:
        raise ValueError('绑定角接近 0°，当前数值精度不足。')
    return 0.0 if abs(value - math.pi) <= 1e-14 else _cot(value / 2)


def _arc_cot_ratio_magnitude(numerator, denominator):
    """Return |2 ArcCot[numerator/denominator]| in Wolfram's real branch.

    ArcCot is odd on the reals. Taking the final absolute value makes this
    2 atan2(|denominator|, |numerator|), including a zero numerator or
    denominator without dividing two nearly equal small numbers.
    """
    if not (math.isfinite(numerator) and math.isfinite(denominator)) or (numerator == 0 and denominator == 0):
        raise ValueError('绑定折角公式在当前扇区角附近数值退化。')
    return 2 * math.atan2(abs(denominator), abs(numerator))


def minor_first_binding_angles(sectors):
    """Return positive binding magnitudes γ1..γ4 for the minor-first branch.

    This reproduces MinorFirstBindingDihedralAngles, notebook lines
    161738-161924. Creases 1/3 are the opposite-type minor pair, and 2/4
    are the same-type major pair. Magnitudes alone do not choose M/V signs.
    """
    a1, a2, a3, a4 = validate_developable_sectors(sectors)
    if abs(math.fsum((a1, -a2, a3, -a4))) <= _EXACT_ANGLE_TOLERANCE:
        return [math.pi] * 4
    if abs(math.fsum((a1, a4)) - math.pi) <= _EXACT_ANGLE_TOLERANCE:
        return [0.0, math.pi, 0.0, math.pi]

    # The original r = sqrt(sin(a1)sin(a2)/(sin(a3)sin(a4))). Work with its
    # logarithm so near-degenerate but finite sectors do not overflow.
    log_r = 0.5 * math.fsum((math.log(math.sin(a1)), math.log(math.sin(a2)),
                             -math.log(math.sin(a3)), -math.log(math.sin(a4))))
    if abs(log_r) < 1e-14:
        raise ValueError('绑定折角分支接近退化，请调整扇区角精度。')
    if log_r < 0:
        gamma2, gamma4 = math.pi, 2 * math.asin(math.exp(log_r))
    else:
        gamma2, gamma4 = 2 * math.asin(math.exp(-log_r)), math.pi
    cot_half2, cot_half4 = _cot_half_fold(gamma2), _cot_half_fold(gamma4)

    if abs(math.fsum((a1, a2)) - math.pi) <= _EXACT_ANGLE_TOLERANCE:
        # Opposite minor creases form one straight line. The notebook sets
        # signed γ3 = -γ1, then returns both magnitudes.
        numerator = (cot_half2 * _csc(a1) + cot_half4 * _csc(a4)) * (_cot(a1) + _cot(a3))
        denominator = _csc(a3) ** 2 - _csc(a2) ** 2
        gamma1 = gamma3 = _arc_cot_ratio_magnitude(numerator, denominator)
    else:
        denominator = _csc(a3) * _csc(a4) - _csc(a1) * _csc(a2)
        numerator1 = (cot_half2 * (_cot(a1) + _cot(a3)) * _csc(a2)
                      - cot_half4 * (_cot(a2) + _cot(a4)) * _csc(a3))
        numerator3 = (cot_half2 * (_cot(a2) + _cot(a4)) * _csc(a1)
                      - cot_half4 * (_cot(a1) + _cot(a3)) * _csc(a4))
        gamma1 = _arc_cot_ratio_magnitude(numerator1, denominator)
        gamma3 = _arc_cot_ratio_magnitude(numerator3, denominator)
    return [gamma1, gamma2, gamma3, gamma4]


def major_first_binding_angles(sectors):
    """Return binding magnitudes when creases 1/3 are the major pair.

    The notebook rotates the sectors left once, calls its minor-first rule,
    then rotates the output right once (lines 162402-162415).
    """
    sectors = validate_developable_sectors(sectors)
    rotated = minor_first_binding_angles(sectors[1:] + sectors[:1])
    return rotated[-1:] + rotated[:-1]
