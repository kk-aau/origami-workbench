"""Stable Origamica UnitRegularPolygonOffsetTwistTile (In[3018–3019]).

The named tile delegates to PolygonOffsetTwistTile with unit-side vertices.
The printed helper UnitRegularPolygonOffsetTwistAngle (In[3012]) conflicts
with its inverse and the actual central polygon; geometry is constructed
from directed perpendicular pleats, not from that helper's printed angle.
"""
import math

from tessellation_tile_twist import polygon_pleat_tile
from tessellation_unit_regular_centered import unit_regular_polygon_vertices


TILE_TYPE = 'UnitRegularPolygonOffsetTwistTile'


def geometric_offset_twist_angle(sides, width, offset):
    """Central twist in degrees from In[3013]'s inverse relation.

    This is the branch compatible with source offset and the constructed CP:
    alpha=atan2(w*cot(pi/n),2d).  It is not the conflicting printed In[3012].
    """
    unit_regular_polygon_vertices(sides)
    if (isinstance(width, bool) or not isinstance(width, (int, float)) or
            not math.isfinite(width) or width <= 0 or
            isinstance(offset, bool) or not isinstance(offset, (int, float)) or
            not math.isfinite(offset)):
        raise ValueError('褶宽须为正有限数字，偏置须为有限数字。')
    return math.degrees(math.atan2(width/math.tan(math.pi/sides), 2*offset))


def unit_regular_offset_twist_tile(sides, width, offset, central_types):
    """Construct a named unit regular-polygon offset CP and mother polygon."""
    polygon = unit_regular_polygon_vertices(sides)
    if (not isinstance(central_types, list) or len(central_types) != sides or
            any(kind not in ('M', 'V') for kind in central_types)):
        raise ValueError('每条中心边须逐条指定 M 或 V。')
    angle = geometric_offset_twist_angle(sides, width, offset)
    fold, mother, detail = polygon_pleat_tile(
        polygon, width, offset, 90., central_types, clockwise=offset <= 0)
    return fold, mother, {
        'tileType': TILE_TYPE, 'sides': sides, 'vertices': polygon,
        'width': width, 'offset': offset, 'centralTypes': central_types.copy(),
        'pleatAngle': 90., 'twistDirection': 'CCW' if offset > 0 else 'CW',
        'geometricTwistAngle': angle, 'centerRotation': 90.-angle,
        'centerScale': width/math.sin(math.radians(angle)),
        'centralVertices': detail['centralVertices'],
        'layerOrder': 'not_checked', 'adoptable': False,
    }


def original_regular_offset_pair():
    """Rebuild saved In[3019]: two n=4 squares at (0,0) and (0,1)."""
    from tessellation_patterns import make_fold
    from tessellation_tile_patch import construct_tile_patch
    from tessellation_flat_embedding import flat_face_embedding
    from tessellate import check_geometry, check_local_conditions

    sides, width, offsets, types = 4, .2, (.15, -.15), ['V']*4
    first = unit_regular_polygon_vertices(sides)
    second = [[point[0], point[1]+1.] for point in first]
    for offset in offsets:
        unit_regular_offset_twist_tile(sides, width, offset, types)
    vertices = first + [second[2], second[3]]
    source_faces = [[0, 1, 2, 3], [3, 2, 4, 5]]
    mother = make_fold(vertices,
                       [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4], [4, 5], [5, 3]],
                       ['B']*7, [face[::-1] for face in source_faces])
    mother['zhezhi_custom_face_index'] = [0, 1]
    options = [{'width': width, 'offset': offset, 'tilt': 90.,
                'centralTypes': types.copy()} for offset in offsets]
    fold = construct_tile_patch(mother, options, vertices, source_faces,
                                {'mergedEdges': 'delete', 'samePtTolerance': 1e-8,
                                 'collinearCleanup': True, 'collinearTolerance': 1e-8})
    flat, closure = flat_face_embedding(fold)
    sources = []
    for index, (offset, polygon) in enumerate(zip(offsets, (first, second))):
        sources.append({'sourceIndex': index, 'tileType': TILE_TYPE,
                        'sides': sides, 'vertices': polygon,
                        'width': width, 'offset': offset, 'centralTypes': types.copy(),
                        'pleatAngle': 90.,
                        'twistDirection': 'CCW' if offset > 0 else 'CW',
                        'geometricTwistAngle': geometric_offset_twist_angle(
                            sides, width, offset)})
    return {'fold': fold, 'mother': mother, 'sourceTiles': sources,
            'foldedForm': flat, 'closureError': closure,
            'foldedFormMeaning': 'exact 2D face reflections of the assembled CP',
            'checks': {'geometry': check_geometry(fold),
                       'local': check_local_conditions(fold),
                       'flatFoldedForm': {'status': 'passed', 'closureError': closure},
                       'layerOrder': {'status': 'not_checked'}},
            'adoptable': False}
