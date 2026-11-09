"""Named four-sided unit-cyclic centered twists from Origamica In[3041/3044].

For an even-order cyclic polygon the notebook ignores the last two supplied
angles.  Here n=4 is reconstructed from the first two angles, the unit first
edge, and the requested length of side 2, 3, or 4.  This is a bounded
subdomain of UnitCyclicPolygonVertices, not the extra Brocard constraint.
"""

import math

from tessellation_split_exact import centered_tilt, unit_quadrilateral_vertices
from tessellation_tile_twist import polygon_pleat_tile


CENTERED_TYPE = 'UnitCyclicPolygonCenteredTwistTile'
ALT_TYPE = 'UnitCyclicPolygonCenteredTwistAltTile'
SAVED_ANGLES = [75., 85., 95., 105.]
SAVED_SIDE = 1.2
SAVED_SIDE_INDEX = 2
SAVED_WIDTH = .1


def unit_cyclic_quadrilateral_info(angles, side, side_index):
    """The n=4 case of In[373]/In[378], with explicit ignored-angle data.

    n=4 enforces opposite supplementary interior angles, so the source's
    first A,B give (A,B,180-A,180-B).  The remaining side length fixes the
    one free cyclic-quadrilateral parameter.  The first edge is (0,0)-(1,0).
    """
    if (not isinstance(angles, (list, tuple)) or len(angles) != 4 or
            any(isinstance(value, bool) or not isinstance(value, (int, float)) or
                not math.isfinite(value) for value in angles)):
        raise ValueError('该具名子域需四个有限内角；末两角只作来源记录。')
    first, second = map(float, angles[:2])
    effective = [first, second, 180-first, 180-second]
    vertices = unit_quadrilateral_vertices(effective, side, side_index)
    px, py = vertices[2]
    if py <= 1e-10:
        raise ValueError('圆内接四边形退化。')
    center = [.5, (px*px + py*py - px)/(2*py)]
    radius = math.hypot(*center)
    if any(abs(math.dist(point, center)-radius) > 1e-8 for point in vertices):
        raise ValueError('推得顶点不满足同圆约束。')
    return {'vertices': vertices, 'circumcenter': center,
            'circumradius': radius, 'inputAngles': list(angles),
            'effectiveAngles': effective, 'side': float(side),
            'sideIndex': int(side_index)}


def _named_tile(angles, side, side_index, width, angle, central_types, alternate):
    info = unit_cyclic_quadrilateral_info(angles, side, side_index)
    if (not isinstance(central_types, list) or len(central_types) != 4 or
            any(kind not in ('M', 'V') for kind in central_types)):
        raise ValueError('四条中心边须逐条指定 M 或 V。')
    if (isinstance(width, bool) or not isinstance(width, (int, float)) or
            not math.isfinite(width) or not .05 <= width <= .8):
        raise ValueError('褶宽须为 0.05–0.8 的有限数字。')
    if (isinstance(angle, bool) or not isinstance(angle, (int, float)) or
            not math.isfinite(angle) or not 1 <= angle < 90):
        raise ValueError('该受限子域仅支持 1°–90° 的锐角褶角或扭角。')
    tilt = centered_tilt(width, angle) if alternate else float(angle)
    fold, mother, details = polygon_pleat_tile(
        info['vertices'], width, 0., tilt, central_types, clockwise=False)
    source = {**info, 'tileType': ALT_TYPE if alternate else CENTERED_TYPE,
              'width': float(width), 'centralTypes': central_types.copy(),
              'pleatAngle': tilt, 'centralVertices': details['centralVertices'],
              'layerOrder': 'not_checked', 'adoptable': False}
    if alternate:
        source['twistAngle'] = float(angle)
    return fold, mother, source


def unit_cyclic_centered_twist_tile(angles, side, side_index, width,
                                   pleat_angle, central_types):
    """Named In[3041] four-sided subdomain; angles are in degrees."""
    return _named_tile(angles, side, side_index, width, pleat_angle,
                       central_types, False)


def unit_cyclic_centered_twist_alt_tile(angles, side, side_index, width,
                                       twist_angle, central_types):
    """Named In[3044] four-sided subdomain; angles are in degrees."""
    return _named_tile(angles, side, side_index, width, twist_angle,
                       central_types, True)


def original_cyclic_centered_pair(alternate=False):
    """Rebuild In[3042] or In[3045] by joining side 2 to side 2."""
    from tessellation_patterns import make_fold
    from tessellation_tile_patch import construct_tile_patch
    from tessellation_flat_embedding import flat_face_embedding
    from tessellate import check_geometry, check_local_conditions

    angle = 30. if alternate else 80.
    builder = unit_cyclic_centered_twist_alt_tile if alternate else unit_cyclic_centered_twist_tile
    kinds = [['M']*4, ['V']*4]
    for assignment in kinds:
        builder(SAVED_ANGLES, SAVED_SIDE, SAVED_SIDE_INDEX,
                SAVED_WIDTH, angle, assignment)
    info = unit_cyclic_quadrilateral_info(SAVED_ANGLES, SAVED_SIDE, SAVED_SIDE_INDEX)
    first = info['vertices']
    second = [[first[1][axis]+first[2][axis]-point[axis] for axis in (0, 1)]
              for point in first]
    vertices = first + [second[0], second[3]]
    source_faces = [[0, 1, 2, 3], [4, 2, 1, 5]]
    edges = [[0,1],[1,2],[2,3],[3,0],[4,2],[1,5],[5,4]]
    mother = make_fold(vertices, edges, ['B']*len(edges),
                       [face[::-1] for face in source_faces])
    mother['zhezhi_custom_face_index'] = [0, 1]
    choices = []
    for assignment in kinds:
        option = {'width': SAVED_WIDTH, 'offset': 0.,
                  'centralTypes': assignment.copy()}
        option.update({'angleMode': 'twist', 'twistAngle': angle} if alternate
                      else {'tilt': angle})
        choices.append(option)
    fold = construct_tile_patch(
        mother, choices, vertices, source_faces,
        {'mergedEdges': 'delete', 'samePtTolerance': 1e-8,
         'collinearCleanup': True, 'collinearTolerance': 1e-8},
    )
    flat, closure = flat_face_embedding(fold)
    sources = []
    for index, (polygon, assignment) in enumerate(zip((first, second), kinds)):
        center = (info['circumcenter'] if index == 0 else
                  [first[1][axis]+first[2][axis]-info['circumcenter'][axis]
                   for axis in (0, 1)])
        source = {**info, 'sourceIndex': index, 'vertices': polygon,
                  'circumcenter': center,
                  'tileType': ALT_TYPE if alternate else CENTERED_TYPE,
                  'width': SAVED_WIDTH, 'centralTypes': assignment.copy(),
                  'pleatAngle': centered_tilt(SAVED_WIDTH, angle) if alternate else angle}
        if alternate:
            source['twistAngle'] = angle
        sources.append(source)
    return {'fold': fold, 'mother': mother, 'sourceTiles': sources,
            'foldedForm': flat, 'closureError': closure,
            'foldedFormMeaning': 'exact 2D face reflections of assembled CP',
            'checks': {'geometry': check_geometry(fold),
                       'local': check_local_conditions(fold),
                       'flatFoldedForm': {'status': 'passed', 'closureError': closure},
                       'layerOrder': {'status': 'not_checked'}},
            'adoptable': False}
