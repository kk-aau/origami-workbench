"""Historical Origamica In[3062–3063] symmetric trapezoid offset twist tile.

The original section is explicitly marked [deprecated].  This module is a
geometry regression, not a stable P03 tiletype completion.
The unit shape comes from UnitBrocardTrapezoidInfo.  The tile then delegates
to PolygonOffsetTwistTile: perpendicular pleats, with CCW iff offset > 0.
The saved two-tile example can be assembled without changing the generic
tile-patch API.  Its 2D folded coordinates have no layer-order certificate.
"""
import math

from tessellation_tile_twist import polygon_pleat_tile


TILE_TYPE = 'UnitSymmetricTrapezoidOffsetTwistTile'


def unit_symmetric_trapezoid_info(base_angle):
    """Return the original unit vertices, positive Brocard point and angle.

    Input and output angles use degrees at the Python boundary.  Origamica's
    analytic side, center and angle equations are at notebook lines
    22870–22990; the first side is (0,0)–(1,0).
    """
    if (isinstance(base_angle, bool) or not isinstance(base_angle, (int, float))
            or not math.isfinite(base_angle) or not 1 <= base_angle <= 179):
        raise ValueError('对称梯形底角须在 1°–179° 之间。')
    delta = math.radians(base_angle)
    cosine, sine = math.cos(delta), math.sin(delta)
    diagonal = -cosine + math.sqrt(2 - sine*sine)
    height = diagonal*sine
    vertices = [[0., 0.], [1., 0.], [1-diagonal*cosine, height],
                [diagonal*cosine, height]]
    brocard_center = [(sine*sine + cosine*math.sqrt(2-sine*sine))/2,
                      height/2]
    brocard_angle = math.degrees(math.asin(sine/math.sqrt(2)))
    return {'tileType': TILE_TYPE, 'baseAngle': float(base_angle),
            'vertices': vertices, 'diagonalSideLength': diagonal,
            'brocardCenter': brocard_center, 'brocardAngle': brocard_angle}


def unit_symmetric_trapezoid_offset_tile(base_angle, width, offset, central_types):
    """Construct one original offset tile as a CP and its mother polygon.

    The generic constructor checks polygon geometry and local flat-fold
    conditions.  It does not solve a global layer order.
    """
    if not isinstance(central_types, list) or len(central_types) != 4 or any(
            kind not in ('M', 'V') for kind in central_types):
        raise ValueError('四条中心边须逐条指定 M 或 V。')
    if (isinstance(offset, bool) or not isinstance(offset, (int, float))
            or not math.isfinite(offset)):
        raise ValueError('偏置须为有限数字。')
    info = unit_symmetric_trapezoid_info(base_angle)
    fold, mother, detail = polygon_pleat_tile(
        info['vertices'], width, offset, 90, central_types, clockwise=offset <= 0)
    return fold, mother, {**info, **detail, 'deprecatedSource': True,
                          'twistDirection': 'CCW' if offset > 0 else 'CW',
                          'layerOrder': 'not_checked', 'adoptable': False}


def original_symmetric_trapezoid_pair():
    """Rebuild In[3063]: two copies joined along side 2, with offsets ±d.

    A half-turn puts the second copy's directed side 2 against the first.
    Source indices and the signed offsets survive graph merge.  CP geometry,
    local M/V, and reflection FF are checked; layer order remains unchecked.
    """
    from tessellation_patterns import make_fold
    from tessellation_tile_patch import construct_tile_patch
    from tessellation_flat_embedding import flat_face_embedding
    from tessellate import check_geometry, check_local_conditions

    base_angle, width, offset = 80., .2, .15
    types = ['M']*4
    info = unit_symmetric_trapezoid_info(base_angle)
    # Validate both local tiles before attempting their shared-edge merge.
    unit_symmetric_trapezoid_offset_tile(base_angle, width, offset, types)
    unit_symmetric_trapezoid_offset_tile(base_angle, width, -offset, types)
    first = info['vertices']
    second = [[first[1][axis]+first[2][axis]-point[axis] for axis in (0, 1)]
              for point in first]
    vertices = first + [second[0], second[3]]
    source_faces = [[0, 1, 2, 3], [4, 2, 1, 5]]
    mother = make_fold(vertices,
                       [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4], [4, 5], [5, 1]],
                       ['B']*7, [face[::-1] for face in source_faces])
    mother['zhezhi_custom_face_index'] = [0, 1]
    choices = [dict(width=width, offset=signed, tilt=90,
                    centralTypes=types.copy()) for signed in (offset, -offset)]
    fold = construct_tile_patch(mother, choices, vertices, source_faces,
                                {'mergedEdges': 'delete', 'samePtTolerance': 1e-8,
                                 'collinearCleanup': True, 'collinearTolerance': 1e-8})
    flat, closure = flat_face_embedding(fold)
    geometry = check_geometry(fold)
    local = check_local_conditions(fold)
    return {'fold': fold, 'mother': mother, 'foldedForm': flat,
            'closureError': closure,
            'foldedFormMeaning': 'exact 2D face reflections of the assembled CP',
            'sourceTiles': [
                {'sourceIndex': index, 'tileType': TILE_TYPE, 'deprecatedSource': True,
                 'baseAngle': float(base_angle),
                 'width': width, 'offset': signed, 'centralTypes': types.copy(),
                 'vertices': polygon}
                for index, (signed, polygon) in enumerate(zip((offset, -offset),
                                                               (first, second)))],
            'checks': {'geometry': geometry, 'local': local,
                       'flatFoldedForm': {'status': 'passed', 'closureError': closure},
                       'layerOrder': {'status': 'not_checked'}},
            'deprecatedSource': True, 'adoptable': False}
