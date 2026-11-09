"""Named Origamica unit-quadrilateral centered split-twist tile variants.

In[3065]/In[3068] convert the unit-angle specification to four vertices and
delegate to the corresponding general quadrilateral split constructor.
This module preserves that source identity and the saved two-tile examples.
Its FoldedForm is a face-reflection embedding of the assembled CP; the
notebook's display alone supplies no global layer-order certificate.
"""

import math

from tessellation_split_exact import centered_tilt, exact_split, unit_quadrilateral_vertices


CENTERED_TYPE = 'UnitQuadrilateralCenteredSplitTwistTile'
ALT_TYPE = 'UnitQuadrilateralCenteredSplitTwistAltTile'
SAVED_ANGLES = [75., 85., 95., 105.]
SAVED_SIDE = 1.2
SAVED_SIDE_INDEX = 2
SAVED_WIDTH = .1
SAVED_PRESERVED_VERTEX = 2  # Origamica's one-based ip.


def _source_polygon(angles, side, side_index):
    if not isinstance(angles, (list, tuple)) or len(angles) not in (3, 4):
        raise ValueError('单位四边形需提供三个或四个内角。')
    polygon = unit_quadrilateral_vertices(list(angles), side, side_index)
    if len(angles) == 4 and (isinstance(angles[3], bool) or
            not isinstance(angles[3], (int, float)) or
            not math.isfinite(angles[3]) or
            not math.isclose(angles[3], 360-sum(angles[:3]), rel_tol=0., abs_tol=1e-8)):
        raise ValueError('第四角必须与前三角推出的值一致。')
    return polygon


def _named_tile(angles, side, side_index, width, angle, preserved_vertex,
                connection, central_types, alternate):
    polygon = _source_polygon(angles, side, side_index)
    if (isinstance(preserved_vertex, bool) or not isinstance(preserved_vertex, int)
            or not 1 <= preserved_vertex <= 4):
        raise ValueError('原版 ip 须为第 1–4 顶点。')
    if connection not in ('M', 'V'):
        raise ValueError('最长新增折痕须为 M 或 V。')
    if (not isinstance(central_types, list) or len(central_types) != 4 or
            any(kind not in ('M', 'V') for kind in central_types)):
        raise ValueError('四条中心边须逐条指定 M 或 V。')
    if (isinstance(width, bool) or not isinstance(width, (int, float)) or
            not math.isfinite(width) or not .05 <= width <= .8):
        raise ValueError('褶宽须为 0.05–0.8 的有限数字。')
    if (isinstance(angle, bool) or not isinstance(angle, (int, float)) or
            not math.isfinite(angle) or not 1 <= angle < 90):
        raise ValueError('该受限子域只支持 1°–90° 的锐角褶角或扭角。')
    tilt = centered_tilt(width, angle) if alternate else float(angle)
    # General In[2949]: d=0, ccw=(tau<pi/2).
    # Alternate In[2960]: tau=CenteredTwistTiltAngle[w,alpha], ccw=(alpha<pi/2).
    fold, mother, details = exact_split(
        polygon, width, 0., tilt, preserved_vertex-1, connection,
        central_types, True,
    )
    source = {
        'tileType': ALT_TYPE if alternate else CENTERED_TYPE,
        'angles': list(angles),
        'resolvedAngles': [*angles[:3], 360-sum(angles[:3])],
        'side': float(side), 'sideIndex': int(side_index),
        'vertices': polygon,
        'width': float(width),
        'preservedVertex': preserved_vertex,
        'connection': connection,
        'centralTypes': central_types.copy(),
        'pleatAngle': tilt,
        'centralVertices': details['centralVertices'],
        'split': details['split'],
        'layerOrder': 'not_checked',
        'adoptable': False,
    }
    if alternate:
        source['twistAngle'] = float(angle)
    return fold, mother, source


def unit_quadrilateral_centered_split_twist_tile(
        angles, side, side_index, width, pleat_angle, preserved_vertex,
        connection, central_types):
    """Named In[3065] form; angles and pleat angle are in degrees."""
    return _named_tile(angles, side, side_index, width, pleat_angle,
                       preserved_vertex, connection, central_types, False)


def unit_quadrilateral_centered_split_twist_alt_tile(
        angles, side, side_index, width, twist_angle, preserved_vertex,
        connection, central_types):
    """Named In[3068] form; angles and twist angle are in degrees."""
    return _named_tile(angles, side, side_index, width, twist_angle,
                       preserved_vertex, connection, central_types, True)


def original_quad_centered_split_pair(alternate=False):
    """Rebuild In[3066] or In[3069] with both named source parameter sets.

    The second tile is rotated 180 degrees about the first tile's side 2
    midpoint, matching JoinTiling[{1,2,2}].  The result does not infer a
    global face order from the notebook's FoldedForm2D picture.
    """
    from tessellation_patterns import make_fold
    from tessellation_tile_patch import construct_tile_patch
    from tessellation_flat_embedding import flat_face_embedding
    from tessellate import check_geometry, check_local_conditions

    angle = 30. if alternate else 80.
    build = (unit_quadrilateral_centered_split_twist_alt_tile if alternate
             else unit_quadrilateral_centered_split_twist_tile)
    types = [['M']*4, ['V']*4]
    for connection, assignment in zip(('M', 'V'), types):
        build(SAVED_ANGLES, SAVED_SIDE, SAVED_SIDE_INDEX, SAVED_WIDTH,
              angle, SAVED_PRESERVED_VERTEX, connection, assignment)

    first = _source_polygon(SAVED_ANGLES, SAVED_SIDE, SAVED_SIDE_INDEX)
    second = [[first[1][axis]+first[2][axis]-point[axis] for axis in (0, 1)]
              for point in first]
    vertices = first + [second[0], second[3]]
    source_faces = [[0, 1, 2, 3], [4, 2, 1, 5]]
    edges = [[0,1],[1,2],[2,3],[3,0],[4,2],[1,5],[5,4]]
    mother = make_fold(vertices, edges, ['B']*len(edges),
                       [face[::-1] for face in source_faces])
    mother['zhezhi_custom_face_index'] = [0, 1]
    choices = []
    for connection, assignment in zip(('M', 'V'), types):
        option = {'construction': 'split', 'width': SAVED_WIDTH,
                  'offset': 0., 'baseVertex': SAVED_PRESERVED_VERTEX-1,
                  'connection': connection, 'centralTypes': assignment.copy()}
        option.update({'angleMode': 'twist', 'twistAngle': angle} if alternate
                      else {'tilt': angle, 'ccw': True})
        choices.append(option)
    fold = construct_tile_patch(
        mother, choices, vertices, source_faces,
        {'mergedEdges': 'delete', 'samePtTolerance': 1e-8,
         'collinearCleanup': True, 'collinearTolerance': 1e-8},
    )
    flat, closure = flat_face_embedding(fold)
    sources = []
    for index, (polygon, assignment, connection) in enumerate(
            zip((first, second), types, ('M', 'V'))):
        entry = {'sourceIndex': index,
                 'tileType': ALT_TYPE if alternate else CENTERED_TYPE,
                 'angles': SAVED_ANGLES.copy(),
                 'resolvedAngles': SAVED_ANGLES.copy(),
                 'side': SAVED_SIDE, 'sideIndex': SAVED_SIDE_INDEX,
                 'vertices': polygon, 'width': SAVED_WIDTH,
                 'preservedVertex': SAVED_PRESERVED_VERTEX,
                 'connection': connection, 'centralTypes': assignment.copy(),
                 'pleatAngle': centered_tilt(SAVED_WIDTH, angle) if alternate else angle}
        if alternate:
            entry['twistAngle'] = angle
        sources.append(entry)
    return {'fold': fold, 'mother': mother, 'sourceTiles': sources,
            'foldedForm': flat, 'closureError': closure,
            'foldedFormMeaning': 'exact 2D face reflections of assembled CP',
            'checks': {'geometry': check_geometry(fold),
                       'local': check_local_conditions(fold),
                       'flatFoldedForm': {'status': 'passed', 'closureError': closure},
                       'layerOrder': {'status': 'not_checked'}},
            'adoptable': False}
