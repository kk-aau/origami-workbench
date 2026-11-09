"""Named Origamica unit-triangle centered twists, saved In[3025]/In[3028].

Origamica's RenderTile first calls UnitTriangleVertices, then delegates to
PolygonCenteredTwistTile (or its twist-angle alternate).  The generic CP
constructor remains responsible for directed pleat intersections and M/V.
This module keeps the triangle-angle input and named source tile identity.
"""
import math

from tessellation_tile_twist import polygon_pleat_tile


CENTERED_TYPE = 'UnitTriangleCenteredTwistTile'
ALT_TYPE = 'UnitTriangleCenteredTwistAltTile'


def unit_triangle_vertices(angles):
    """In[366]: base (0,0)–(1,0), upper vertex sin(B)/sin(C) (cos(A),sin(A)).

    The notebook ignores a supplied third angle.  This bounded named API
    requires it to agree with the derived C when one is supplied.
    """
    if (not isinstance(angles, (list, tuple)) or len(angles) not in (2, 3) or
            any(isinstance(angle, bool) or not isinstance(angle, (int, float)) or
                not math.isfinite(angle) for angle in angles)):
        raise ValueError('单位三角形需给出 2 或 3 个有限角度。')
    left, right = angles[:2]
    upper = 180. - left - right
    if min(left, right, upper) < 1.:
        raise ValueError('三角形的三个内角均须至少为 1°。')
    if len(angles) == 3 and not math.isclose(angles[2], upper, rel_tol=0., abs_tol=1e-8):
        raise ValueError('第三角须等于 180° 减去前两个角。')
    b = math.sin(math.radians(right)) / math.sin(math.radians(upper))
    return [[0., 0.], [1., 0.],
            [b*math.cos(math.radians(left)), b*math.sin(math.radians(left))]]


def _named_tile(angles, width, angle, central_types, alternate):
    from tessellation_split_exact import centered_tilt

    vertices = unit_triangle_vertices(angles)
    if not isinstance(central_types, list) or len(central_types) != 3 or any(
            kind not in ('M', 'V') for kind in central_types):
        raise ValueError('三条中心边须逐条指定 M 或 V。')
    if (isinstance(width, bool) or not isinstance(width, (int, float)) or
            not math.isfinite(width)):
        raise ValueError('褶宽须为有限数字。')
    if isinstance(angle, bool) or not isinstance(angle, (int, float)) or not math.isfinite(angle):
        raise ValueError('褶角或扭角须为有限数字。')
    if alternate and not 1 <= angle < 90:
        raise ValueError('Alt 扭角当前仅支持 1°–90° 的锐角子域。')
    tilt = centered_tilt(width, angle) if alternate else angle
    fold, mother, details = polygon_pleat_tile(
        vertices, width, 0., tilt, central_types, clockwise=tilt >= 90)
    info = {'tileType': ALT_TYPE if alternate else CENTERED_TYPE,
            'angles': list(angles), 'resolvedAngles': [angles[0], angles[1],
                                                     180.-angles[0]-angles[1]],
            'vertices': vertices, 'width': width, 'centralTypes': central_types.copy(),
            'pleatAngle': tilt, 'centralVertices': details['centralVertices'],
            'layerOrder': 'not_checked', 'adoptable': False}
    if alternate:
        info['twistAngle'] = angle
    return fold, mother, info


def unit_triangle_centered_twist_tile(angles, width, pleat_angle, central_types):
    """Named centered pleat-angle form, In[3024]. Angles are degrees."""
    return _named_tile(angles, width, pleat_angle, central_types, False)


def unit_triangle_centered_twist_alt_tile(angles, width, twist_angle, central_types):
    """Named alternate twist-angle form, In[3027]. Angles are degrees."""
    return _named_tile(angles, width, twist_angle, central_types, True)


def original_triangle_centered_pair(alternate=False):
    """Rebuild saved two-tile In[3025] or In[3028] joined on side 2.

    The second source triangle is a half-turn of the first about the shared
    edge midpoint.  This returns CP face reflections, not Origamica's
    rescaled display of FoldedForm2D, and does not solve global layer order.
    """
    from tessellation_patterns import make_fold
    from tessellation_tile_patch import construct_tile_patch
    from tessellation_flat_embedding import flat_face_embedding
    from tessellate import check_geometry, check_local_conditions

    angles, width, angle = [50., 60., 70.], .1, 25. if alternate else 80.
    tile_type = ALT_TYPE if alternate else CENTERED_TYPE
    types = [['M']*3, ['V']*3]
    for assignment in types:
        _named_tile(angles, width, angle, assignment, alternate)
    first = unit_triangle_vertices(angles)
    second = [[first[1][axis]+first[2][axis]-point[axis] for axis in (0, 1)]
              for point in first]
    vertices = first + [second[0]]
    source_faces = [[0, 1, 2], [3, 2, 1]]
    mother = make_fold(vertices, [[0, 1], [1, 2], [2, 0], [2, 3], [3, 1]],
                       ['B']*5, [face[::-1] for face in source_faces])
    mother['zhezhi_custom_face_index'] = [0, 1]
    choices = []
    for assignment in types:
        option = {'width': width, 'offset': 0., 'centralTypes': assignment.copy()}
        option.update({'angleMode': 'twist', 'twistAngle': angle} if alternate else
                      {'tilt': angle})
        choices.append(option)
    fold = construct_tile_patch(mother, choices, vertices, source_faces,
                                {'mergedEdges': 'delete', 'samePtTolerance': 1e-8,
                                 'collinearCleanup': True, 'collinearTolerance': 1e-8})
    flat, closure = flat_face_embedding(fold)
    from tessellation_split_exact import centered_tilt
    tilt = centered_tilt(width, angle) if alternate else angle
    sources = []
    for index, (polygon, assignment) in enumerate(zip((first, second), types)):
        item = {'sourceIndex': index, 'tileType': tile_type, 'angles': angles.copy(),
                'vertices': polygon, 'width': width, 'centralTypes': assignment.copy(),
                'pleatAngle': tilt}
        if alternate:
            item['twistAngle'] = angle
        sources.append(item)
    return {'fold': fold, 'mother': mother, 'sourceTiles': sources,
            'foldedForm': flat, 'closureError': closure,
            'foldedFormMeaning': 'exact 2D face reflections of the assembled CP',
            'checks': {'geometry': check_geometry(fold),
                       'local': check_local_conditions(fold),
                       'flatFoldedForm': {'status': 'passed', 'closureError': closure},
                       'layerOrder': {'status': 'not_checked'}},
            'adoptable': False}
