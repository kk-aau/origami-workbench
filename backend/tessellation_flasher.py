"""Numerical 2D seed geometry for Origamica's planar MakeFlasher.

The notebook's MakeFlasher (In[4193]) solves an isometry-constrained CP/FF
pair with FindRoot. This module implements only its explicit, independently
checkable FlasherDefaultCPRules / FlasherSectorQuads /
FlasherSectorTriangles / X, Y, or Z diagonal seed.
It deliberately does not return an assigned crease pattern or folded form.
"""

import math


def flasher_default_cp_point(i, j, k, m):
    """In[4099]: ideal zero-thickness 2D CP *initial guess* p[i,j,k]."""
    if any(isinstance(v, bool) or not isinstance(v, int) for v in (i, j, k, m)) or m < 3:
        raise ValueError('Flasher 点索引和旋转阶须为整数，且 m≥3。')
    t = math.tan(math.pi / m)
    turn = 2 * math.pi / m
    x, y = 1 / (2 * t), .5
    if i + 1 >= j:
        x += (i + 1) * math.cos(math.pi / 2 + turn) + t * j * math.cos(turn)
        y += (i + 1) * math.sin(math.pi / 2 + turn) + t * j * math.sin(turn)
    else:
        x -= t * (i + 1)
        y += j
    x, y = t * x, t * y
    angle = turn * (k % m)
    c, s = math.cos(angle), math.sin(angle)
    return [c * x - s * y, s * x + c * y]


def _wrap(index, m):
    """In[4097]/In[4098]: p[-1,j,k] aliases p[j,0,k-1]."""
    i, j, k = index
    return (j, 0, (k - 1) % m) if i == -1 else (i, j, k % m)


def flasher_sector_quads(r, h, m, k=0):
    """In[4116]: ordered major then minor quadrilateral index tuples."""
    if any(isinstance(v, bool) or not isinstance(v, int) for v in (r, h, m, k)):
        raise ValueError('Flasher 圈数、高度阶、旋转阶和扇区须为整数。')
    if r < 1 or h < 1 or m < 3 or r * h > 24 or m * r * h * (r * h + 1) > 4096 or not 0 <= k < m:
        raise ValueError('Flasher 参考范围要求 r,h≥1、m≥3、0≤k<m，且规模受限。')
    n = r * h
    quads = []
    for ig in range(r):
        j = h * ig
        for i in range(j, n + 1):
            if min(j + h, i) > j:
                quad = ((i, j, k), (i - 1, j, k),
                        (i - 1, min(j + h, i), k),
                        (i, min(j + h, i + 1), k))
                quads.append(tuple(_wrap(v, m) for v in quad))
    for ig in range(r):
        i = h * ig - 1
        for j in range(h * ig + 1, n + 1):
            if min(i + h, j - 2) > i:
                quad = ((i, j, k), (i, j - 1, k),
                        (min(i + h, j - 2), j - 1, k),
                        (min(i + h, j - 1), j, k))
                quads.append(tuple(_wrap(v, m) for v in quad))
    return quads


def flasher_sector_triangles(r, h, m, k=0):
    """In[4118]: four triangular facets per sector at quad limits."""
    flasher_sector_quads(r, h, m, k)
    triangles = []
    for ig in range(r):
        j = h * ig
        i = j
        triangles.append(tuple(_wrap(v, m) for v in
                               ((i, j, k), (i - 1, j, k), (i, i + 1, k))))
    for ig in range(r):
        i = h * ig - 1
        j = h * ig + 1
        triangles.append(tuple(_wrap(v, m) for v in
                               ((i, j, k), (i, j - 1, k), (j - 1, j, k))))
    return triangles


def flasher_x_diagonal_picks(r, h, m):
    """In[4122]: X's row/column parity on In[4116]'s ordered quads.

    The notebook maps minor rows before major rows for drawing.  Returning
    picks in source quad order lets both the seed and the solver use the same
    diagonal per face without treating that drawing order as geometry.
    """
    quads = flasher_sector_quads(r, h, m)
    major_count = (len(quads) + r) // 2
    minor_count = major_count - r
    picks = [None] * len(quads)
    for first, count, width in ((major_count, minor_count, r * h - 1),
                                (0, major_count, r * h)):
        source_index = first
        row = 1
        while width > 0:
            for column in range(1, width + 1):
                choose_13 = (column + (h - 1) * (row - 1) + 1) % 2 == 0
                picks[source_index] = '13' if choose_13 else '24'
                source_index += 1
            width -= h
            row += 1
        if source_index != first + count:
            raise ValueError('Flasher X 行划分与原四边形顺序不符。')
    if any(pick is None for pick in picks):
        raise ValueError('Flasher X 对角线覆盖不完整。')
    return picks


def flasher_ideal_cp_seed(r, h, m, diagonal='Y'):
    """Reference topology and ideal CP initial coordinates, never a solved CP.

    Y selects vertices 1↔3, Z selects 2↔4, and X alternates according to
    In[4122]'s row/column parity. Faces also include In[4118]'s triangles.
    """
    if diagonal not in ('X', 'Y', 'Z'):
        raise ValueError('Flasher 轻折线方向须为 X、Y 或 Z。')
    # Validate before allocating a potentially large reference graph.
    flasher_sector_quads(r, h, m)
    x_picks = flasher_x_diagonal_picks(r, h, m) if diagonal == 'X' else None
    index_map = {}
    vertices = []
    labels = []

    def vertex(index):
        if index not in index_map:
            index_map[index] = len(vertices)
            labels.append(list(index))
            vertices.append(flasher_default_cp_point(*index, m))
        return index_map[index]

    quads = []
    faces = []
    diagonals = []
    for k in range(m):
        for source_index, references in enumerate(flasher_sector_quads(r, h, m, k)):
            quad = [vertex(index) for index in references]
            quads.append(quad)
            if diagonal == 'Y' or x_picks is not None and x_picks[source_index] == '13':
                a, b = quad[0], quad[2]
                faces.extend(([quad[0], quad[1], quad[2]],
                              [quad[0], quad[2], quad[3]]))
            else:
                a, b = quad[1], quad[3]
                faces.extend(([quad[0], quad[1], quad[3]],
                              [quad[1], quad[2], quad[3]]))
            diagonals.append([a, b])
    source_triangles = []
    for k in range(m):
        for references in flasher_sector_triangles(r, h, m, k):
            face = [vertex(index) for index in references]
            source_triangles.append(face)
            faces.append(face)
    center = [vertex((0, 0, k)) for k in range(m)]
    return {
        'kind': 'flasher-ideal-cp-seed',
        'sourceFunctions': ['FlasherDefaultCPRules', 'FlasherSectorQuads',
                            'FlasherSectorTriangles',
                            'FlasherSectorDiagFoldLines' + diagonal],
        'rings': r, 'heightOrder': h, 'rotationalOrder': m,
        'radialOrder': r * h, 'diagonal': diagonal,
        'vertices_coords': vertices, 'vertex_ijk': labels,
        'quads_vertices': quads, 'faces_vertices': faces,
        'source_triangles_vertices': source_triangles,
        'light_diagonals_vertices': diagonals,
        'center_vertices': center,
        'deployedPattern': False,
        'solvedCreasePattern': False,
        'mountainValleyAssigned': False,
        'foldedForm': False,
        'isometryVerified': False,
    }
