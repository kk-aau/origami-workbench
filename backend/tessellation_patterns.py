"""Independent Euclidean constructions; no Origamica notebook code.

Regular meshes use shared vertices/edges, not disconnected CP copies. The
polygon twist has sectors (90+a, 360/n, 90-a, 180-360/n) at each inner vertex.
Local angle/assignment conditions do not establish a global layer ordering.
"""
import math


def fold_from_faces(coords, faces):
    counts = {}
    for face in faces:
        for a, b in zip(face, face[1:] + face[:1]):
            edge = tuple(sorted((a, b)))
            counts[edge] = counts.get(edge, 0) + 1
    return make_fold(coords, list(counts), ["B" if n == 1 else "U" for n in counts.values()], [f[::-1] for f in faces])


def make_fold(coords, edges, assignments, faces):
    return {"file_spec": 1.2, "file_classes": ["singleModel"],
            "frame_classes": ["creasePattern"], "frame_attributes": ["2D"],
            "vertices_coords": coords, "edges_vertices": edges,
            "edges_assignment": assignments,
            "edges_foldAngle": [{"M": -180, "V": 180}.get(a) for a in assignments],
            "faces_vertices": faces}


def canonical_fold(fold):
    """Stable serialization despite the upstream graph's set iteration order."""
    coords = [[round(x, 10) + 0.0 for x in p] for p in fold['vertices_coords']]
    order = sorted(range(len(coords)), key=lambda i: tuple(coords[i]))
    remap = {old: new for new, old in enumerate(order)}
    edges = sorted((tuple(sorted((remap[a], remap[b]))), assignment)
                   for (a, b), assignment in zip(fold['edges_vertices'], fold['edges_assignment']))
    faces = []
    for face in fold['faces_vertices']:
        face = [remap[i] for i in face]
        start = face.index(min(face))
        faces.append(face[start:] + face[:start])
    return {**fold, **make_fold([coords[i] for i in order], [list(e) for e, _ in edges], [a for _, a in edges], sorted(faces))}


def regular_patch(tiling, rows, columns):
    coords, faces, ids = [], [], {}

    def vertex(x, y):
        key = (round(x, 10), round(y, 10))
        if key not in ids:
            ids[key] = len(coords)
            coords.append([x, y])
        return ids[key]

    for row in range(rows):
        for col in range(columns):
            if tiling == "hexagon":
                x, y = 1.5 * col, math.sqrt(3) * (row + col / 2)
                faces.append([vertex(x + math.cos(k * math.pi / 3), y + math.sin(k * math.pi / 3)) for k in range(6)])
            else:
                skew, height = (0, 1) if tiling == "square" else (0.5, math.sqrt(3) / 2)
                a, b, c, d = [vertex(col + dx + (row + dy) * skew, (row + dy) * height) for dx, dy in ((0, 0), (1, 0), (1, 1), (0, 1))]
                faces.extend([[a, b, c, d]] if tiling == "square" else [[a, b, d], [b, c, d]])
    return fold_from_faces(coords, faces)


def planar_faces(coords, edges):
    neighbors = [[] for _ in coords]
    for a, b in edges:
        neighbors[a].append(b)
        neighbors[b].append(a)
    for a, ns in enumerate(neighbors):
        ns.sort(key=lambda b: math.atan2(coords[b][1] - coords[a][1], coords[b][0] - coords[a][0]))
    seen, faces = set(), []
    for a, ns in enumerate(neighbors):
        for b in ns:
            if (a, b) in seen:
                continue
            face, u, v = [], a, b
            while (u, v) not in seen:
                seen.add((u, v))
                face.append(u)
                around = neighbors[v]
                u, v = v, around[(around.index(u) - 1) % len(around)]
            area = sum(coords[i][0] * coords[j][1] - coords[j][0] * coords[i][1] for i, j in zip(face, face[1:] + face[:1]))
            if area > 1e-10:
                faces.append(face[::-1])
    return faces


def polygon_twist(sides, angle, scale, offset_x=0, offset_y=0, polygon=None, paper=None):
    # Without an explicit paper choice, preserve the original square unit.
    shape=polygon or [[math.cos(math.tau*i/sides),math.sin(math.tau*i/sides)] for i in range(sides)]
    sides=len(shape)
    coords = [[offset_x+scale*x,offset_y+scale*y] for x,y in shape]
    edges = [[i, (i + 1) % sides] for i in range(sides)]
    # A regular square needs two neighbouring mountain and two valley edges.
    # Giving every centre edge the same assignment passes local vertex checks
    # but creates an incompatible global stack (including the default 36 deg).
    # Keep the geometry unchanged; each outgoing pleat follows its adjacent
    # centre edge below. Other polygon constructions retain their assignment.
    assignments = ["M", "M", "V", "V"] if sides == 4 and polygon is None else ["M"] * sides
    centre_assignments = assignments.copy()
    outline = [[-1., -1.], [1., -1.], [1., 1.], [-1., 1.]]
    if paper is not None:
        from tessellation_paper import paper_polygon
        outline = paper_polygon(outline, **paper)
    boundary = []
    for p in outline:
        boundary.append(len(coords))
        coords.append(list(p))
    for i in range(sides):
        x, y = coords[i]
        previous=coords[(i-1)%sides];following=coords[(i+1)%sides]
        u=[previous[0]-x,previous[1]-y];v=[following[0]-x,following[1]-y]
        un=math.hypot(*u);vn=math.hypot(*v);u=[a/un for a in u];v=[a/vn for a in v]
        interior=math.acos(max(-1.,min(1.,sum(a*b for a,b in zip(u,v)))))
        outward=math.atan2(-u[1]-v[1],-u[0]-v[0])
        for sign in (-1, 1):
            direction = outward + sign*(math.pi-interior)/2 + math.radians(angle)
            dx, dy = math.cos(direction), math.sin(direction)
            distances = []
            for a, b in zip(outline, outline[1:] + outline[:1]):
                ex, ey = b[0] - a[0], b[1] - a[1]
                determinant = dx * ey - dy * ex
                if abs(determinant) < 1e-12:
                    continue
                ox, oy = a[0] - x, a[1] - y
                t = (ox * ey - oy * ex) / determinant
                u = (ox * dy - oy * dx) / determinant
                if t > 1e-10 and -1e-9 <= u <= 1 + 1e-9:
                    distances.append(t)
            if not distances:
                raise ValueError('扭转褶线未能到达所选纸张边界。')
            t = min(distances)
            point = [x + t * dx, y + t * dy]
            hit = next((j for j in boundary if math.dist(coords[j], point) < 1e-9), None)
            if hit is None:
                hit = len(coords)
                coords.append(point)
                boundary.append(hit)
            edges.append([i, hit])
            adjacent = centre_assignments[(i-1) % sides if sign < 0 else i]
            assignments.append(({"M": "V", "V": "M"}[adjacent]) if sign * angle > 0 else adjacent)
    boundary.sort(key=lambda j: math.atan2(coords[j][1], coords[j][0]))
    edges.extend([[a, b] for a, b in zip(boundary, boundary[1:] + boundary[:1])])
    assignments.extend(["B"] * len(boundary))
    return make_fold(coords, edges, assignments, planar_faces(coords, edges))


def split_twist(unit, count):
    """Join reflected twist units with shared, alternating hinge segments."""
    coords, edges, assignments, ids, boundary_counts = [], [], [], {}, {}
    for copy in range(count):
        mapping = {}
        for i, (x,y) in enumerate(unit['vertices_coords']):
            p = (round((x if copy%2 == 0 else -x) + 2*copy, 10), round(y, 10))
            if p not in ids:
                ids[p] = len(coords); coords.append(list(p))
            mapping[i] = ids[p]
        for (a,b), assignment in zip(unit['edges_vertices'],unit['edges_assignment']):
            edge = tuple(sorted((mapping[a],mapping[b])))
            if assignment == 'B':
                boundary_counts[edge] = boundary_counts.get(edge,0)+1
            else:
                edges.append(list(edge)); assignments.append(assignment)
    hinges = {}
    for (a,b), multiplicity in boundary_counts.items():
        if multiplicity == 1:
            edges.append([a,b]);assignments.append('B')
        else:
            hinges.setdefault(coords[a][0],[]).append((a,b))
    for group in hinges.values():
        group.sort(key=lambda edge:min(coords[i][1] for i in edge))
        for i,edge in enumerate(group):
            edges.append(list(edge));assignments.append('M' if i%2 else 'V')
    return canonical_fold(make_fold(coords,edges,assignments,planar_faces(coords,edges)))
