"""Independent Euclidean reconstruction from finite polygon edge gluings."""
import cmath
import math
from collections import deque
from functools import lru_cache

from tessellation_uniform_data import CATALOG
from tessellation_meshes import polygon_mesh


def _shape(n):
    points = [0j]
    for i in range(n - 1):
        points.append(points[-1] + cmath.exp(2j * math.pi * i / n))
    center = sum(points) / n
    return tuple(p - center for p in points)


def _key(z):
    return round(z.real, 7), round(z.imag, 7)


def _cross(a, b):
    return (a.conjugate() * b).imag


def _grow(record, depth):
    shapes = [_shape(n) for n in record['sides']]
    # (type, multiplier, center, handedness); shapes are centered and unit-edge.
    first = (0, 1 + 0j, 0j, 1)
    queue = deque([(first, 0)])
    found = {_key(0j): first}
    while queue:
        state, level = queue.popleft()
        if level >= depth:
            continue
        t, rotation, center, handed = state
        polygon = tuple(center + rotation * (p if handed == 1 else p.conjugate()) for p in shapes[t])
        for edge, a in enumerate(polygon):
            b = polygon[(edge + 1) % len(polygon)]
            nt, ne, mirror = record['adjacent'][t][edge % record['periods'][t]]
            nh = -handed if mirror else handed
            q = shapes[nt]
            x, y = q[ne], q[(ne + 1) % len(q)]
            if nh == -1:
                x, y = x.conjugate(), y.conjugate()
            start, end = (a, b) if mirror else (b, a)
            multiplier = (end - start) / (y - x)
            origin = start - multiplier * x
            key = _key(origin)
            if key in found:
                if found[key][0] != nt:
                    raise ValueError('周期目录的拼块类型不一致。')
                continue
            new = (nt, multiplier, origin, nh)
            found[key] = new
            queue.append((new, level + 1))
    return tuple(found.values()), shapes


def _polygons(states, shapes):
    return [[[float((c + r * (p if h == 1 else p.conjugate())).real),
              float((c + r * (p if h == 1 else p.conjugate())).imag)]
             for p in shapes[t]] for t, r, c, h in states]


def recover_cell(record):
    """A translational fundamental patch, two vectors, and vertex words.

    A translation is certified by returning to the seed's decorated polygon
    with the same orientation (modulo its specified rotational symmetry).
    Among these translations choose the least-area independent pair, then
    use a half-open cell to retain every tile orbit exactly once.
    """
    states, shapes = _grow(record, 14)
    order = record['sides'][0] // record['periods'][0]
    vectors = [c for t, r, c, h in states
               if t == 0 and h == 1 and abs(c) > 1e-6 and abs(r ** order - 1) < 1e-6]
    vectors.sort(key=lambda v: (round(abs(v), 8), round(cmath.phase(v), 8)))
    # In a plane lattice a shortest vector belongs to a primitive basis.
    u = vectors[0]
    candidates = [v for v in vectors if _cross(u, v) > 1e-6]
    v = min(candidates, key=lambda v: (round(_cross(u, v), 7), round(abs(v), 7)))
    # Deterministic orientation, and an off-center cell avoids ties on centers.
    origin = -.371 * u - .293 * v
    det = _cross(u, v)
    cell = []
    for state in states:
        p = state[2] - origin
        a, b = _cross(p, v) / det, _cross(u, p) / det
        if -1e-8 <= a < 1 - 1e-8 and -1e-8 <= b < 1 - 1e-8:
            cell.append(state)
    polygons = _polygons(cell, shapes)
    area = sum(n / (4 * math.tan(math.pi / n)) for n in (len(p) for p in polygons))
    if abs(area - det) > 1e-6:
        raise ValueError('周期目录的基本拼块面积未闭合。')
    return dict(polygons=polygons, lattice=[[u.real, u.imag], [v.real, v.imag]],
                vertexTypes=record['vertexTypes'], reference=record['reference'])


@lru_cache(maxsize=20)
def uniform_cell(index):
    if isinstance(index, bool) or not isinstance(index, int) or not 1 <= index <= 20:
        raise ValueError('双均匀编号必须为 1–20。')
    return recover_cell(CATALOG[index - 1])


def uniform_mesh(index, rings):
    cell=uniform_cell(index)
    u,v=cell['lattice']
    # Repeating the actual fundamental patch avoids the enclosed gaps that a
    # face-distance BFS can leave between large polygons at its last layer.
    polygons=[[[x+i*u[0]+j*v[0],y+i*u[1]+j*v[1]] for x,y in polygon]
              for i in range(rings+1) for j in range(rings+1) for polygon in cell['polygons']]
    return polygon_mesh(polygons)
