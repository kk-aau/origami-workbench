"""Origamica-style lattice expansion of an already embedded polygon patch.

PatchVector(s) use the original 1-based tile/vertex references. Source polygons
are the equivalent of EmbedTiling[patch, TileVertices] after RegularizePatch.
MakeLatticeTiling uses inclusive j2-outer, j1-inner index loops, preserving the
source tile index in every copy. The mesh adapter welds shared geometry through
the existing polygon_mesh routine; it does not claim a flat-foldable CP.
"""
import math

from tessellation_meshes import polygon_mesh


def _point(value, label):
    if (not isinstance(value, (list, tuple)) or len(value) != 2 or
            any(isinstance(x, bool) or not isinstance(x, (int, float)) or
                not math.isfinite(x) for x in value)):
        raise ValueError(f'{label}须为两个有限数字。')
    return [float(value[0]), float(value[1])]


def _patch(patch):
    if not isinstance(patch, (list, tuple)) or not 1 <= len(patch) <= 96:
        raise ValueError('原始拼块需包含 1–96 个多边形。')
    result = []
    for index, polygon in enumerate(patch):
        if not isinstance(polygon, (list, tuple)) or not 3 <= len(polygon) <= 24:
            raise ValueError(f'第 {index+1} 个拼块的顶点数无效。')
        points = [_point(point, f'第 {index+1} 个拼块顶点') for point in polygon]
        twice_area = sum(a[0]*b[1]-a[1]*b[0] for a, b in zip(points, points[1:]+points[:1]))
        if abs(twice_area) < 1e-10 or len({tuple(point) for point in points}) != len(points):
            raise ValueError(f'第 {index+1} 个拼块面积退化或有重复顶点。')
        result.append(points)
    return result


def polygons_from_custom(vertices, faces):
    """Adapt the existing zero-based custom vertices/faces into source tiles."""
    if not isinstance(vertices, (list, tuple)) or not isinstance(faces, (list, tuple)):
        raise ValueError('自定义顶点和面须为列表。')
    points = [_point(point, '自定义顶点') for point in vertices]
    if not points or not faces:
        raise ValueError('自定义拼块不可为空。')
    polygons = []
    for index, face in enumerate(faces):
        if (not isinstance(face, (list, tuple)) or len(face) < 3 or
                any(isinstance(vertex, bool) or not isinstance(vertex, int) or
                    not 0 <= vertex < len(points) for vertex in face)):
            raise ValueError(f'第 {index+1} 个自定义面编号无效。')
        polygons.append([points[vertex] for vertex in face])
    return _patch(polygons)


def _reference(patch, reference):
    if (not isinstance(reference, (list, tuple)) or len(reference) != 2 or
            any(isinstance(index, bool) or not isinstance(index, int) for index in reference)):
        raise ValueError('顶点引用须为原版 1-based 的 {拼块编号, 顶点编号}。')
    tile, vertex = reference
    if not 1 <= tile <= len(patch) or not 1 <= vertex <= len(patch[tile-1]):
        raise ValueError('拼块或顶点编号越界。')
    return patch[tile-1][vertex-1]


def patch_vector(patch, start, end):
    """Origamica PatchVector; tile/vertex references are 1-based."""
    source = _patch(patch)
    a, b = _reference(source, start), _reference(source, end)
    return [b[0]-a[0], b[1]-a[1]]


def patch_vectors(patch, start, first, second):
    """Origamica PatchVectors with one shared 1-based origin reference."""
    source = _patch(patch)
    a, b, c = (_reference(source, ref) for ref in (start, first, second))
    return [[b[0]-a[0], b[1]-a[1]], [c[0]-a[0], c[1]-a[1]]]


def _range(value, label):
    if (not isinstance(value, (list, tuple)) or len(value) != 2 or
            any(isinstance(x, bool) or not isinstance(x, int) or abs(x) > 64 for x in value) or
            value[0] > value[1]):
        raise ValueError(f'{label}须为 -64–64 内升序的整数闭区间。')
    return list(value)


def _lattice(value):
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise ValueError('格矢须为两个二维向量。')
    u, v = (_point(vector, '格矢') for vector in value)
    if abs(u[0]*v[1]-u[1]*v[0]) < 1e-8:
        raise ValueError('两个格矢不能为零或共线。')
    return [u, v]


def make_lattice_tiling(patch, lattice, range1, range2, *, max_tiles=192):
    """Return translated tile instances in the notebook's exact loop order.

    `cell` is [j1,j2], while the outer loop is j2 and the inner loop is j1.
    Tile indices and sourceFace are zero-based metadata for existing consumers.
    """
    source, (u, v) = _patch(patch), _lattice(lattice)
    low1, high1 = _range(range1, '第一格矢范围')
    low2, high2 = _range(range2, '第二格矢范围')
    total = len(source)*(high1-low1+1)*(high2-low2+1)
    if isinstance(max_tiles, bool) or not isinstance(max_tiles, int) or max_tiles < 1 or total > max_tiles:
        raise ValueError(f'格点展开产生 {total} 个拼块，超过 {max_tiles} 个的上限。')
    instances = []
    for j2 in range(low2, high2+1):
        for j1 in range(low1, high1+1):
            translation = [j1*u[0]+j2*v[0], j1*u[1]+j2*v[1]]
            for source_index, polygon in enumerate(source):
                points = [[point[0]+translation[0], point[1]+translation[1]] for point in polygon]
                instances.append({'tileIndex': len(instances), 'sourceFace': source_index,
                                  'cell': [j1, j2], 'translation': translation.copy(),
                                  'polygon': points})
    return instances


def lattice_patch_mesh(patch, lattice, range1, range2, *, max_tiles=192):
    """Weld shared vertices/edges while retaining source identity per face."""
    instances = make_lattice_tiling(patch, lattice, range1, range2, max_tiles=max_tiles)
    polygons = [instance['polygon'] for instance in instances]
    mesh = polygon_mesh(polygons)
    if len(mesh['faces_vertices']) != len(instances):
        raise ValueError('格点展开包含退化拼块，无法保持源拼块索引。')
    mesh['zhezhi_custom_face_index'] = [instance['sourceFace'] for instance in instances]
    mesh['zhezhi_custom_polygons'] = polygons
    mesh['zhezhi_lattice_cells'] = [instance['cell'] for instance in instances]
    mesh['zhezhi_lattice_ranges'] = [_range(range1, '第一格矢范围'),
                                      _range(range2, '第二格矢范围')]
    mesh['zhezhi_lattice_vectors'] = _lattice(lattice)
    return mesh


def patch_check_types(patch, types):
    """Check one M/V assignment per source tile edge, as PatchCheckTypes."""
    source = _patch(patch)
    if not isinstance(types, (list, tuple)) or len(types) != len(source):
        raise ValueError('中心山谷赋型数量必须与原始拼块数量一致。')
    for i, (polygon, assignments) in enumerate(zip(source, types)):
        if (not isinstance(assignments, (list, tuple)) or len(assignments) != len(polygon) or
                any(value not in ('M', 'V') for value in assignments)):
            raise ValueError(f'第 {i+1} 个拼块的中心山谷须逐边指定 M/V。')
    return [list(assignments) for assignments in types]


def patch_check_parity(patch, parity):
    """Check one ±1 offset direction per source tile, as PatchCheckParity."""
    source = _patch(patch)
    if (not isinstance(parity, (list, tuple)) or len(parity) != len(source) or
            any(isinstance(value, bool) or value not in (-1, 1) for value in parity)):
        raise ValueError('偏置奇偶向量须逐原始拼块指定 +1 或 -1。')
    return list(parity)


def twist_patch_options(patch, types, width, *, variant='offset', offset=0.,
                        tilt=70., angle=35., parity=None):
    """Per-source options for the existing construct_tile_patch adapter.

    Implements the notebook's centered, centered-alt and offset Patch mapping;
    it does not silently claim that all assignments produce a global FF.
    """
    assignments = patch_check_types(patch, types)
    if (isinstance(width, bool) or not isinstance(width, (int, float)) or
            not math.isfinite(width) or not 0 < width < 1 or variant not in
            ('centered', 'centered-angle', 'offset')):
        raise ValueError('拼块褶宽或扭转变体无效。')
    if variant == 'offset':
        signs = patch_check_parity(patch, parity)
        if (isinstance(offset, bool) or not isinstance(offset, (int, float)) or
                not math.isfinite(offset) or abs(offset)+width/2 >= .5):
            raise ValueError('偏置超出单元边界。')
        return [dict(width=float(width), offset=float(sign*offset), tilt=90.,
                     centralTypes=assignment) for sign, assignment in zip(signs, assignments)]
    if parity is not None:
        raise ValueError('居中拼块不使用偏置奇偶向量。')
    if variant == 'centered-angle':
        if (isinstance(angle, bool) or not isinstance(angle, (int, float)) or
                not math.isfinite(angle) or not 0 < angle < 180):
            raise ValueError('扭角须在 0°–180° 之间。')
        radians = math.radians(angle)
        tilt = math.degrees(math.atan2(math.sin(radians), width*math.cos(radians)))
    elif (isinstance(tilt, bool) or not isinstance(tilt, (int, float)) or
          not math.isfinite(tilt) or not 0 < tilt < 180):
        raise ValueError('褶倾角须在 0°–180° 之间。')
    return [dict(width=float(width), offset=0., tilt=float(tilt),
                 centralTypes=assignment) for assignment in assignments]
