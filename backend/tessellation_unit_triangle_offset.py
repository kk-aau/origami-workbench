"""Origamica's named UnitTriangleOffsetTwistTile, In[3038–3039].

The tile delegates to PolygonOffsetTwistTile.  Its perpendicular pleats are
constructed by directed-line intersections, rather than by the conflicting
printed formula for UnitTriangleOffsetTwistAngle (see the audit document).
Angles at this Python boundary are degrees.  The returned 2D folded form is
a face-reflection embedding; a consistent global layer order is separate.
"""
import math

from tessellation_tile_twist import polygon_pleat_tile
from tessellation_unit_triangle_centered import unit_triangle_vertices


TILE_TYPE = 'UnitTriangleOffsetTwistTile'


def _angle_factor(angles):
    # Validate the triangle by the same source-coordinate contract as the
    # named centered tile.  In[3030]/In[3032] use all three resolved angles.
    unit_triangle_vertices(angles)
    a, b = (math.radians(value) for value in angles[:2])
    c = math.radians(180. - angles[0] - angles[1])
    return (math.sin(a)*math.sin(b)*math.sin(c) /
            (1. + math.cos(a)*math.cos(b)*math.cos(c)))


def unit_triangle_offset_twist_angle(angles, width, offset):
    """Return the geometric central twist angle in degrees, 0 < alpha < 180.

    This is the inverse of source In[3032] and agrees with saved Out[3031].
    Source In[3030] has a conflicting two-argument ArcTan expression.
    """
    factor = _angle_factor(angles)
    if (isinstance(width, bool) or not isinstance(width, (int, float)) or
            not math.isfinite(width) or width <= 0 or
            isinstance(offset, bool) or not isinstance(offset, (int, float)) or
            not math.isfinite(offset)):
        raise ValueError('褶宽须为正有限数字，偏置须为有限数字。')
    return math.degrees(math.atan2(width*factor, 2*offset))


def unit_triangle_offset_twist_tile(angles, width, offset, central_types):
    """Construct one named tile's CP, mother triangle and source parameters."""
    vertices = unit_triangle_vertices(angles)
    if (not isinstance(central_types, list) or len(central_types) != 3 or
            any(kind not in ('M', 'V') for kind in central_types)):
        raise ValueError('三条中心边须逐条指定 M 或 V。')
    angle = unit_triangle_offset_twist_angle(angles, width, offset)
    fold, mother, details = polygon_pleat_tile(
        vertices, width, offset, 90., central_types, clockwise=offset <= 0)
    return fold, mother, {
        'tileType': TILE_TYPE, 'angles': list(angles),
        'resolvedAngles': [angles[0], angles[1], 180.-angles[0]-angles[1]],
        'vertices': vertices, 'width': width, 'offset': offset,
        'centralTypes': central_types.copy(),
        'pleatAngle': 90., 'twistDirection': 'CCW' if offset > 0 else 'CW',
        'twistAngle': angle, 'twistRotation': 90.-angle,
        'shrinkage': width/math.sin(math.radians(angle)),
        'centralVertices': details['centralVertices'],
        'layerOrder': 'not_checked', 'adoptable': False,
    }


def original_triangle_offset_pair():
    """Rebuild the two source tiles of saved In[3039] joined on side 2.

    Source tile 2 is a half-turn of tile 1 about the midpoint of side 2.
    CP and its face-reflection FF are checked without assuming a layer order.
    """
    from tessellation_patterns import make_fold
    from tessellation_tile_patch import construct_tile_patch
    from tessellation_flat_embedding import flat_face_embedding
    from tessellate import check_geometry, check_local_conditions

    angles, width, offsets, types = [50., 60., 70.], .1, (.05, -.05), ['M']*3
    first = unit_triangle_vertices(angles)
    second = [[first[1][axis]+first[2][axis]-point[axis] for axis in (0, 1)]
              for point in first]
    # Validate both directed local pleat constructions before joining them.
    for offset in offsets:
        unit_triangle_offset_twist_tile(angles, width, offset, types)
    vertices = first + [second[0]]
    source_faces = [[0, 1, 2], [3, 2, 1]]
    mother = make_fold(vertices, [[0, 1], [1, 2], [2, 0], [2, 3], [3, 1]],
                       ['B']*5, [face[::-1] for face in source_faces])
    mother['zhezhi_custom_face_index'] = [0, 1]
    choices = [{'width': width, 'offset': offset, 'tilt': 90.,
                'centralTypes': types.copy()} for offset in offsets]
    fold = construct_tile_patch(mother, choices, vertices, source_faces,
                                {'mergedEdges': 'delete', 'samePtTolerance': 1e-8,
                                 'collinearCleanup': True, 'collinearTolerance': 1e-8})
    flat, closure = flat_face_embedding(fold)
    sources = []
    for index, (offset, polygon) in enumerate(zip(offsets, (first, second))):
        alpha = unit_triangle_offset_twist_angle(angles, width, offset)
        sources.append({'sourceIndex': index, 'tileType': TILE_TYPE,
                        'angles': angles.copy(), 'vertices': polygon,
                        'width': width, 'offset': offset,
                        'centralTypes': types.copy(), 'pleatAngle': 90.,
                        'twistDirection': 'CCW' if offset > 0 else 'CW',
                        'twistAngle': alpha})
    return {'fold': fold, 'mother': mother, 'sourceTiles': sources,
            'foldedForm': flat, 'closureError': closure,
            'foldedFormMeaning': 'exact 2D face reflections of the assembled CP',
            'checks': {'geometry': check_geometry(fold),
                       'local': check_local_conditions(fold),
                       'flatFoldedForm': {'status': 'passed', 'closureError': closure},
                       'layerOrder': {'status': 'not_checked'}},
            'adoptable': False}
