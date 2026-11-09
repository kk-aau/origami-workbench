"""Origamica GoldbergPatch / GoldbergTiling radial triangle coordinates.

The triangular lattice in each 2*pi/m wedge is P(r,l)=R(k*2*pi/m)
((r-l)*(1,0)+l*(cos(2*pi/m),sin(2*pi/m))).  This is exactly the
GoldbergPoint coordinate rule with radial quantum r and wedge index k.
"""
import math

from tessellation_meshes import polygon_mesh
from tessellation_tile_monolithic import merge_point


def goldberg_point(order, radius, wedge, index):
    phi=math.pi/order
    angle=2*wedge*phi
    x=radius+2*index*math.sin(phi)*math.cos(math.pi/2+phi)
    y=2*index*math.sin(phi)*math.sin(math.pi/2+phi)
    c,s=math.cos(angle),math.sin(angle)
    return [c*x-s*y,s*x+c*y]


def goldberg_tile_specs(order, rings, offset=0, patch_only=False, offset_tiling=False):
    """Numerical instances of GoldbergPatch's original UnitTriangleTile list.

    In[3322] emits an A tile and, unless i == j, a B tile for each (i,j)
    cell. The triangle is defined by its three angles, unit base, offset,
    rotation and scale. GoldbergTiling rotates that list through m sectors;
    GoldbergOffsetTiling rotates the top half by pi and shifts it by o.
    This function uses the centered frame of MakeOffsetGoldbergTiling, whose
    global translation from GoldbergOffsetTiling is (-o/2, 0).
    """
    if any(isinstance(v,bool) or not isinstance(v,int) for v in (order,rings)):
        raise ValueError('Goldberg 旋转阶和层数须为整数。')
    if order<3 or rings<1 or order*rings*rings>256:
        raise ValueError('Goldberg 旋转阶须至少为 3，且单元总数不得超过 256。')
    if isinstance(offset,bool) or not isinstance(offset,(int,float)) or not math.isfinite(offset):
        raise ValueError('Goldberg 拼块偏移须为有限数值。')
    if offset and (patch_only or order%2):
        raise ValueError('单扇区或奇数阶 Goldberg 不支持偏移。')
    if offset_tiling and (patch_only or order%2):
        raise ValueError('GoldbergOffsetTiling 仅适用于偶数阶完整拼块排布。')
    # GoldbergOffsetTiling[m,n,0] is a distinct source expression: its lower
    # half still applies Mod[rot+Pi,2Pi,-Pi].  Geometrically it coincides
    # with GoldbergTiling[m,n], but its saved tile rotations do not.
    is_offset_tiling=bool(offset) or offset_tiling
    phi=math.pi/order
    a_angles=(2*phi,math.pi/2-phi,math.pi/2-phi)
    b_angles=(math.pi/2-phi,2*phi,math.pi/2-phi)
    def fraction(num,den):
        common=math.gcd(num,den)
        return [num//common,den//common]
    a_fractions=(fraction(2,order),fraction(order-2,2*order),fraction(order-2,2*order))
    b_fractions=(fraction(order-2,2*order),fraction(2,order),fraction(order-2,2*order))
    out=[]
    for wedge in range(1 if patch_only else order):
        shift=(-offset/2 if wedge<order//2 else offset/2) if offset else 0
        for radius in range(rings):
            for index in range(radius+1):
                x,y=goldberg_point(order,radius,wedge,index)
                origin=(x+shift,y)
                for branch,angles,fractions,turn in (
                    ('A',a_angles,a_fractions,0),
                    ('B',b_angles,b_fractions,1),
                ):
                    if branch=='B' and index==radius:
                        continue
                    rotation_turns=wedge+turn
                    if is_offset_tiling and wedge>=order//2:
                        # GoldbergOffsetTiling uses Mod[rot+Pi,2Pi,-Pi]
                        # when it copies the top half into the bottom half.
                        rotation_turns-=order
                    rotation=2*math.pi*rotation_turns/order
                    ca,sa=math.cos(rotation),math.sin(rotation)
                    side=math.sin(angles[1])/math.sin(angles[2])
                    local=((0,0),(1,0),(side*math.cos(angles[0]),side*math.sin(angles[0])))
                    vertices=[[origin[0]+ca*px-sa*py,origin[1]+sa*px+ca*py] for px,py in local]
                    out.append({
                        'tileIndex':len(out)+1,'tileType':'UnitTriangleTile',
                        'wedge':wedge+1,'cell':[radius+1,index+1],'branch':branch,
                        'anglesRadians':list(angles),
                        'anglePiFractions':[pair[:] for pair in fractions],
                        'offset':list(origin),'rotationRadians':rotation,
                        'rotationPiFraction':fraction(2*rotation_turns,order),
                        'scale':1,'vertices':vertices,
                    })
    return out


def goldberg_line_segments(order, rings, offset=0):
    """The notebook's ordered Goldberg edge list, including large offsets.

    In[3359] concatenates three edge-family Tables, each ordered by wedge,
    index, then radius. For positive offset, In[3368] groups that list into
    upper and lower halves, translates each group, then appends the bridge.
    At offset >= 2*rings the bridge joins patches at a point or across an
    empty gap; this is only a reference drawing, not a single-sheet face mesh.
    """
    if any(isinstance(v,bool) or not isinstance(v,int) for v in (order,rings,offset)):
        raise ValueError('Goldberg 旋转阶、层数和偏移须为整数。')
    if order<3 or rings<1 or order*rings*rings>256:
        raise ValueError('Goldberg 旋转阶须至少为 3，且单元总数不得超过 256。')
    if offset<0 or (offset and order%2):
        raise ValueError('Goldberg 偏移仅适用于偶数阶，且不得为负。')
    if order*rings*(3*rings+1)//2+offset>6000:
        raise ValueError('Goldberg 原始线图超过 6000 条边的安全规模。')
    segments=[]
    # Preserve the observable Flatten[{Table[radial], Table[chord],
    # Table[diagonal]}, 3] order and directed endpoints of In[3359].
    for wedge in range(order):
        point=lambda radius,index:goldberg_point(order,radius,wedge,index)
        for index in range(rings+1):
            for radius in range(index,rings):
                segments.append([point(radius,index),point(radius+1,index)])
    for wedge in range(order):
        point=lambda radius,index:goldberg_point(order,radius,wedge,index)
        for index in range(rings+1):
            for radius in range(index+1,rings+1):
                segments.append([point(radius,index),point(radius,index+1)])
    for wedge in range(order):
        point=lambda radius,index:goldberg_point(order,radius,wedge,index)
        for index in range(rings+1):
            for radius in range(index+1,rings):
                segments.append([point(radius,index),point(radius+1,index+1)])
    if not offset:return segments
    upper=[];lower=[]
    for a,b in segments:
        if a[1]<-1e-6 or b[1]<-1e-6:
            lower.append([[a[0]+offset/2,a[1]],[b[0]+offset/2,b[1]]])
        else:
            upper.append([[a[0]-offset/2,a[1]],[b[0]-offset/2,b[1]]])
    translated=upper+lower
    translated.extend([[rings+i-offset/2,0.],[rings+i+1-offset/2,0.]]
                       for i in range(offset))
    return translated


def goldberg_indexed_line_graph(segments, bridge_count=0):
    """Read-only numerical Indexify[elist,2] output from In[3370].

    SamePtQ uses a 1e-6 Euclidean tolerance (In[194–195]); Indexify appends
    first-seen vertices and preserves the source edge order and direction.
    These indexed lines are not a face mesh or a flat-fold candidate.
    """
    vertices=[];buckets={};edges=[]
    for a,b in segments:
        edges.append([merge_point(a,vertices,buckets,1e-6),
                      merge_point(b,vertices,buckets,1e-6)])
    return {'vertices':vertices,'edges':edges,'indexBase':0,
            'bridgeEdgeIndices':list(range(len(edges)-bridge_count,len(edges)))}


def goldberg_patch_mesh(order, rings):
    """One numerical GoldbergPatch sector with its n² original triangles.

    The notebook's tile objects also carry symbolic construction metadata;
    this returns only their exact radial geometry and reciprocal face centers.
    """
    if any(isinstance(v,bool) or not isinstance(v,int) for v in (order,rings)) or order<3 or rings<1 or order*rings*rings>256:
        raise ValueError('Goldberg 旋转阶须至少为 3，且单元总数不得超过 256。')
    polygons=[]
    p=lambda radius,index:goldberg_point(order,radius,0,index)
    for radius in range(rings):
        for index in range(radius+1):
            polygons.append([p(radius,index),p(radius+1,index),p(radius+1,index+1)])
            if index < radius:
                polygons.append([p(radius,index),p(radius+1,index+1),p(radius,index+1)])
    patch=polygon_mesh(polygons)
    patch['zhezhi_goldberg_dual_targets']=goldberg_circumcenters(patch)
    return patch


def goldberg_mesh(order, rings, offset=0):
    """One exact unit-edge triangular patch per sector, optionally offset.

    Offset uses the notebook's upper half -o/2 and lower half +o/2,
    with integer o so the two seam grids still meet edge-to-edge.
    """
    if order<3 or rings<1 or order*rings*rings>256:
        raise ValueError('Goldberg 旋转阶须至少为 3，且单元总数不得超过 256。')
    if offset<0 or offset>=2*rings or (offset and order%2):
        raise ValueError('Goldberg 偏移仅适用于偶数阶，且须小于两倍径向层数。')
    polygons=[]
    for k in range(order):
        shift=-offset/2 if k<order//2 else offset/2
        def p(r,l):
            x,y=goldberg_point(order,r,k,l)
            return [x+shift,y]
        for r in range(rings):
            for l in range(r+1):
                polygons.append([p(r,l),p(r+1,l),p(r+1,l+1)])
            for l in range(r):
                polygons.append([p(r,l),p(r+1,l+1),p(r,l+1)])
    mother=polygon_mesh(polygons)
    mother['zhezhi_goldberg_dual_targets']=goldberg_circumcenters(mother)
    return mother


def goldberg_circumcenters(mother):
    """Origamica MakeTriangleGraphReciprocalDiagram uses face circumcenters."""
    points=mother['vertices_coords']
    centers=[]
    for face in mother['faces_vertices']:
        if len(face)!=3:raise ValueError('Goldberg 外心对偶要求所有面都是三角形。')
        a,b,c=[points[i] for i in face]
        ux,uy=b[0]-a[0],b[1]-a[1]
        vx,vy=c[0]-a[0],c[1]-a[1]
        ub=(ux*ux+uy*uy)/2;vb=(vx*vx+vy*vy)/2
        det=ux*vy-uy*vx
        if abs(det)<1e-12:raise ValueError('Goldberg 三角面退化，无法求外心。')
        centers.append([a[0]+(ub*vy-vb*uy)/det,a[1]+(ux*vb-vx*ub)/det])
    return centers


def goldberg_dual_segments(mother):
    """Finite reciprocal-dual edges between triangles sharing a primal edge.

    The original reciprocal diagram puts dual vertices at face circumcenters.
    Boundary rays are omitted: this reference contains only two-face edges and
    makes no claim that the embedding is non-crossing or flat-foldable.
    """
    centers=mother['zhezhi_goldberg_dual_targets']
    owners={}
    segments=[]
    for face_index,face in enumerate(mother['faces_vertices']):
        if len(face)!=3:
            raise ValueError('Goldberg 对偶连线要求所有面都是三角形。')
        for a,b in zip(face,face[1:]+face[:1]):
            key=tuple(sorted((a,b)))
            if key in owners:
                previous=owners[key]
                if previous is None:
                    raise ValueError('Goldberg 网格存在三个以上三角面共边。')
                segments.append([centers[previous],centers[face_index]])
                owners[key]=None
            else:
                owners[key]=face_index
    return segments


def goldberg_reference_query(data):
    """Numerical notebook geometry only; never a crease-pattern candidate.

    The sector patch and the unrestricted offset line drawing are deliberately
    kept outside ``generate``: neither carries mountain/valley assignments or
    a verified flat-folded form. In particular, a large-offset bridge is not
    a strip of paper between the two triangular face patches.
    """
    if not isinstance(data, dict) or set(data)-{'operation','mode','order','rings','offset','sourceVariant'}:
        raise ValueError('Goldberg 参考查询包含无效参数。')
    mode=data.get('mode')
    if mode not in ('sector-patch','offset-lines','tile-tiling'):
        raise ValueError('Goldberg 参考类型须为单扇区网格、拼块排布或偏移线图。')
    source_variant=data.get('sourceVariant')
    if source_variant is not None and (mode!='tile-tiling' or source_variant not in ('full','offset')):
        raise ValueError('Goldberg 拼块来源仅可选完整排布或偏置排布。')
    order,rings,offset=data.get('order'),data.get('rings'),data.get('offset',0)
    if any(isinstance(v,bool) or not isinstance(v,int) for v in (order,rings)):
        raise ValueError('Goldberg 旋转阶和层数须为整数。')
    if not 3<=order<=16 or not 1<=rings<=9 or order*rings*rings>256:
        raise ValueError('Goldberg 参考范围为 m=3–16、n=1–9，且 m·n²≤256。')
    indexed_graph=None
    if mode=='sector-patch':
        if offset:
            raise ValueError('单扇区网格不使用上下偏移；请切换为偏移线图。')
        mesh=goldberg_patch_mesh(order,rings)
        points=mesh['vertices_coords']
        segments=[[points[a],points[b]] for a,b in mesh['edges_vertices']]
        faces=[[points[i] for i in face] for face in mesh['faces_vertices']]
        targets=mesh['zhezhi_goldberg_dual_targets']
        dual_segments=goldberg_dual_segments(mesh)
        tile_specs=goldberg_tile_specs(order,rings,patch_only=True)
        topology='single-sector-face-mesh'
    elif mode=='offset-lines':
        if isinstance(offset,bool) or not isinstance(offset,int):
            raise ValueError('Goldberg 偏移线图的 o 须为整数。')
        if not 0<=offset<=64:
            raise ValueError('Goldberg 参考线图的偏移 o 须在 0–64 之间。')
        segments=goldberg_line_segments(order,rings,offset)
        indexed_graph=goldberg_indexed_line_graph(segments,offset)
        tile_specs=goldberg_tile_specs(order,rings,offset)
        faces=[]
        if offset<2*rings:
            mesh=goldberg_mesh(order,rings,offset)
            targets=mesh['zhezhi_goldberg_dual_targets']
            dual_segments=goldberg_dual_segments(mesh)
        else:
            targets=[]
            dual_segments=[]
        topology=('edge-connected-face-patches' if offset<2*rings else
                  'point-contact-face-patches' if offset==2*rings else
                  'separated-face-patches-with-line-bridge')
    else:
        # GoldbergTiling / GoldbergOffsetTiling are lists of tile specs, not
        # MakeOffsetGoldbergTiling's unit-bridge edge graph. The notebook's
        # In[3326] uses o only in a translation, so finite fractional and
        # negative offsets remain meaningful as reference geometry.
        if isinstance(offset,bool) or not isinstance(offset,(int,float)) or not math.isfinite(offset) or not -64<=offset<=64:
            raise ValueError('Goldberg 拼块排布参考偏移 o 须为 −64–64 的有限数值。')
        if offset and order%2:
            raise ValueError('Goldberg 偏移拼块排布要求偶数旋转阶。')
        if source_variant=='full' and offset:
            raise ValueError('GoldbergTiling 完整排布不接受非零偏移。')
        if source_variant=='offset' and order%2:
            raise ValueError('GoldbergOffsetTiling 仅适用于偶数阶。')
        source_variant=source_variant or ('offset' if offset else 'full')
        tile_specs=goldberg_tile_specs(order,rings,offset,offset_tiling=source_variant=='offset')
        faces=[spec['vertices'] for spec in tile_specs]
        segments=[];seen=set()
        for face in faces:
            for a,b in zip(face,face[1:]+face[:1]):
                key=tuple(sorted((tuple(round(v,9) for v in a),tuple(round(v,9) for v in b))))
                if key not in seen:
                    seen.add(key)
                    segments.append([a,b])
        targets=[];dual_segments=[]
        topology='ordered-unit-triangle-tile-list'
    return {
        'kind':'goldberg-numerical-reference','mode':mode,
        'order':order,'rings':rings,'offset':offset,
        'sourceVariant':source_variant if mode=='tile-tiling' else None,
        'segments':segments,'faces':faces,'dualTargets':targets,
        'dualSegments':dual_segments,
        'tileSpecs':tile_specs,'tileFrameTranslation':[-offset/2,0] if offset else [0,0],
        'indexedGraph':indexed_graph,
        'triangleCount':rings*rings if mode=='sector-patch' else order*rings*rings,
        'sourceFunction':'GoldbergPatch' if mode=='sector-patch' else
                         ('MakeOffsetGoldbergTiling' if offset else 'MakeGoldbergTiling') if mode=='offset-lines' else
                         'GoldbergOffsetTiling' if source_variant=='offset' else 'GoldbergTiling',
        'topology':topology,'output':'reference-geometry',
        'creasePattern':False,'mountainValleyAssigned':False,
        'flatFoldabilityChecked':False,
    }
