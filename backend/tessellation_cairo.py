"""Equilateral Cairo pentagons and their four/eight-tile translation cells.

The cell incidences follow the original notebook's geometric specification.
Coordinates are independently reconstructed by closing a unit-edge polygon
and rigidly joining reversed edges; no fitted or fixed-angle approximation.
"""
import math
from functools import lru_cache


@lru_cache(maxsize=128)
def cairo_vertices(delta):
    # Closing the polygon gives r-1 = exp(-ib)*(-1+(1+r)*exp(-ic)),
    # r=exp(id). Take the modulus to solve b on the convex Cairo branch,
    # then recover c. This avoids root-finder jumps near the 60/120° limits.
    if not math.isfinite(delta) or not 60<delta<120:
        raise ValueError('Cairo 底角须严格介于 60° 和 120°，端点会退化。')
    d=math.radians(delta)
    r=complex(math.cos(d),math.sin(d))
    cosine=(4*math.cos(d)-1)/(4*math.sin(d/2))
    b=3*math.pi/2-d/2-math.acos(max(-1.,min(1.,cosine)))
    u=((r-1)*complex(math.cos(b),math.sin(b))+1)/(1+r)
    c=-math.atan2(u.imag,u.real)
    def vertices(b,c):
        points=[complex(0),complex(1)]
        for angle in (math.pi-b,2*math.pi-b-c,2*math.pi+d-b-c):
            points.append(points[-1]+complex(math.cos(angle),math.sin(angle)))
        return points
    angles=[d,b,c,math.pi-d,2*math.pi-b-c]
    if abs(vertices(b,c)[-1]-r)>1e-9 or not all(1e-6<a<math.pi-1e-6 for a in angles):
        raise ValueError('该底角不能形成当前 Cairo 分支的严格凸等边五边形。')
    return tuple(vertices(b,c))


def _join(tile, edge, target, target_edge):
    start,end=tile[edge],tile[(edge+1)%5]
    a,b=target[(target_edge+1)%5],target[target_edge]
    rotation=(b-a)/(end-start)
    if abs(abs(rotation)-1)>1e-8:
        raise ValueError('Cairo 共边长度不一致。')
    return tuple(a+rotation*(p-start) for p in tile)


def cairo_cell(delta=90., double=False):
    a,b=cairo_vertices(delta),cairo_vertices(180-delta)
    tiles=[a]
    xy=lambda z:[float(z.real),float(z.imag)]
    specs=[{'tiletype':'UnitCairoPentagonTile','cairoAngle':delta,
            'vertices':[xy(z) for z in a],'offset':[0.,0.],
            'rotation':0.,'scale':1.}]
    # Original joins identify the receiving edge's first vertex and the new
    # edge's LAST vertex. Indices here are zero-based vertex indices.
    joins=[(b,180-delta,0,3,3),(a,delta,1,0,0),(b,180-delta,2,3,3)]
    if double:joins.extend([(b,180-delta,1,4,1),(a,delta,4,3,3),
                            (b,180-delta,5,0,0),(a,delta,2,0,0)])
    for tile,angle,index,target_edge,vertex in joins:
        target=tiles[index]
        source_edge=tile[(vertex-1)%5]-tile[vertex]
        target_edge_vector=target[(target_edge+1)%5]-target[target_edge]
        # JoinTiling calls ScaleRotationOffset, whose ArcTan[dot, cross]
        # returns a principal angle. Exact antiparallel joins have two valid
        # representatives; the notebook's saved Out[3294] uses -Pi for the
        # third tile and +Pi for the seventh.
        dot=(source_edge.conjugate()*target_edge_vector).real
        cross=(source_edge.conjugate()*target_edge_vector).imag
        rotation=math.degrees(math.atan2(cross,dot))
        if abs(abs(rotation)-180)<1e-9:
            rotation=-180. if len(tiles)==2 else 180.
        elif abs(rotation)<1e-9:
            rotation=0.
        placed=_join(tile,(vertex-1)%5,target,target_edge)
        tiles.append(placed)
        specs.append({'tiletype':'UnitCairoPentagonTile','cairoAngle':angle,
                      'vertices':[xy(z) for z in tile],'offset':xy(placed[0]),
                      'rotation':rotation,'scale':1.})
    if double:vectors=[tiles[0][2]-tiles[2][1],tiles[4][2]-tiles[3][4]]
    else:vectors=[tiles[0][2]-tiles[3][4],tiles[2][1]-tiles[3][4]]
    return {'tiles':[[xy(z) for z in tile] for tile in tiles],
            'tileSpecs':specs,'lattice':[xy(v) for v in vectors],'baseAngle':delta}


def cairo_mesh(delta, double, repeat_x, repeat_y):
    from tessellation_meshes import polygon_mesh
    cell=cairo_cell(delta,double);u,v=cell['lattice']
    polygons=[[[x+i*u[0]+j*v[0],y+i*u[1]+j*v[1]] for x,y in tile] for j in range(repeat_y) for i in range(repeat_x) for tile in cell['tiles']]
    return polygon_mesh(polygons)
