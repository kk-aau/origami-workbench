"""Origamica's MakeQuadMesh graph construction (notebook lines 145010–145752).

This is the indexed quadrilateral *graph* used by later rigid-mesh routines.
The original returns no faces and does not solve a rigid folding. Indices in
this Python/FOLD-style result are zero-based; subtract one from Origamica's
one-based vertex and corner indices when comparing notebook examples.
"""

import math


def _point(value, dimensions, name):
    if (not isinstance(value, (tuple, list)) or len(value) != dimensions
            or any(isinstance(x, bool) or not isinstance(x, (float, int))
                   or not math.isfinite(x) for x in value)):
        raise ValueError(f'{name} 必须是 {dimensions} 个有限数值坐标。')
    return tuple(value)


def _angle(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError('折角必须是有限弧度数值。')
    return value


def make_quad_mesh(nh, nv, *, vertices_fn=None, vertices3d_fn=None,
                   horizontal_type_fn=None, vertical_type_fn=None,
                   horizontal_angle_fn=None, vertical_angle_fn=None,
                   border_override=False, same_pt_tolerance=1e-6):
    """Build the original indexed graph from callbacks ``fn(i, j)``.

    Original vertex order is bottom row left-to-right, then rows upward.
    Every horizontal edge is emitted before every vertical edge. 3D positions
    can be supplied independently; when 2D positions exist, they determine
    which indexed vertices coincide, even if the 3D positions differ.
    """
    if (isinstance(nh, bool) or isinstance(nv, bool)
            or not isinstance(nh, int) or not isinstance(nv, int)
            or nh < 1 or nv < 1):
        raise ValueError('水平与垂直面数必须是正整数。')
    if vertices_fn is None and vertices3d_fn is None:
        raise ValueError('至少需要二维或三维顶点坐标函数。')
    if type(border_override) is not bool:
        raise ValueError('边界覆盖必须是布尔值。')
    if (same_pt_tolerance is not None
            and (isinstance(same_pt_tolerance, bool)
                 or not isinstance(same_pt_tolerance, (int, float))
                 or not math.isfinite(same_pt_tolerance)
                 or same_pt_tolerance < 0)):
        raise ValueError('顶点合并容差必须是非负有限数值，或 None。')

    horizontal_type_fn = horizontal_type_fn or (lambda i, j: 'U')
    vertical_type_fn = vertical_type_fn or (lambda i, j: 'U')
    horizontal_angle_fn = horizontal_angle_fn or (lambda i, j: 0)
    vertical_angle_fn = vertical_angle_fn or (lambda i, j: 0)

    vertices, vertices3d, key_points = [], [], []
    grid = []
    threshold2 = None if same_pt_tolerance is None else same_pt_tolerance ** 2
    for j in range(nv + 1):
        row = []
        for i in range(nh + 1):
            # The notebook selects the 2D callback for identity if available.
            p2 = _point(vertices_fn(i, j), 2, '二维顶点') if vertices_fn else None
            p3 = (_point(vertices3d_fn(i, j), 3, '三维顶点')
                  if vertices3d_fn and p2 is None else None)
            key = p2 if p2 is not None else p3
            match = None
            if threshold2 is not None:
                for k, prior in enumerate(key_points):
                    if math.fsum((a - b) ** 2 for a, b in zip(key, prior)) <= threshold2:
                        match = k
                        break
            if match is None:
                if vertices3d_fn and p3 is None:
                    p3 = _point(vertices3d_fn(i, j), 3, '三维顶点')
                match = len(vertices)
                key_points.append(key)
                vertices.append(p2 if p2 is not None else (i, j))
                vertices3d.append(p3 if p3 is not None else (i, j, 0))
            row.append(match)
        grid.append(row)

    edges, types, angles = [], [], []
    seen = set()

    def append_edge(a, b, assignment, fold_angle):
        if a == b or frozenset((a, b)) in seen:
            return
        if not isinstance(assignment, str) or not assignment:
            raise ValueError('折线类型必须是非空字符串。')
        seen.add(frozenset((a, b)))
        edges.append((a, b))
        types.append(assignment)
        angles.append(_angle(fold_angle))

    for j in range(nv + 1):
        for i in range(nh):
            border = border_override and j in (0, nv)
            append_edge(grid[j][i], grid[j][i + 1],
                        'B' if border else horizontal_type_fn(i, j),
                        0 if border else horizontal_angle_fn(i, j))
    for j in range(nv):
        for i in range(nh + 1):
            border = border_override and i in (0, nh)
            append_edge(grid[j][i], grid[j + 1][i],
                        'B' if border else vertical_type_fn(i, j),
                        0 if border else vertical_angle_fn(i, j))

    return {
        'kind': 'origamica-quad-mesh-graph',
        'vertices_coords': vertices,
        'vertices_coords3d': vertices3d,
        'edges_vertices': edges,
        'edges_assignment': types,
        'edges_foldAngleRad': angles,
        'faces_vertices': [],
        'cornerIndices': ((grid[0][0], grid[0][nh]),
                          (grid[nv][0], grid[nv][nh])),
        'indexGrid': grid,
        'samePtTolerance': same_pt_tolerance,
        'globalRigidFoldingChecked': False,
    }
