"""Keep whole tiles intersecting a convex window; never cut a tile's geometry."""
from collections import Counter
from tessellation_patterns import make_fold

PRUNABLE = ('periodic', 'primal-dual', 'archimedean', 'nonperiodic', 'custom', 'ring')


def intersects(a, b):
    # The source tile may be concave (e.g. a star). SAT on the full polygon
    # only proves nonintersection for convex tiles and accepts empty notches.
    def turn(p, q, r):
        return (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])

    def on_segment(p, q, r):
        return (abs(turn(p, q, r)) <= 1e-9 * max(1, abs(q[0]-p[0]), abs(q[1]-p[1]))
                and min(p[0], q[0])-1e-9 <= r[0] <= max(p[0], q[0])+1e-9
                and min(p[1], q[1])-1e-9 <= r[1] <= max(p[1], q[1])+1e-9)

    def contains(poly, point):
        inside = False
        for p, q in zip(poly, poly[1:] + poly[:1]):
            if on_segment(p, q, point):
                return True  # Contact counts as intersection.
            if (p[1] > point[1]) != (q[1] > point[1]):
                x = p[0] + (point[1]-p[1])*(q[0]-p[0])/(q[1]-p[1])
                if x > point[0]:
                    inside = not inside
        return inside

    if any(contains(b, p) for p in a) or any(contains(a, p) for p in b):
        return True
    for p, q in zip(a, a[1:] + a[:1]):
        for r, s in zip(b, b[1:] + b[:1]):
            if (on_segment(p, q, r) or on_segment(p, q, s)
                    or on_segment(r, s, p) or on_segment(r, s, q)):
                return True
            if turn(p, q, r)*turn(p, q, s) < 0 and turn(r, s, p)*turn(r, s, q) < 0:
                return True
    return False


def prune_mesh(mesh, boundary):
    coords = mesh['vertices_coords']
    keep = [j for j,f in enumerate(mesh['faces_vertices']) if intersects([coords[i] for i in f], boundary)]
    faces = [mesh['faces_vertices'][j] for j in keep]
    if not faces:
        raise ValueError('修剪范围没有接触任何拼块，请调整轮廓。')
    used = sorted({i for f in faces for i in f})
    index = {old: new for new, old in enumerate(used)}
    faces = [[index[i] for i in f] for f in faces]
    edges = Counter(tuple(sorted((a, b))) for f in faces for a, b in zip(f, f[1:]+f[:1]))
    # Preserve face order and orientation, so adjacency and per-face targets
    # remain deterministic. Edges exposed by pruning become paper boundaries.
    result = make_fold([coords[i][:] for i in used], [list(e) for e in edges], ['B' if n == 1 else 'U' for n in edges.values()], faces)
    for target_key in ('zhezhi_penrose_dual_targets','zhezhi_goldberg_dual_targets','zhezhi_voronoi_dual_targets'):
        if target_key in mesh:
            result[target_key]=[mesh[target_key][j][:] for j in keep]
    if 'zhezhi_custom_face_index' in mesh:
        result['zhezhi_custom_face_index']=[mesh['zhezhi_custom_face_index'][j] for j in keep]
    if 'zhezhi_custom_polygons' in mesh:
        result['zhezhi_custom_polygons']=[mesh['zhezhi_custom_polygons'][j] for j in keep]
    if 'zhezhi_lattice_cells' in mesh:
        result['zhezhi_lattice_cells']=[mesh['zhezhi_lattice_cells'][j] for j in keep]
        original_indices=mesh.get('zhezhi_original_tile_index', list(range(len(mesh['faces_vertices']))))
        result['zhezhi_original_tile_index']=[original_indices[j] for j in keep]
        for key in ('zhezhi_lattice_ranges', 'zhezhi_lattice_vectors'):
            if key in mesh:
                result[key]=mesh[key]
    neighbors = [set() for _ in faces]
    owners = {}
    for k, f in enumerate(faces):
        for a, b in zip(f, f[1:]+f[:1]):
            edge = tuple(sorted((a, b)))
            if edge in owners:
                j = owners[edge]; neighbors[j].add(k); neighbors[k].add(j)
            owners[edge] = k
    seen = {0}; queue = [0]
    for i in queue:
        for j in neighbors[i]-seen:
            seen.add(j); queue.append(j)
    if len(seen) != len(faces) or len(used)-len(edges)+len(faces) != 1:
        raise ValueError('修剪后拼块未共边连成无孔洞的整片，请调整轮廓。')
    return result
