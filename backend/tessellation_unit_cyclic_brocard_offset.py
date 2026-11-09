"""Named Origamica UnitCyclicBrocardPolygonOffsetTwistTile, In[3047–3048].

The source selects CCW/CW Brocard information from the sign of w and d,
then delegates its vertices to PolygonOffsetTwistTile.  The existing numeric
Brocard solver uses the opposite center label convention: its clockwise=True
point matches the notebook's InfoCCW formula, while the polygon vertices
are the same.  This adapter records the source labels explicitly.
"""
import math

from tessellation_brocard import cyclic_brocard_polygon
from tessellation_tile_twist import polygon_pleat_tile


TILE_TYPE = 'UnitCyclicBrocardPolygonOffsetTwistTile'
SAVED_SHAPE = [5, 110., 90., 1, 2]
SAVED_WIDTH = .2
SAVED_OFFSET = .15


def unit_cyclic_brocard_offset_tile(shape, width, offset, central_types):
    """Construct one named tile from source {n,angle1,angle2,i1,i2}.

    Angle inputs are degrees; corner indices are source-style one-based.
    The returned 2D CP has not had its global layer order solved.
    """
    if not isinstance(shape, (list, tuple)) or len(shape) != 5:
        raise ValueError('形状参数须为 {n,angle1,angle2,i1,i2}。')
    sides, angle1, angle2, i1, i2 = shape
    if (isinstance(sides, bool) or not isinstance(sides, int) or
            not 3 <= sides <= 12 or
            any(isinstance(index, bool) or not isinstance(index, int) or
                not 1 <= index <= sides for index in (i1, i2)) or i1 == i2):
        raise ValueError('边数及两个不同角位置须有效，角位置从 1 起算。')
    if (not isinstance(central_types, list) or len(central_types) != sides or
            any(kind not in ('M', 'V') for kind in central_types)):
        raise ValueError('每条中心边须逐条指定 M 或 V。')
    if (isinstance(width, bool) or not isinstance(width, (int, float)) or
            not math.isfinite(width) or width <= 0 or
            isinstance(offset, bool) or not isinstance(offset, (int, float)) or
            not math.isfinite(offset)):
        raise ValueError('褶宽须为正有限数字，偏置须为有限数字。')

    source_ccw = offset > 0  # bounded width>0 makes Sign[w]==Sign[d]
    info = cyclic_brocard_polygon(sides, angle1, angle2, i1-1, i2-1,
                                   clockwise=source_ccw)
    fold, mother, detail = polygon_pleat_tile(
        info['vertices'], width, offset, 90., central_types,
        clockwise=not source_ccw)
    return fold, mother, {
        'tileType': TILE_TYPE, 'shape': list(shape),
        'sides': sides, 'angle1': angle1, 'angle2': angle2,
        'sourceCornerIndices': [i1, i2], 'cornerAngles': info['angles'],
        'vertices': info['vertices'], 'circumcenter': info['circumcenter'],
        'circumradius': info['circumradius'], 'brocardCenter': info['center'],
        'sourceBrocardAngle': info['omega'] if source_ccw else 180.-info['omega'],
        'sourceInfoFunction': 'UnitCyclicBrocardPolygonInfoCCW' if source_ccw
                              else 'UnitCyclicBrocardPolygonInfoCW',
        'width': width, 'offset': offset, 'centralTypes': central_types.copy(),
        'pleatAngle': 90., 'twistDirection': 'CCW' if source_ccw else 'CW',
        'centralVertices': detail['centralVertices'],
        'layerOrder': 'not_checked', 'adoptable': False,
    }


def original_cyclic_brocard_offset_pair():
    """Rebuild saved In[3048] by joining both source side-2 edges."""
    from tessellation_patterns import make_fold
    from tessellation_tile_patch import construct_tile_patch
    from tessellation_flat_embedding import flat_face_embedding
    from tessellate import check_geometry, check_local_conditions

    shape, width, offsets, types = SAVED_SHAPE.copy(), SAVED_WIDTH, (
        SAVED_OFFSET, -SAVED_OFFSET), ['M']*5
    local = [unit_cyclic_brocard_offset_tile(shape, width, d, types)
             for d in offsets]
    first, second_local = [item[2]['vertices'] for item in local]
    # Both information functions specify the same cyclic polygon, with
    # different Brocard points.  Verify this before joining the tiles.
    if max(math.dist(a, b) for a, b in zip(first, second_local)) > 1e-8:
        raise ValueError('两种 Brocard 方向给出的外边形状不一致。')
    second = [[first[1][axis]+first[2][axis]-point[axis] for axis in (0, 1)]
              for point in second_local]
    vertices = first + [second[0], second[3], second[4]]
    source_faces = [[0, 1, 2, 3, 4], [5, 2, 1, 6, 7]]
    edges = [[0,1],[1,2],[2,3],[3,4],[4,0],[2,5],[1,6],[6,7],[7,5]]
    mother = make_fold(vertices, edges, ['B']*len(edges),
                       [face[::-1] for face in source_faces])
    mother['zhezhi_custom_face_index'] = [0, 1]
    choices = [{'width': width, 'offset': d, 'tilt': 90.,
                'centralTypes': types.copy()} for d in offsets]
    fold = construct_tile_patch(mother, choices, vertices, source_faces,
                                {'mergedEdges': 'delete', 'samePtTolerance': 1e-8,
                                 'collinearCleanup': True, 'collinearTolerance': 1e-8})
    flat, closure = flat_face_embedding(fold)
    sources = []
    for index, (item, polygon) in enumerate(zip(local, (first, second))):
        source = {**item[2], 'sourceIndex': index, 'vertices': polygon}
        if index == 1:
            for field in ('brocardCenter', 'circumcenter'):
                point = source[field]
                source[field] = [first[1][axis]+first[2][axis]-point[axis]
                                 for axis in (0, 1)]
        sources.append(source)
    return {'fold': fold, 'mother': mother, 'sourceTiles': sources,
            'foldedForm': flat, 'closureError': closure,
            'foldedFormMeaning': 'exact 2D face reflections of the assembled CP',
            'checks': {'geometry': check_geometry(fold),
                       'local': check_local_conditions(fold),
                       'flatFoldedForm': {'status': 'passed', 'closureError': closure},
                       'layerOrder': {'status': 'not_checked'}},
            'adoptable': False}
