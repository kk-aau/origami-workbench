"""Bounded planar mother meshes and perpendicular reciprocal figures.

These independent constructions use Euclidean half planes, triangulation and
golden-ratio subdivision. The original Penrose parameter and dual-coordinate
formulas are checked against the supplied notebook's mathematical contract.
"""
import math
import random
from collections import defaultdict

from tessellation_patterns import fold_from_faces, make_fold, canonical_fold
from tessellation_dual_faces import reciprocal_face_topology


def polygon_mesh(polygons, coordinate_digits=9):
    coords, faces, lookup = [], [], {}
    for polygon in polygons:
        face = []
        for point in polygon:
            key = tuple(round(float(x), coordinate_digits) + 0.0 for x in point)
            if key not in lookup:
                lookup[key] = len(coords)
                coords.append(list(key))
            if not face or face[-1] != lookup[key]:
                face.append(lookup[key])
        if len(face) > 1 and face[0] == face[-1]:
            face.pop()
        area = sum(coords[a][0] * coords[b][1] - coords[b][0] * coords[a][1] for a, b in zip(face, face[1:] + face[:1]))
        if len(face) < 3 or abs(area) < 1e-12:
            continue
        faces.append(face if area > 0 else face[::-1])
    # Conform T junctions from substitution and clipped polygon boundaries.
    for index, face in enumerate(faces):
        result = []
        for a, b in zip(face, face[1:] + face[:1]):
            x, y = coords[a]; dx, dy = coords[b][0] - x, coords[b][1] - y
            length2 = dx * dx + dy * dy
            mids = []
            for k, (px, py) in enumerate(coords):
                t = ((px - x) * dx + (py - y) * dy) / length2
                if 1e-8 < t < 1 - 1e-8 and abs((px - x) * dy - (py - y) * dx) < 2e-8 * math.sqrt(length2):
                    mids.append((t, k))
            result.extend([a] + [k for _, k in sorted(mids)])
        faces[index] = result
    return fold_from_faces(coords, faces)


def clip_half_plane(poly, normal, distance):
    out = []
    for a, b in zip(poly, poly[1:] + poly[:1]):
        da = sum(x * n for x, n in zip(a, normal)) - distance
        db = sum(x * n for x, n in zip(b, normal)) - distance
        if da <= 1e-10:
            out.append(a)
        if (da < -1e-10 and db > 1e-10) or (db < -1e-10 and da > 1e-10):
            t = da / (da - db)
            out.append([a[k] + t * (b[k] - a[k]) for k in (0, 1)])
    return out


def seeded_points(count, seed, boundary=None):
    rng = random.Random(seed)
    if boundary is not None:
        # Area-weighted triangle sampling also works for very thin convex bounds.
        triangles=[[boundary[0],boundary[i],boundary[i+1]] for i in range(1,len(boundary)-1)]
        areas=[abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])) for a,b,c in triangles]
        result=[]
        for _ in range(count):
            a,b,c=rng.choices(triangles,weights=areas,k=1)[0]
            u=math.sqrt(rng.random());v=rng.random()
            result.append([(1-u)*a[k]+u*(1-v)*b[k]+u*v*c[k] for k in (0,1)])
        return result
    columns = math.ceil(math.sqrt(count))
    rows = math.ceil(count / columns)
    return [[(i % columns + .5 + rng.uniform(-.22, .22)) / columns,
             (i // columns + .5 + rng.uniform(-.22, .22)) / rows] for i in range(count)]


def site_mesh(kind, points, boundary=None, boundary_mode='square'):
    if kind == 'delaunay':
        import numpy as np
        from scipy.spatial import Delaunay, QhullError
        added=[[0,0],[1,0],[1,1],[0,1]] if boundary_mode=='square' else []
        points = list({tuple(p): None for p in added + points})
        try:
            triangles = Delaunay(np.asarray(points)).simplices
        except QhullError:
            raise ValueError('种子点不能形成稳定三角剖分，请移动或增加点。') from None
        return polygon_mesh([[points[i] for i in face] for face in triangles])
    cells = []
    for i, a in enumerate(points):
        cell = [list(p) for p in (boundary or [[0.,0.],[1.,0.],[1.,1.],[0.,1.]])]
        for j, b in enumerate(points):
            if i == j:
                continue
            normal = [b[k] - a[k] for k in (0, 1)]
            distance = (sum(x*x for x in b) - sum(x*x for x in a)) / 2
            cell = clip_half_plane(cell, normal, distance)
            if not cell:
                break
        cells.append(cell)
    mesh = polygon_mesh(cells)
    # The source BoundedVoronoiDiagram routine assigns each primal face the
    # input site itself as its reciprocal dual vertex.  Keep that face-order
    # mapping through clipping and optional whole-tile pruning.
    if len(mesh['faces_vertices']) != len(points):
        raise ValueError('Voronoi 种子未能逐一形成非退化分区，请调整种子或边界。')
    mesh['zhezhi_voronoi_dual_targets'] = [list(point) for point in points]
    return mesh


def penrose_mesh(depth, version='legacy', border_triangles=True):
    # Robinson triangles: the subdivision matrices encode golden-ratio edge
    # division. Pair the common bases to recover thick/thin Penrose rhombi.
    import numpy as np
    inv_phi = 2 / (1 + math.sqrt(5))
    triangles = []
    original=version=='origamica'
    if original:
        phi=1/inv_phi
        for i in range(5):
            tip=np.array([math.cos(math.tau*i/5),math.sin(math.tau*i/5)])
            for sign in (-1,1):
                side=np.array([math.cos(math.tau*i/5+sign*math.pi/5),math.sin(math.tau*i/5+sign*math.pi/5)])
                triangles.append((0,np.array([[0.,0.],tip,side])) if depth%2 else (1,np.array([tip,[0.,0.],phi*side])))
        steps=(depth+1)//2
    else:
        for i in range(10):
            ends = [[math.cos((2*i + s)*math.pi/10), math.sin((2*i + s)*math.pi/10)] for s in (-1, 1)]
            if i % 2 == 0:
                ends.reverse()
            triangles.append((0, np.array([[0., 0.], *ends])))
        steps=depth
    for _ in range(steps):
        next_level = []
        for kind, points in triangles:
            a, b, c = points
            if kind == 0:
                p = (1-inv_phi)*a + inv_phi*b
                next_level.extend([(0, np.array([c, p, b])), (1, np.array([p, c, a]))])
            else:
                q, r = (1-inv_phi)*b + inv_phi*a, (1-inv_phi)*b + inv_phi*c
                next_level.extend([(1, np.array([r, c, a])), (1, np.array([q, r, b])), (0, np.array([r, q, a]))])
        triangles = next_level
    pairs = defaultdict(list)
    for kind, points in triangles:
        key = tuple(sorted(tuple(round(float(x), 9) for x in p) for p in points[1:]))
        pairs[key].append((kind,points))
    polygons = [];targets=[]
    for items in pairs.values():
        if len(items) == 2:
            (_,a),(_,b) = items
            polygons.append([a[0], a[1], b[0], a[2]])
        elif border_triangles:
            polygons.append(items[0][1])
        else:continue
        kind,(_,b,c)=items[0]
        phi=1/inv_phi
        targets.append((b+(1-phi)/2*(c-b) if kind==0 else c+(1-phi/2)*(b-c)).tolist())
    # The source keeps machine-precision deflated points. Nine-digit mesh
    # rounding shifts the prescribed reciprocal vertices at higher levels.
    mesh=polygon_mesh(polygons, coordinate_digits=12) if original else polygon_mesh(polygons)
    if original:mesh['zhezhi_penrose_dual_targets']=targets
    return mesh


def ring_mesh(sides, rings, growth):
    return rotational_trapezoid_mesh(sides, [growth**j for j in range(rings+1)])


def rotational_trapezoid_mesh(sides, radii, include_center=False):
    layers = [[[r * math.cos(math.tau*i/sides), r * math.sin(math.tau*i/sides)] for i in range(sides)] for r in radii]
    polygons = [[[0.,0.],layers[0][i],layers[0][(i+1)%sides]] for i in range(sides)] if include_center else [layers[0]]
    for inner, outer in zip(layers, layers[1:]):
        polygons.extend([[inner[i], outer[i], outer[(i+1)%sides], inner[(i+1)%sides]] for i in range(sides)])
    # In[3385] assigns the circumcenter of each unrounded face directly as
    # its reciprocal vertex.  For an annular trapezoid the circumcenter lies
    # on the sector bisector at (r_inner+r_outer)/(2 cos(pi/m)).
    bisectors = [(math.cos(math.tau*(i+.5)/sides), math.sin(math.tau*(i+.5)/sides)) for i in range(sides)]
    half_chord = 2*math.cos(math.pi/sides)
    targets = ([[radii[0]/half_chord*x, radii[0]/half_chord*y] for x,y in bisectors]
               if include_center else [[0.,0.]])
    for inner, outer in zip(radii, radii[1:]):
        targets.extend([[(inner+outer)/half_chord*x, (inner+outer)/half_chord*y] for x,y in bisectors])
    mesh = polygon_mesh(polygons, coordinate_digits=12)
    if len(mesh['faces_vertices']) != len(targets):
        raise ValueError('旋转梯形面与原版外心对偶点数量不一致，请调整半径。')
    mesh['zhezhi_rotational_trapezoid_dual_targets'] = targets
    return mesh


def custom_mesh(vertices, faces, repeat_x=1, repeat_y=1, lattice=None):
    width = max(p[0] for p in vertices) - min(p[0] for p in vertices)
    height = max(p[1] for p in vertices) - min(p[1] for p in vertices)
    u,v=lattice if lattice is not None else ([width,0],[0,height])
    polygons=[[[vertices[k][0]+x*u[0]+y*v[0], vertices[k][1]+x*u[1]+y*v[1]] for k in face]
              for x in range(repeat_x) for y in range(repeat_y) for face in faces]
    polygons=[p if sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(p,p[1:]+p[:1]))>0 else p[::-1] for p in polygons]
    # Long custom faces can accumulate the legacy 9-digit source rounding
    # across many face reflections, crossing the strict flat-closure limit.
    # Keep legacy coordinates for <=12-sided projects; retain additional
    # source precision for larger faces before generating their pleat graph.
    mesh=polygon_mesh(polygons, coordinate_digits=12 if any(len(face)>12 for face in faces) else 9)
    mesh['zhezhi_custom_face_index']=[i for _ in range(repeat_x) for _ in range(repeat_y) for i in range(len(faces))]
    mesh['zhezhi_custom_polygons']=polygons
    return mesh


def reciprocal_centers(mother, targets=None):
    """Orthogonal projection onto all primal/dual perpendicularity equations."""
    import numpy as np
    from scipy.linalg import lstsq, null_space
    coords = np.asarray(mother['vertices_coords'], dtype=float)
    faces = mother['faces_vertices']
    centers = np.array([np.mean(coords[face], axis=0) for face in faces])
    if targets is not None:
        if len(targets) != len(faces):
            raise ValueError('对偶点数量与当前母结构不一致，请清除对偶修改后重新生成。')
        centers = np.array(targets, dtype=float)
    incident = defaultdict(list)
    for i, face in enumerate(faces):
        for a, b in zip(face, face[1:]+face[:1]):
            incident[tuple(sorted((a, b)))].append(i)
    rows, dual_edges, positive_rows = [], [], []
    for (a, b), fs in sorted(incident.items()):
        if len(fs) != 2:
            continue
        direction = coords[b] - coords[a]
        direction /= np.linalg.norm(direction)
        row = np.zeros((len(faces), 2))
        row[fs[0]], row[fs[1]] = direction, -direction
        rows.append(row.ravel())
        dual_edges.append(fs)
        normal=np.array([-direction[1],direction[0]])
        delta=np.mean(coords[faces[fs[1]]],axis=0)-np.mean(coords[faces[fs[0]]],axis=0)
        if np.dot(normal,delta)<0:normal=-normal
        positive=np.zeros((len(faces),2));positive[fs[1]],positive[fs[0]]=normal,-normal
        positive_rows.append(positive.ravel())
    if not rows:
        raise ValueError('母结构至少需要两个共享边的面。')
    matrix = np.array(rows)
    flat = centers.ravel()
    result = flat - matrix.T @ lstsq(matrix @ matrix.T, matrix @ flat, cond=1e-11)[0]
    positive=np.array(positive_rows)
    minimum=max(float(np.ptp(coords,axis=0).max()),1e-3)*1e-5
    if np.min(positive@result)<minimum:
        from scipy.optimize import minimize, LinearConstraint
        basis=null_space(matrix,rcond=1e-10)
        target=basis.T@flat
        solved=minimize(lambda x:float(np.sum((x-target)**2)),target,jac=lambda x:2*(x-target),method='SLSQP',constraints=LinearConstraint(positive@basis,minimum,np.inf),options={'maxiter':150,'ftol':1e-12})
        result=basis@solved.x
        if np.min(positive@result)<minimum*.5:
            raise ValueError('母结构没有稳定的正向垂直对偶，请调整顶点位置或减少细分。')
    if np.max(np.abs(matrix @ result)) > 1e-7:
        raise ValueError('无法构造满足垂直关系的对偶图，请调整母结构。')
    centers = result.reshape(-1, 2).tolist()
    dual_faces, interior_vertices = reciprocal_face_topology(mother, dual_edges)
    dual = make_fold(centers, dual_edges, ['A']*len(dual_edges), dual_faces)
    dual['zhezhi_dual_primal_vertices'] = interior_vertices
    return centers, dual
