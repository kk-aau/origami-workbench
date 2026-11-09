"""Assemble individually twisted polygon tiles with checked seam compatibility."""
from collections import defaultdict
import math

from tessellation_patterns import canonical_fold, make_fold, planar_faces
from tessellation_tile_monolithic import merge_point, cleanup_collinear_edges
from tessellation_tile_twist import polygon_pleat_tile


def _face_order(polygon, source, types, base_vertex=None):
    n = len(source)
    if len(polygon) != n:
        raise ValueError('逐块扭转不支持共享边被额外顶点细分；原版只合并完整边，请将母拼块改为边对边的独立凸单元。')
    for start in range(n):
        for step in (1, -1):
            dx = polygon[0][0] - source[start][0]
            dy = polygon[0][1] - source[start][1]
            if all(abs(polygon[j][0] - source[(start+step*j) % n][0] - dx)<1e-7 and
                   abs(polygon[j][1] - source[(start+step*j) % n][1] - dy)<1e-7 for j in range(n)):
                ordered = [types[(start+j) % n] if step == 1 else types[(start-j-1) % n] for j in range(n)]
                base = None if base_vertex is None else (step * (base_vertex-start)) % n
                return ordered, base
    raise ValueError('逐块扭转无法对应原始拼块的边赋型。')


def _inside_convex_polygon(point, polygon):
    """A merged CP face centroid must lie in exactly one source tile."""
    sides = [(b[0]-a[0])*(point[1]-a[1])-(b[1]-a[1])*(point[0]-a[0])
             for a, b in zip(polygon, polygon[1:]+polygon[:1])]
    scale = max(1., *(abs(value) for vertex in polygon for value in vertex))
    tolerance = scale*scale*1e-9
    return min(sides) >= -tolerance or max(sides) <= tolerance


def _face_tile_provenance(fold, polygons, source_indices):
    """Keep the tile identity after planar-face rebuilding and canonical sort.

    Origamica's monolithic embedding merges many tile graphs into one graph.
    The resulting face order is no longer the tile order; this independent
    geometric map is metadata only and never changes crease assignments.
    """
    face_instances, face_sources = [], []
    coords = fold['vertices_coords']
    for face in fold['faces_vertices']:
        centroid = [sum(coords[v][axis] for v in face)/len(face) for axis in (0, 1)]
        owners = [i for i, polygon in enumerate(polygons) if _inside_convex_polygon(centroid, polygon)]
        owner = owners[0] if len(owners) == 1 else -1
        face_instances.append(owner)
        face_sources.append(source_indices[owner] if owner >= 0 else -1)
    return face_instances, face_sources


def construct_tile_patch(mother, tile_twists, source_vertices, source_faces,
                         monolithic_options=None):
    from tessellate import check_geometry, check_local_conditions
    from tessellation_advanced import assign_local_mv

    options = monolithic_options or {}
    if not isinstance(options, dict) or set(options) - {
            'mergedEdges', 'samePtTolerance', 'collinearCleanup',
            'collinearTolerance'}:
        raise ValueError('整体拼块合并选项无效。')
    mode = options.get('mergedEdges', 'auto')
    same_tolerance = options.get('samePtTolerance', 1e-8)
    # Projects saved before these options existed retained their straight
    # boundary vertices.  Explicit options use the notebook's True default.
    collinear_cleanup = options.get('collinearCleanup', monolithic_options is not None)
    collinear_tolerance = options.get('collinearTolerance', 1e-8)
    if mode not in ('auto', 'delete', 'retain'):
        raise ValueError('共享边模式须为自动、删除或保留。')
    if (isinstance(same_tolerance, bool) or not isinstance(same_tolerance, (int, float)) or
            not math.isfinite(same_tolerance) or not 0 <= same_tolerance <= 1e-4):
        raise ValueError('并点容差须为 0–0.0001。')
    if not isinstance(collinear_cleanup, bool):
        raise ValueError('共线清理开关须为布尔值。')
    if (isinstance(collinear_tolerance, bool) or not isinstance(collinear_tolerance, (int, float)) or
            not math.isfinite(collinear_tolerance) or not 0 <= collinear_tolerance <= 1e-4):
        raise ValueError('共线角度容差须为 0–0.0001。')
    faces = mother['faces_vertices']
    original = mother.get('zhezhi_custom_face_index', list(range(len(faces))))
    if len(faces) > 36:
        raise ValueError('逐块扭转当前最多支持 36 个拼块，请减少重复或修剪单元。')
    coords, vertex_buckets, edge_uses, tile_polygons = [], {}, defaultdict(list), []
    for face, source_index in zip(faces, original):
        options = tile_twists[source_index]
        polygon = [mother['vertices_coords'][i] for i in face]
        tile_polygons.append(polygon)
        source = [source_vertices[i] for i in source_faces[source_index]]
        types, base = _face_order(polygon, source, options['centralTypes'], options.get('baseVertex'))
        centered_angle = options.get('angleMode') == 'twist'
        if centered_angle:
            from tessellation_split_exact import centered_tilt
            tilt = centered_tilt(options['width'], options['twistAngle'])
        else:
            tilt = options['tilt']
        if options.get('construction') == 'split':
            from tessellation_split_exact import exact_split

            tile, _, _ = exact_split(polygon, options['width'], options['offset'],
                                     tilt, base, options['connection'], types,
                                     options['twistAngle'] < 90 if centered_angle else options['ccw'])
        else:
            # In[2872]/[2896] fix both pleat rays from their central edge.
            # Plain numeric recipes have no explicit ccw field: use the
            # corresponding centered/Alt or perpendicular-offset delegate.
            clockwise = (options['twistAngle'] >= 90 if centered_angle else
                         options['offset'] <= 0 if tilt == 90 and options['offset'] != 0 else
                         tilt >= 90)
            tile, _, _ = polygon_pleat_tile(polygon, options['width'], options['offset'],
                                            tilt, types, clockwise,preserve_source=True)
        local = []
        for point in tile['vertices_coords']:
            local.append(merge_point(point, coords, vertex_buckets, same_tolerance))
        for (a, b), assignment in zip(tile['edges_vertices'], tile['edges_assignment']):
            if local[a] == local[b]:
                raise ValueError('并点容差使拼块折痕塌缩；请调小容差。')
            key = tuple(sorted((local[a], local[b])))
            edge_uses[key].append(assignment)
    if any(len(uses) > 2 or len(uses) == 2 and uses != ['B', 'B'] for uses in edge_uses.values()):
        raise ValueError('逐块扭转的共享边折痕不相容，请统一接缝褶宽和偏置。')
    # Origamica's MonolithicEmbedTiling defaults to KillMergedEdges -> True.
    # First try removing glued tile borders (and any now-isolated vertices).
    # A retained seam can itself be a crease in older workbench projects, so
    # preserve that already-supported interpretation if deleting it is not
    # locally flat-foldable. Each interpretation receives the same checks.
    failures = []
    modes = (True, False) if mode == 'auto' else (mode == 'delete',)
    for kill_merged in modes:
        if kill_merged:
            remaining = [(edge, uses[0]) for edge, uses in edge_uses.items() if len(uses) == 1]
            used_vertices = sorted({vertex for edge, _ in remaining for vertex in edge})
            remap = {old: new for new, old in enumerate(used_vertices)}
            candidate_coords = [coords[old] for old in used_vertices]
            edges = [tuple(remap[vertex] for vertex in edge) for edge, _ in remaining]
            assignments = [assignment for _, assignment in remaining]
        else:
            candidate_coords = coords
            edges = list(edge_uses)
            assignments = ['U' if len(uses) == 2 else uses[0] for uses in edge_uses.values()]
        if collinear_cleanup:
            candidate_coords, edges, assignments = cleanup_collinear_edges(
                candidate_coords, edges, assignments, collinear_tolerance)
        candidate = make_fold(candidate_coords, [list(edge) for edge in edges], assignments,
                              planar_faces(candidate_coords, edges))
        if check_geometry(candidate)['status'] != 'passed':
            failures.append('逐块扭转的接缝错位或折痕相交，请检查相邻单元的褶宽、偏置和角度。')
            continue
        local = check_local_conditions(candidate)
        if local['oddDegreeVertices'] or local['kawasakiViolations']:
            failures.append('逐块扭转的接缝不满足平折角度条件；请检查相邻拼块参数。')
            continue
        # Each M/V here was fixed by an individual source tile.  An already
        # violated Maekawa vertex cannot be repaired by assigning the remaining
        # unknown creases, so report the actual obstruction before the MILP.
        if local['maekawaViolations']:
            vertex = local['maekawaViolations'][0]
            mountain = valley = 0
            for (a, b), assignment in zip(edges, assignments):
                if vertex in (a, b):
                    mountain += assignment == 'M'
                    valley += assignment == 'V'
            x, y = candidate_coords[vertex]
            failures.append(
                f'逐块扭转的固定山谷不满足 Maekawa：顶点 ({x:.9g}, {y:.9g}) '
                f'有 M={mountain}、V={valley}，两者须相差 2。')
            continue
        try:
            candidate = assign_local_mv(candidate, preferred=assignments.copy(), preserve=True)
        except ValueError as exc:
            failures.append(str(exc))
            continue
        if check_local_conditions(candidate)['status'] != 'passed':
            failures.append('逐块扭转无法为接缝赋予满足局部条件的山谷。')
            continue
        fold = canonical_fold(candidate)
        fold['zhezhi_merged_edge_mode'] = 'delete' if kill_merged else 'retained-crease'
        fold['zhezhi_monolithic_options'] = {
            'mergedEdges': mode, 'samePtTolerance': float(same_tolerance),
            'collinearCleanup': collinear_cleanup,
            'collinearTolerance': float(collinear_tolerance),
        }
        break
    else:
        raise ValueError(failures[0])
    instances, sources = _face_tile_provenance(fold, tile_polygons, original)
    fold['zhezhi_face_tile_instance'] = instances
    fold['zhezhi_face_tile_source'] = sources
    if 'zhezhi_lattice_cells' in mother:
        cells = mother['zhezhi_lattice_cells']
        original_indices = mother.get('zhezhi_original_tile_index', list(range(len(faces))))
        fold['zhezhi_face_tile_cell'] = [cells[i] if i >= 0 else None for i in instances]
        fold['zhezhi_face_original_tile_index'] = [original_indices[i] if i >= 0 else -1
                                                   for i in instances]
    return fold
