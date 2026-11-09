"""Stable Origamica UnitRegularPolygonCenteredTwistTile (In[3004–3005]).

The original RenderTile delegates to PolygonCenteredTwistTile with
UnitRegularPolygonVertices[n].  This module preserves that named source and
uses the existing directed-pleat CP and checked tile-patch assembly.
"""
import math

from tessellation_tile_twist import polygon_pleat_tile


TILE_TYPE = 'UnitRegularPolygonCenteredTwistTile'
ALT_TILE_TYPE = 'UnitRegularPolygonCenteredTwistAltTile'


def unit_regular_polygon_vertices(sides):
    """Origamica UnitRegularPolygonCenter/Vertex, first edge unit horizontal."""
    if isinstance(sides, bool) or not isinstance(sides, int) or not 3 <= sides <= 24:
        raise ValueError('单位正多边形需要 3–24 条边。')
    half = math.pi/sides
    center = [0.5, 0.5/math.tan(half)]
    vertices = []
    for index in range(sides):
        angle = index*2*half
        x, y = center
        vertices.append([x-x*math.cos(angle)+y*math.sin(angle),
                         y-x*math.sin(angle)-y*math.cos(angle)])
    vertices[0] = [0., 0.]
    vertices[1] = [1., 0.]
    return vertices


def unit_regular_centered_twist_tile(sides, width, pleat_angle, central_types):
    """Build one named unit tile; flat geometry and layers need separate checks."""
    if (not isinstance(central_types, list) or len(central_types) != sides or
            any(kind not in ('M', 'V') for kind in central_types)):
        raise ValueError('每条中心边须逐条指定 M 或 V。')
    polygon = unit_regular_polygon_vertices(sides)
    fold, mother, detail = polygon_pleat_tile(
        polygon, width, 0., pleat_angle, central_types,
        clockwise=pleat_angle >= 90)
    return fold, mother, {
        'tileType': TILE_TYPE, 'sides': sides, 'width': width,
        'pleatAngle': pleat_angle, 'centralTypes': central_types.copy(),
        'vertices': polygon, 'centralVertices': detail['centralVertices'],
        'layerOrder': 'not_checked', 'adoptable': False,
    }


def unit_regular_centered_twist_alt_tile(sides, width, twist_angle, central_types):
    """In[3009]: named twist-angle form delegated to PolygonCenteredTwistAltTile.

    The original saved In[3010] uses a 30° acute twist.  Keep this numeric
    adapter in that unambiguous atan branch; other angle branches need their
    own source/geometry comparison.
    """
    from tessellation_split_exact import centered_tilt

    if (isinstance(twist_angle, bool) or not isinstance(twist_angle, (int, float)) or
            not math.isfinite(twist_angle) or not 1 <= twist_angle < 90):
        raise ValueError('Alt 扭角当前仅支持 1°–90° 的锐角子域。')
    if (isinstance(width, bool) or not isinstance(width, (int, float)) or
            not math.isfinite(width) or not .05 <= width <= .8):
        raise ValueError('居中褶宽需在 0.05–0.8 之间。')
    pleat_angle = centered_tilt(width, twist_angle)
    fold, mother, info = unit_regular_centered_twist_tile(
        sides, width, pleat_angle, central_types)
    info.update(tileType=ALT_TILE_TYPE, twistAngle=twist_angle)
    return fold, mother, info


def original_regular_centered_pair():
    """Rebuild In[3005]'s two n=4, w=.2, tau=70°, MMVV tiles at (0,0)/(0,1)."""
    return _original_regular_centered_pair(False)


def original_regular_centered_alt_pair():
    """Rebuild In[3010]'s two n=4, w=.2, alpha=30°, MMVV tiles."""
    return _original_regular_centered_pair(True)


def original_regular_centered_alt_pair_in3079():
    """Rebuild saved In[3079], with the second square's side 4 on side 2.

    Both source tiles use In[3009]'s named Alt constructor: n=4, w=.2,
    alpha=25°, and center types M4/V4.  In[3079]'s JoinTiling[{1,2,1}]
    is distinct from In[3010]'s translated {0,1} second square and from
    In[3019]'s signed-offset pair.
    """
    from tessellation_patterns import make_fold
    from tessellation_tile_patch import construct_tile_patch
    from tessellation_flat_embedding import flat_face_embedding
    from tessellate import check_geometry, check_local_conditions
    from tessellation_split_exact import centered_tilt

    sides, width, twist_angle = 4, .2, 25.
    first = unit_regular_polygon_vertices(sides)
    # JoinTiling[{1,2,1}] maps new vertex 1 to old vertex 2, and new
    # vertex 4 to old vertex 3: the new edge 4 is reversed on old edge 2.
    second = [[1., 0.], [2., 0.], [2., 1.], [1., 1.]]
    types = [['M']*sides, ['V']*sides]
    for assignment in types:
        unit_regular_centered_twist_alt_tile(sides, width, twist_angle,
                                             assignment)
    vertices = first + second[1:3]
    source_faces = [[0, 1, 2, 3], [1, 4, 5, 2]]
    mother = make_fold(
        vertices,
        [[0, 1], [1, 2], [2, 3], [3, 0], [1, 4], [4, 5], [5, 2]],
        ['B']*7, [face[::-1] for face in source_faces],
    )
    mother['zhezhi_custom_face_index'] = [0, 1]
    choices = [
        {'width': width, 'offset': 0., 'angleMode': 'twist',
         'twistAngle': twist_angle, 'centralTypes': assignment.copy()}
        for assignment in types
    ]
    fold = construct_tile_patch(
        mother, choices, vertices, source_faces,
        {'mergedEdges': 'delete', 'samePtTolerance': 1e-8,
         'collinearCleanup': True, 'collinearTolerance': 1e-8},
    )
    flat, closure = flat_face_embedding(fold)
    pleat_angle = centered_tilt(width, twist_angle)
    return {
        'fold': fold, 'mother': mother,
        'sourceInput': 'Origamica In[3079]', 'sourceJoin': [1, 2, 1],
        'sourceTiles': [
            {'sourceIndex': index, 'tileType': ALT_TILE_TYPE,
             'sides': sides, 'width': width, 'twistAngle': twist_angle,
             'pleatAngle': pleat_angle, 'centralTypes': assignment.copy(),
             'vertices': polygon}
            for index, (assignment, polygon) in enumerate(zip(types,
                                                                 (first, second)))
        ],
        'foldedForm': flat, 'closureError': closure,
        'foldedFormMeaning': 'exact 2D face reflections of the assembled CP',
        'checks': {
            'geometry': check_geometry(fold),
            'local': check_local_conditions(fold),
            'flatFoldedForm': {'status': 'passed', 'closureError': closure},
            'layerOrder': {'status': 'not_checked'},
        },
        'adoptable': False,
    }


def _original_regular_centered_pair(alternate):
    from tessellation_patterns import make_fold
    from tessellation_tile_patch import construct_tile_patch
    from tessellation_flat_embedding import flat_face_embedding
    from tessellate import check_geometry, check_local_conditions

    from tessellation_split_exact import centered_tilt

    sides, width, angle, types = 4, .2, 30. if alternate else 70., ['M', 'M', 'V', 'V']
    pleat_angle = centered_tilt(width, angle) if alternate else angle
    tile_type = ALT_TILE_TYPE if alternate else TILE_TYPE
    first = unit_regular_polygon_vertices(sides)
    second = [[point[0], point[1]+1] for point in first]
    vertices = first + [second[2], second[3]]
    source_faces = [[0, 1, 2, 3], [3, 2, 4, 5]]
    mother = make_fold(vertices,
                       [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4], [4, 5], [5, 3]],
                       ['B']*7, [face[::-1] for face in source_faces])
    mother['zhezhi_custom_face_index'] = [0, 1]
    options = []
    for _ in range(2):
        option = dict(width=width, offset=0., centralTypes=types.copy())
        option.update({'angleMode': 'twist', 'twistAngle': angle} if alternate else
                      {'tilt': pleat_angle})
        options.append(option)
    fold = construct_tile_patch(mother, options, vertices, source_faces,
                                {'mergedEdges': 'delete', 'samePtTolerance': 1e-8,
                                 'collinearCleanup': True, 'collinearTolerance': 1e-8})
    flat, closure = flat_face_embedding(fold)
    return {'fold': fold, 'mother': mother, 'foldedForm': flat,
            'closureError': closure,
            'foldedFormMeaning': 'exact 2D face reflections of the assembled CP',
            'sourceTiles': [
                {'sourceIndex': index, 'tileType': tile_type, 'sides': sides,
                 'width': width, 'pleatAngle': pleat_angle,
                 **({'twistAngle': angle} if alternate else {}),
                 'centralTypes': types.copy(), 'vertices': polygon}
                for index, polygon in enumerate((first, second))],
            'checks': {'geometry': check_geometry(fold),
                       'local': check_local_conditions(fold),
                       'flatFoldedForm': {'status': 'passed', 'closureError': closure},
                       'layerOrder': {'status': 'not_checked'}},
            'adoptable': False}
