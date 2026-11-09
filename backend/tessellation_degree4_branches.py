"""Local sector geometry for the two branches of a degree-four vertex.

This does not assign mountain/valley signs or solve a 3D folded form.
"""

import math

from tessellation_spherical_vertex import validate_developable_sectors


_CLASSIFICATION_TOLERANCE = 1e-6  # radians, the notebook's FlatFoldableTolerance


def classify_degree4_sector_branches(sectors):
    """Classify both possible major/minor pair choices from four sectors.

    The notebook defines the four straight-pair predicates at lines
    161395-161600. In a minor-first list, creases 1/3 are minor and 2/4
    major; in a major-first list the choices are reversed (161262-161304).
    The original FlatFoldableAnglesQ uses alternating angular excess with
    a default tolerance of 1e-6 radians (39030-39043, 39126-39184).
    """
    a1, a2, a3, a4 = validate_developable_sectors(sectors)
    straight_12 = abs(math.fsum((a1, a2)) - math.pi) <= _CLASSIFICATION_TOLERANCE
    straight_14 = abs(math.fsum((a1, a4)) - math.pi) <= _CLASSIFICATION_TOLERANCE
    flat_excess = math.fsum((a1, -a2, a3, -a4))
    return {
        'flatFoldabilityExcessRad': flat_excess,
        'flatFoldable': abs(flat_excess) <= _CLASSIFICATION_TOLERANCE,
        'minorFirst': {
            'minorCreases': [1, 3], 'majorCreases': [2, 4],
            'straightMinor': straight_12, 'straightMajor': straight_14,
        },
        'majorFirst': {
            'minorCreases': [2, 4], 'majorCreases': [1, 3],
            'straightMinor': straight_14, 'straightMajor': straight_12,
        },
    }


def degree4_branch_query(data):
    """JSON boundary for local branch classification; angles use degrees."""
    if (not isinstance(data, dict) or set(data) != {'operation', 'sectorAnglesDeg'}
            or data['operation'] != 'degree4-branch-geometry'):
        raise ValueError('四度顶点分支查询只接受四个扇区角。')
    values = data['sectorAnglesDeg']
    if not isinstance(values, list) or len(values) != 4:
        raise ValueError('四度顶点需要按环向给出四个扇区角。')
    if any(isinstance(a, bool) or not isinstance(a, (int, float))
           or not math.isfinite(a) or not 0 < a < 180 for a in values):
        raise ValueError('扇区角须为 0° 到 180° 之间的有限数值。')
    result = classify_degree4_sector_branches([math.radians(a) for a in values])
    return {
        'sectorAnglesDeg': values.copy(),
        'kind': 'local-degree4-branch-geometry',
        'flatFoldabilityExcessDeg': math.degrees(result.pop('flatFoldabilityExcessRad')),
        **result,
        'assignmentChosen': False,
        'selfCollisionChecked': False,
        'foldedForm3D': False,
    }
