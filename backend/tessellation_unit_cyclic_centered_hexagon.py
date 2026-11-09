"""A bounded n=6 centered tile derived from Origamica's saved mother polygon.

In[359]/Out[359] supplies numerical zero-alternation central angles for the
six-corner mother. In[373] fixes its even-order free mode with side 2, and
In[3041] delegates the named tile to PolygonCenteredTwistTile. The notebook
does not save a numerical n=6 twist CP or folded form: this module combines
those original formulas locally and keeps that provenance explicit.
"""

import math

from tessellation_flat_embedding import flat_face_embedding
from tessellation_tile_twist import polygon_pleat_tile
from tessellation_unit_cyclic_polygon import (
    cyclic_center_gaps, unit_cyclic_polygon_info,
)
from tessellate import check_geometry, check_local_conditions


TILE_TYPE = 'UnitCyclicPolygonCenteredTwistTile'
OUT359_ANGLES = [128., 119., 118., 115., 0., 0.]
OUT359_ZERO_GAPS = [58., 64., 60., 70., 62., 46.]
OUT359_EFFECTIVE_ANGLES = [128., 119., 118., 115., 114., 126.]
OUT359_SIDE_GAPS = [61., 61., 63., 67., 65., 43.]
PRESET_TYPES = ['M', 'M', 'M', 'M', 'V', 'V']


def unit_cyclic_centered_hexagon_tile(angles, side, side_index, width,
                                      pleat_angle, central_types):
    """Construct one n=6 In[3041]-formula tile; all angles are degrees.

    The adapter's controlled branch uses finite input corners, zero source
    placeholders, side 2 to fix the even-order mode, and 1°–179° positive
    central arcs. It does not infer a numerical Wolfram twist output.
    """
    if (not isinstance(angles, (list, tuple)) or len(angles) != 6 or
            any(isinstance(value, bool) or not isinstance(value, (int, float))
                or not math.isfinite(value) for value in angles) or
            any(not 1 <= value <= 179 for value in angles[:4]) or
            list(angles[4:]) != [0, 0]):
        raise ValueError('需四个有限六边形内角和两个 0 占位角。')
    if isinstance(side_index, bool) or side_index != 2:
        raise ValueError('该六边形子域只以第 2 边选定偶数边自由度。')
    if (not isinstance(central_types, (list, tuple)) or
            len(central_types) != 6 or
            any(kind not in ('M', 'V') for kind in central_types)):
        raise ValueError('六条中心边须逐条指定 M 或 V。')
    if (isinstance(width, bool) or not isinstance(width, (int, float)) or
            not math.isfinite(width) or not .05 <= width <= .8):
        raise ValueError('褶宽须为 0.05–0.8 的有限数字。')
    if (isinstance(pleat_angle, bool) or
            not isinstance(pleat_angle, (int, float)) or
            not math.isfinite(pleat_angle) or not 1 <= pleat_angle < 90):
        raise ValueError('该受限子域仅支持 1°–90° 的锐角褶角。')

    input_angles = list(angles)
    effective_angles, zero_gaps = cyclic_center_gaps(input_angles)
    info = unit_cyclic_polygon_info(input_angles, side, side_index)
    fold, mother, details = polygon_pleat_tile(
        info['vertices'], width, 0., pleat_angle,
        list(central_types), clockwise=False,
    )
    source = {
        'tileType': TILE_TYPE, 'inputAngles': input_angles,
        'effectiveAngles': effective_angles,
        'zeroAlternationCenterAngles': zero_gaps,
        'centerAngles': info['centerAngles'],
        'alternatingAdjustment': info['alternatingAdjustment'],
        'vertices': info['vertices'], 'circumcenter': info['circumcenter'],
        'circumradius': info['circumradius'], 'side': float(side),
        'sideIndex': side_index, 'width': float(width),
        'pleatAngle': float(pleat_angle),
        'centralTypes': list(central_types),
        'centralVertices': details['centralVertices'],
        'motherAnchor': 'In[359]/Out[359]',
        'tileFormula': 'In[3041]',
        'twistNumericalOut': None,
        'layerOrder': 'not_checked', 'adoptable': False,
    }
    return fold, mother, source


def original_formula_cyclic_centered_hexagon_out359():
    """Check the fixed mother Out[359] anchor and build its local tile preset."""
    fold, mother, source = unit_cyclic_centered_hexagon_tile(
        OUT359_ANGLES, 1., 2, .1, 80., PRESET_TYPES,
    )
    for got, expected in zip(source['zeroAlternationCenterAngles'],
                             OUT359_ZERO_GAPS):
        if abs(got-expected) > 1e-9:
            raise AssertionError('Out[359] 零交错圆心弧角不匹配。')
    for got, expected in zip(source['centerAngles'], OUT359_SIDE_GAPS):
        if abs(got-expected) > 1e-8:
            raise AssertionError('In[373] 第 2 边约束结果不匹配。')
    flat, closure = flat_face_embedding(fold)
    return {
        'fold': fold, 'mother': mother, 'sourceTile': source,
        'foldedForm': flat, 'closureError': closure,
        'foldedFormMeaning': '2D face reflections of locally combined formulas',
        'checks': {
            'geometry': check_geometry(fold),
            'local': check_local_conditions(fold),
            'flatFoldedForm': {'status': 'passed' if closure < 1e-8 else 'failed',
                               'closureError': closure},
            'layerOrder': {'status': 'not_checked'},
        },
        'adoptable': False,
    }
