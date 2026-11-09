"""Origamica's degree-four local flat-foldability (LFF) relation graph.

The notebook's MakeTLFFGraph represents every crease edge by its midpoint.
For each interior degree-four vertex with a unique smallest sector it joins
the two creases surrounding that sector with an anto (-1) relation and those
surrounding the largest sector with an iso (+1) relation. These are necessary
local M/V constraints, not a global flat-foldability certificate.
"""

from __future__ import annotations

import math


ANGLE_TOLERANCE_DEG = 0.001


def check_vertex_against_assignment(vertex, p1, p2, p3, p4) -> tuple[bool, float, float, float, float]:
    """Origamica's BLB check, with ``p1`` the odd crease and points CCW.

    The notebook returns ``{Min[a1,a4] <= Min[a2,a3], a1,a2,a3,a4}``,
    where ``RotationAngle`` gives the unsigned angle in radians.
    """
    rays = [(p[0] - vertex[0], p[1] - vertex[1]) for p in (p1, p2, p3, p4)]
    if any(math.hypot(*ray) == 0 for ray in rays):
        raise ValueError('BLB 顶点与相邻点不能重合。')
    angles = tuple(
        math.atan2(abs(a[0] * b[1] - a[1] * b[0]), a[0] * b[0] + a[1] * b[1])
        for a, b in zip(rays, rays[1:] + rays[:1])
    )
    return (min(angles[0], angles[3]) <= min(angles[1], angles[2]), *angles)


def analyze_lff_graph(fold: dict, *, geometry_status: str | None = None) -> dict:
    """Return the LFF midpoint graph and compare its parities to assigned M/V.

    ``graphVertices[i]`` is the midpoint of ``fold.edges_vertices[i]``;
    ``graphEdges[j]`` references those original edge indices, and
    ``edgeTypes[j]`` is -1 for opposite (anto) or +1 for equal (iso).
    No constraint is asserted if the plane mesh or the four-valent,
    Kawasaki, unique-minimum sector preconditions are not established.
    """
    coords = fold['vertices_coords']
    edges = fold['edges_vertices']
    assignments = fold['edges_assignment']
    if len(edges) != len(assignments):
        raise ValueError('LFF 分析要求每条边都有一个折痕赋型。')
    if geometry_status is None:
        from tessellate import check_geometry

        geometry_status = check_geometry(fold)['status']

    base = {
        'status': 'not_applicable',
        'scope': 'Origamica degree-four local M/V constraints; no global layer order or fold-path proof',
        'interiorVertices': 0,
        'checkedVertices': 0,
        'toleranceDeg': ANGLE_TOLERANCE_DEG,
        'graphVertices': [],
        'graphEdges': [],
        'edgeTypes': [],
        'constraintVertices': [],
        'assignmentViolations': [],
        'unassignedConstraints': [],
    }
    if geometry_status != 'passed':
        return {**base, 'reason': 'invalid_geometry'}
    if not any(assignment in ('M', 'V', 'U') for assignment in assignments):
        return {**base, 'reason': 'no_crease_pattern'}

    incident: list[list[tuple[int, int]]] = [[] for _ in coords]
    boundary: set[int] = set()
    for edge_index, ((u, v), assignment) in enumerate(zip(edges, assignments)):
        incident[u].append((v, edge_index))
        incident[v].append((u, edge_index))
        if assignment == 'B':
            boundary.update((u, v))
    interior = [i for i in range(len(coords)) if i not in boundary]
    base['interiorVertices'] = len(interior)
    if not interior:
        return {**base, 'reason': 'no_interior_vertices'}

    non_four = [i for i in interior if len(incident[i]) != 4]
    if non_four:
        return {**base, 'reason': 'non_four_valent_vertices', 'problemVertices': non_four}

    stars: list[tuple[int, list[tuple[int, int]], list[float], int, int]] = []
    problems: list[dict] = []
    for vertex in interior:
        x, y = coords[vertex]
        rays = sorted(
            incident[vertex],
            key=lambda item: math.atan2(coords[item[0]][1] - y, coords[item[0]][0] - x),
        )
        angles = [math.atan2(coords[n][1] - y, coords[n][0] - x) for n, _ in rays]
        sectors = [math.degrees((angles[(i + 1) % 4] - angles[i]) % math.tau) for i in range(4)]
        if any(a <= ANGLE_TOLERANCE_DEG or a >= 180 - ANGLE_TOLERANCE_DEG for a in sectors):
            problems.append({'vertex': vertex, 'reason': 'degenerate_sector'})
            continue
        kawasaki_error = abs(sectors[0] + sectors[2] - 180)
        if kawasaki_error > ANGLE_TOLERANCE_DEG:
            problems.append({'vertex': vertex, 'reason': 'kawasaki', 'errorDeg': kawasaki_error})
            continue
        order = sorted(range(4), key=lambda i: (sectors[i], i))
        if (sectors[order[1]] - sectors[order[0]] <= ANGLE_TOLERANCE_DEG
                or sectors[order[3]] - sectors[order[2]] <= ANGLE_TOLERANCE_DEG):
            problems.append({'vertex': vertex, 'reason': 'non_unique_extreme_sector', 'sectorsDeg': sectors})
            continue
        stars.append((vertex, rays, sectors, order[0], order[3]))
    if problems:
        return {**base, 'reason': 'ambiguous_or_nonflat_stars', 'problemVertices': problems}

    graph_vertices = [[(coords[u][0] + coords[v][0]) / 2, (coords[u][1] + coords[v][1]) / 2] for u, v in edges]
    graph_edges: list[list[int]] = []
    edge_types: list[int] = []
    owners: list[int] = []
    violations: list[int] = []
    unknown: list[int] = []
    for vertex, rays, _sectors, minimum, maximum in stars:
        for sector, parity in ((minimum, -1), (maximum, +1)):
            pair = [rays[sector][1], rays[(sector + 1) % 4][1]]
            index = len(graph_edges)
            graph_edges.append(pair)
            edge_types.append(parity)
            owners.append(vertex)
            a, b = (assignments[i] for i in pair)
            if a not in ('M', 'V') or b not in ('M', 'V'):
                unknown.append(index)
            elif (a == b) != (parity == 1):
                violations.append(index)
    return {
        **base,
        'status': 'failed' if violations else 'incomplete' if unknown else 'passed',
        **({'reason': 'necessary_condition_conflict'} if violations else {}),
        'checkedVertices': len(stars),
        'graphVertices': graph_vertices,
        'graphEdges': graph_edges,
        'edgeTypes': edge_types,
        'constraintVertices': owners,
        'assignmentViolations': violations,
        'unassignedConstraints': unknown,
    }
