"""A bounded n=8 centered tile derived from Origamica's general formulas.

In[357] completes the final two angles of an even cyclic polygon; In[373]
uses side 2 to fix its alternating central-arc degree of freedom; In[378]
returns the mother vertices; In[3041] delegates the named centered twist to
PolygonCenteredTwistTile. No n=8 input drawing, vertices Out, or twist CP Out
is saved in the notebook. The preset below is a local formula-derived case.
"""

import math

from tessellation_flat_embedding import flat_face_embedding
from tessellation_tile_twist import polygon_pleat_tile
from tessellation_unit_cyclic_polygon import (
    cyclic_center_gaps, unit_cyclic_polygon_info,
)
from tessellate import check_geometry, check_local_conditions


TILE_TYPE = 'UnitCyclicPolygonCenteredTwistTile'
FORMULA_ANGLES = [140., 135., 135., 135., 130., 135., 0., 0.]
FORMULA_EFFECTIVE_ANGLES = [140., 135., 135., 135., 130., 135., 135., 135.]
FORMULA_ZERO_GAPS = [40., 50., 40., 50., 50., 40., 50., 40.]
FORMULA_SIDE_GAPS = [45., 45., 45., 45., 55., 35., 55., 35.]
FORMULA_TYPES = ['M', 'M', 'M', 'M', 'M', 'M', 'V', 'V']


def unit_cyclic_centered_octagon_tile(angles, side, side_index, width,
                                      pleat_angle, central_types):
    """Build one n=8 In[3041]-formula tile on the bounded internal-center arc branch."""
    if (not isinstance(angles, (list, tuple)) or len(angles) != 8 or
            any(isinstance(value, bool) or not isinstance(value, (int, float))
                or not math.isfinite(value) for value in angles) or
            any(not 1 <= value <= 179 for value in angles[:6]) or
            list(angles[6:]) != [0, 0]):
        raise ValueError('需六个有限八边形内角和两个 0 占位角。')
    if isinstance(side_index, bool) or side_index != 2:
        raise ValueError('该八边形子域只以第 2 边选定偶数边自由度。')
    if (not isinstance(central_types, (list, tuple)) or
            len(central_types) != 8 or
            any(kind not in ('M', 'V') for kind in central_types)):
        raise ValueError('八条中心边须逐条指定 M 或 V。')
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
        'notebookFormulas': ['In[357]', 'In[373]', 'In[378]', 'In[3041]'],
        'savedOctagonNumericalOut': None,
        'layerOrder': 'not_checked', 'adoptable': False,
    }
    return fold, mother, source


def formula_cyclic_centered_octagon_candidate():
    """Construct and check the local irregular integer-angle n=8 candidate."""
    fold, mother, source = unit_cyclic_centered_octagon_tile(
        FORMULA_ANGLES, 1., 2, .1, 80., FORMULA_TYPES,
    )
    for got, expected in zip(source['zeroAlternationCenterAngles'],
                             FORMULA_ZERO_GAPS):
        if abs(got-expected) > 1e-8:
            raise AssertionError('零交错圆心弧角与公式推导不符。')
    for got, expected in zip(source['centerAngles'], FORMULA_SIDE_GAPS):
        if abs(got-expected) > 1e-8:
            raise AssertionError('第 2 边约束后的圆心弧角与公式推导不符。')
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
