"""Finite reciprocal face incidence from Origamica In[1137/1278/1481].

FOLD face IDs and primal vertex IDs remain unchanged.  Only an oriented copy
of the supplied rings is used for the source TPlaneGraph's CCW convention.
Unoccupied sectors include outer boundaries, omitted cells and hole rings.
The result is combinatorial: no dual-coordinate area test removes a face.
"""
import math


def reciprocal_face_topology(mother, dual_edges):
    """Return (DualFaces, InteriorVertices), converted to zero-based indices.

    The finite input must supply nondegenerate rings, their exact edge graph,
    and a consistent planar rotation at each vertex.  Disconnected patches
    are allowed; a missing face/ring/edge or inconsistent corner is an error.
    Interior valence-two vertices retain the source's two-index dual faces.
    """
    try:
        vertices = mother['vertices_coords']
        edges = mother['edges_vertices']
        faces = mother['faces_vertices']
    except (KeyError, TypeError):
        raise ValueError('对偶面需要完整的母结构顶点、边和面数据。') from None
    if not all(isinstance(value, list) for value in (vertices, edges, faces)) or not vertices or not faces:
        raise ValueError('对偶面需要非空的有限母结构顶点和面数据。')
    def finite_number(value):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return False
        try:
            return math.isfinite(value)
        except OverflowError:
            return False

    if any(not isinstance(point, (list, tuple)) or len(point) != 2
           or not all(finite_number(x) for x in point)
           for point in vertices):
        raise ValueError('对偶面的母结构坐标必须是有限二维数值。')

    def valid_index(index):
        return isinstance(index, int) and not isinstance(index, bool) and 0 <= index < len(vertices)

    edge_set = set()
    for edge in edges:
        if (not isinstance(edge, (list, tuple)) or len(edge) != 2
                or not all(valid_index(v) for v in edge) or edge[0] == edge[1]):
            raise ValueError('对偶面的母结构边索引无效。')
        a, b = edge
        if vertices[a] == vertices[b]:
            raise ValueError('对偶面的母结构含零长度边。')
        key = tuple(sorted(edge))
        if key in edge_set:
            raise ValueError('对偶面的母结构含重复边。')
        edge_set.add(key)

    holes = mother.get('faces_holes')
    if holes is not None and (not isinstance(holes, list) or len(holes) != len(faces)
                             or any(not isinstance(rings, list) for rings in holes)):
        raise ValueError('对偶面的孔环必须按母面逐一声明。')
    if 'faces_holes' in mother and holes is None:
        raise ValueError('对偶面的孔环数据不能为 null。')
    triples, directed_faces, used_edges = {}, {}, set()
    for face_id, outer in enumerate(faces):
        rings = [outer] if holes is None else [outer, *holes[face_id]]
        seen_face_vertices = set()
        for ring_id, ring in enumerate(rings):
            if (not isinstance(ring, list) or len(ring) < 3
                    or not all(valid_index(v) for v in ring) or len(set(ring)) != len(ring)):
                raise ValueError('对偶面的母面环必须有至少三个不同的有效顶点。')
            if seen_face_vertices.intersection(ring):
                raise ValueError('对偶面的母面外环与孔环不能共用顶点。')
            seen_face_vertices.update(ring)
            area2 = sum(vertices[a][0]*vertices[b][1]-vertices[a][1]*vertices[b][0]
                        for a, b in zip(ring, ring[1:]+ring[:1]))
            if not finite_number(area2) or area2 == 0:
                raise ValueError('对偶面的母面环面积必须有限且非零。')
            # Source Faces use CCW outer rings; material hole rings use CW.
            oriented = list(ring) if (area2 > 0) == (ring_id == 0) else list(reversed(ring))
            for i, v in enumerate(oriented):
                a, b = oriented[i-1], oriented[(i+1) % len(oriented)]
                edge = tuple(sorted((v, b)))
                if edge not in edge_set:
                    raise ValueError('对偶面的母面边未出现在母结构边表中。')
                used_edges.add(edge)
                if (v, b) in directed_faces or (a, v, b) in triples:
                    raise ValueError('对偶面的母面边或角扇区重复，邻接不一致。')
                directed_faces[v, b] = face_id
                triples[a, v, b] = face_id
    if used_edges != edge_set:
        raise ValueError('对偶面的母结构含未属于任何母面环的边。')

    # In[1137]: Join[edges, Reverse /@ edges], ArcTan[-Subtract], Chop,
    # then sort halfedges around each source vertex by their angles.
    neighbors = [[] for _ in vertices]
    for a, b in [*edges, *([b, a] for a, b in edges)]:
        dx, dy = vertices[b][0]-vertices[a][0], vertices[b][1]-vertices[a][1]
        if not math.isfinite(dx) or not math.isfinite(dy):
            raise ValueError('对偶面的母结构边向量必须有限。')
        angle = math.atan2(dy, dx)
        if angle <= -math.pi:
            angle = math.pi
        neighbors[a].append((0.0 if abs(angle) < 1e-10 else angle, b))

    incidence = []
    matched_triples = set()
    for v, rays in enumerate(neighbors):
        if not rays:
            raise ValueError('对偶面的母结构不能含孤立顶点。')
        ordered = [b for _, b in sorted(rays, key=lambda ray: ray[0])]
        raw = []
        for i, u in enumerate(ordered):
            w = ordered[i-1]
            triple = (u, v, w)  # In[1278] starpp, with RotateRight[vva].
            if triple in triples:
                matched_triples.add(triple)
                raw.append(triples[triple])
            else:
                # Prove this is an unoccupied sector, rather than silently
                # turning a supplied face's inconsistent corner into exterior.
                if (u, v) in directed_faces or (v, w) in directed_faces:
                    raise ValueError('对偶面的母面角与原半边循环序不一致。')
                raw.append(None)
        incidence.append(raw[1:]+raw[:1])  # In[1278] RotateLeft, exterior 0.
    if matched_triples != set(triples):
        raise ValueError('对偶面的母面未完整匹配原半边循环序。')

    # In[1481] iterates primal indices in order and excludes exterior sectors.
    interior_vertices = [v for v, ids in enumerate(incidence) if None not in ids]
    dual_faces = [incidence[v] for v in interior_vertices]
    dual_edge_set = {tuple(sorted(edge)) for edge in dual_edges}
    if any(tuple(sorted((a, b))) not in dual_edge_set
           for face in dual_faces for a, b in zip(face, face[1:]+face[:1])):
        raise ValueError('原循环序的对偶面边未出现在现有对偶边表中。')
    return dual_faces, interior_vertices
