"""Numerical degree-four spherical-vertex analyses from Origamica.

Angles use radians. This module computes reachability bounds only; it does
not solve a rigid-folding motion or test self-intersection of the panels.
"""

import math


def validate_developable_sectors(sectors):
    """Return a four-angle paper vertex in radians, or reject invalid input."""
    if not isinstance(sectors, (list, tuple)) or len(sectors) != 4:
        raise ValueError('四度顶点需要按环向给出四个扇区角。')
    if any(isinstance(a, bool) or not isinstance(a, (int, float))
           or not math.isfinite(a) or not 0 < a < math.pi for a in sectors):
        raise ValueError('扇区角须为 0 到 π 之间的有限弧度值。')
    if abs(math.fsum(sectors) - math.tau) > math.radians(1e-7):
        raise ValueError('可展四度顶点的四个扇区角之和须为 2π（360°）。')
    return tuple(float(a) for a in sectors)


def maximum_dihedral_angles(sectors):
    """Return each crease's positive reachable dihedral magnitude.

    This is Origamica's MaximumDihedralAngles formula (notebook lines
    161031–161161): gamma[i] = 2 asin(min(sqrt(sin(a[i+1])
    sin(a[i+2]) / (sin(a[i]) sin(a[i+3]))), 1)), with cyclic indices.
    The result is in [0, pi] and deliberately ignores binding/self-contact.
    The notebook assumes a developable paper vertex: the four sectors sum to
    2 pi (line 160102). Reject other angle sets rather than applying its
    expression outside that physical domain.
    """
    sectors = validate_developable_sectors(sectors)

    # Logarithms avoid overflow/underflow of products for near-degenerate but
    # still finite sectors. Each sine is positive for angles in (0, pi).
    logs = [math.log(math.sin(a)) for a in sectors]
    bounds = []
    for i in range(4):
        ratio_log = logs[(i + 1) % 4] + logs[(i + 2) % 4] - logs[i] - logs[(i + 3) % 4]
        # Floating-point cancellation can make an exactly complete fold read
        # as infinitesimally below pi. The threshold is below display precision.
        bounds.append(math.pi if ratio_log >= -1e-14 else 2 * math.asin(math.exp(ratio_log / 2)))
    return bounds


def maximum_dihedral_query(data):
    """Small JSON-facing query; degrees are explicit at the UI boundary."""
    if not isinstance(data, dict) or set(data) != {'operation', 'sectorAnglesDeg'}:
        raise ValueError('四度顶点查询只接受四个扇区角。')
    values = data['sectorAnglesDeg']
    if not isinstance(values, list) or len(values) != 4:
        raise ValueError('四度顶点需要按环向给出四个扇区角。')
    if any(isinstance(a, bool) or not isinstance(a, (int, float))
           or not math.isfinite(a) or not 0 < a < 180 for a in values):
        raise ValueError('扇区角须为 0° 到 180° 之间的有限数值。')
    bounds = maximum_dihedral_angles([math.radians(a) for a in values])
    return {
        'sectorAnglesDeg': values.copy(),
        'maximumDihedralsDeg': [math.degrees(a) for a in bounds],
        'kind': 'local-degree4-dihedral-bound',
        'selfCollisionChecked': False,
        'foldedForm3D': False,
    }
