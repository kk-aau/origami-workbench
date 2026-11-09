"""Graph operations used by Origamica's MonolithicEmbedTiling options.

The tile generator owns the fold assignments.  These operations only identify
coincident vertices and erase redundant, equally assigned straight edges;
faces are rebuilt afterwards from the resulting graph.
"""
import math
from collections import defaultdict


def merge_point(point, coordinates, buckets, tolerance):
    """Return a stable vertex index using an absolute SamePtTolerance."""
    if tolerance == 0:
        key = (float(point[0]), float(point[1]))
        if key not in buckets:
            buckets[key] = len(coordinates)
            coordinates.append(list(point))
        return buckets[key]
    cell = (math.floor(point[0] / tolerance), math.floor(point[1] / tolerance))
    matches = []
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for vertex in buckets.get((cell[0] + dx, cell[1] + dy), ()):
                if math.dist(point, coordinates[vertex]) <= tolerance:
                    matches.append(vertex)
    if matches:
        return min(matches)  # preserve the first source tile's coordinates
    index = len(coordinates)
    coordinates.append(list(point))
    buckets.setdefault(cell, []).append(index)
    return index


def cleanup_collinear_edges(coordinates, edges, assignments, tolerance):
    """Suppress degree-two straight vertices without changing an M/V boundary.

    `tolerance` bounds the sine of the angular deviation from a straight
    line.  Endpoints must lie in opposite directions, and the assignments
    must agree.  This avoids erasing a mountain/valley change or a fold node.
    """
    if len(edges) != len(assignments):
        raise ValueError('共线清理需要逐边山谷赋型。')
    current = [tuple(edge) for edge in edges]
    kinds = list(assignments)
    while True:
        adjacency = defaultdict(list)
        edge_keys = set()
        for index, (a, b) in enumerate(current):
            adjacency[a].append(index)
            adjacency[b].append(index)
            edge_keys.add((min(a, b), max(a, b)))
        candidate = None
        for vertex, incident in sorted(adjacency.items()):
            if len(incident) != 2:
                continue
            first, second = incident
            if kinds[first] != kinds[second]:
                continue
            a = next(point for point in current[first] if point != vertex)
            b = next(point for point in current[second] if point != vertex)
            if a == b or (min(a, b), max(a, b)) in edge_keys:
                continue
            p, pa, pb = coordinates[vertex], coordinates[a], coordinates[b]
            ux, uy = pa[0] - p[0], pa[1] - p[1]
            vx, vy = pb[0] - p[0], pb[1] - p[1]
            lu, lv = math.hypot(ux, uy), math.hypot(vx, vy)
            if lu <= 1e-12 or lv <= 1e-12:
                continue
            if ux * vx + uy * vy >= 0:
                continue
            if abs(ux * vy - uy * vx) > tolerance * lu * lv:
                continue
            candidate = (first, second, a, b, kinds[first])
            break
        if candidate is None:
            break
        first, second, a, b, assignment = candidate
        current = [edge for i, edge in enumerate(current) if i not in (first, second)]
        kinds = [kind for i, kind in enumerate(kinds) if i not in (first, second)]
        current.append((a, b))
        kinds.append(assignment)
    used = sorted({vertex for edge in current for vertex in edge})
    remap = {vertex: index for index, vertex in enumerate(used)}
    return ([coordinates[index] for index in used],
            [(remap[a], remap[b]) for a, b in current], kinds)
