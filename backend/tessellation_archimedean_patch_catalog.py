"""Bounded source catalog for Origamica section 37 ArchimedeanPatch[1..12].

Each row transcribes an explicit JoinTiling list and PatchVector(s) references
from the saved notebook. No Wolfram evaluator or inferred polygon placement is
used: joins reverse-match two unit edges, then the existing lattice mesh
adapter handles indexed translations and welding.
"""
import math

from tessellation_lattice_patch import lattice_patch_mesh, patch_check_parity, patch_vector


# (sides, (old tile, old edge's first vertex, new edge's last vertex))
_TILES = {
    1: ((3, None), (3, (1, 2, 1))),
    2: ((4, None),),
    3: ((6, None),),
    4: ((3, None), (3, (1, 2, 1)), (3, (2, 1, 1)),
        (3, (3, 2, 1)), (3, (4, 2, 2)), (3, (5, 2, 1)),
        (3, (6, 2, 2)), (3, (7, 3, 2)), (6, (2, 2, 2))),
    5: ((3, None), (3, (1, 3, 2)), (3, (2, 3, 3)),
        (3, (3, 3, 2)), (3, (4, 2, 2)), (3, (5, 3, 2)),
        (3, (6, 2, 2)), (3, (7, 2, 1)), (6, (2, 2, 2))),
    6: ((3, None), (3, (1, 2, 1)), (4, (2, 2, 2))),
    7: ((3, None), (4, (1, 2, 1)), (3, (2, 3, 2)),
        (3, (3, 2, 1)), (4, (3, 3, 3)), (3, (5, 1, 3))),
    8: ((4, None), (3, (1, 1, 3)), (4, (2, 1, 1)),
        (3, (3, 2, 1)), (4, (4, 2, 1)), (6, (1, 2, 1))),
    9: ((3, None), (6, (1, 2, 1)), (3, (2, 3, 1))),
    10: ((3, None), (12, (1, 2, 12)), (3, (2, 5, 1))),
    11: ((4, None), (6, (1, 2, 6)), (4, (2, 3, 1)),
         (6, (3, 2, 1)), (4, (4, 4, 2)), (12, (1, 3, 2))),
    12: ((4, None), (8, (1, 2, 8))),
}

# Each pair is (start, end), with source 1-based {tile, vertex} references.
# PatchVectors shares a start point in the notebook; PatchVector is used for
# n=5 and n=8, which have different starts. The output rule is identical.
_VECTORS = {
    1: (((1, 1), (1, 2)), ((1, 1), (1, 3))),
    2: (((1, 1), (1, 2)), ((1, 1), (1, 4))),
    3: (((1, 1), (1, 3)), ((1, 1), (1, 5))),
    4: (((1, 1), (4, 2)), ((1, 1), (9, 5))),
    5: (((4, 3), (1, 2)), ((1, 1), (9, 5))),
    6: (((1, 1), (1, 2)), ((1, 1), (3, 4))),
    7: (((1, 1), (2, 2)), ((1, 1), (5, 4))),
    8: (((1, 4), (6, 4)), ((4, 1), (6, 4))),
    9: (((1, 1), (2, 2)), ((1, 1), (2, 5))),
    10: (((1, 1), (2, 3)), ((1, 1), (2, 8))),
    11: (((1, 1), (4, 2)), ((1, 1), (6, 8))),
    12: (((1, 1), (2, 3)), ((1, 1), (2, 6))),
}

_VERTEX_TYPES = {
    1: (3, 3, 3, 3, 3, 3), 2: (4, 4, 4, 4), 3: (6, 6, 6),
    4: (3, 3, 3, 3, 6), 5: (3, 3, 3, 3, 6),
    6: (3, 3, 3, 4, 4), 7: (3, 3, 4, 3, 4), 8: (3, 4, 6, 4),
    9: (3, 6, 3, 6), 10: (3, 12, 12), 11: (4, 6, 12), 12: (4, 8, 8),
}

# (JoinTiling definition, lattice vector definition, saved 2x2 example).
_NOTEBOOK_INS = {
    number: (3104 + 4*(number-1), 3105 + 4*(number-1), 3106 + 4*(number-1))
    for number in range(1, 13)
}
# In[3150] additionally FullSimplify's n=12 before the saved example.
_NOTEBOOK_INS[12] = (3148, 3149, 3151)

# Section 37's separate TwoColorableArchimedeanPatch namespace. In[3160]'s
# n=2 is a new two-square source; the other three are aliases of ordinary
# ArchimedeanPatch geometry with independent parity.
_TWO_COLORABLE_PARITY = {
    1: (1, -1), 2: (1, -1), 8: (1, -1, 1, -1, 1, -1),
    9: (1, -1, 1),
}
_TWO_COLORABLE_TILES_2 = ((4, None), (4, (1, 2, 1)))
_TWO_COLORABLE_VECTORS_2 = (
    ((1, 1), (2, 2)), ((1, 1), (1, 3)),
)
_TWO_COLORABLE_INS = {1: (3156, 3159), 2: (3160, 3163),
                      8: (3164, 3167), 9: (3168, 3171)}


def _unit_regular(sides):
    vertices = [0j]
    for k in range(sides - 1):
        angle = 2 * math.pi * k / sides
        vertices.append(vertices[-1] + complex(math.cos(angle), math.sin(angle)))
    return vertices


def _join(new, old, old_vertex, new_vertex):
    old_start, old_end = old[old_vertex - 1], old[old_vertex % len(old)]
    new_end = new[new_vertex - 1]
    new_start = new[(new_vertex - 2) % len(new)]
    rotation = (old_start - old_end) / (new_end - new_start)
    if abs(abs(rotation) - 1) > 1e-10:
        raise ValueError('原版 JoinTiling 边长不一致。')
    return [old_end + rotation * (point - new_start) for point in new]


def archimedean_patch_catalog():
    """Return immutable-value source records, excluding inferred examples."""
    return {number: {
        'vertexType': _VERTEX_TYPES[number],
        'tileSpecs': _TILES[number],
        'vectorRefs': _VECTORS[number],
        'notebookIn': _NOTEBOOK_INS[number],
        'sampleRanges': ((0, 1), (0, 1)),
    } for number in sorted(_TILES)}


def _assemble(number, tile_specs, vector_refs):
    """Shared rigid-edge constructor for ordinary and two-colorable specs."""
    raw = []
    for sides, link in tile_specs:
        polygon = _unit_regular(sides)
        if link is not None:
            source, old_vertex, new_vertex = link
            if not 1 <= source <= len(raw) or not 1 <= old_vertex <= len(raw[source-1]) or not 1 <= new_vertex <= sides:
                raise ValueError('原版 JoinTiling 静态接边引用无效。')
            polygon = _join(polygon, raw[source-1], old_vertex, new_vertex)
        raw.append(polygon)
    patch = [[[point.real, point.imag] for point in polygon] for polygon in raw]
    vectors = [patch_vector(patch, start, end) for start, end in vector_refs]
    determinant = vectors[0][0]*vectors[1][1]-vectors[0][1]*vectors[1][0]
    area = sum(abs(sum(a[0]*b[1]-a[1]*b[0] for a, b in
                       zip(polygon, polygon[1:]+polygon[:1])))/2 for polygon in patch)
    if determinant <= 1e-10 or abs(area-determinant) > 1e-8*max(1, area):
        raise ValueError('来源拼块面积与静态格矢单元不一致。')
    return {'number': number, 'vertexType': list(_VERTEX_TYPES[number]),
            'sourceTiles': patch, 'lattice': vectors}


def archimedean_patch(number):
    """Build one explicit ordinary source patch and its two lattice vectors."""
    if isinstance(number, bool) or not isinstance(number, int) or number not in _TILES:
        raise ValueError('仅支持第 37 节显式 JoinTiling 与格矢定义的 ArchimedeanPatch[1..12]。')
    return _assemble(number, _TILES[number], _VECTORS[number])


def archimedean_lattice_mesh(number, range1, range2):
    """Expand a catalog entry through the already checked lattice adapter."""
    source = archimedean_patch(number)
    mesh = lattice_patch_mesh(source['sourceTiles'], source['lattice'], range1, range2)
    mesh['zhezhi_archimedean_patch_number'] = number
    mesh['zhezhi_archimedean_vertex_type'] = source['vertexType']
    return mesh


def two_colorable_archimedean_patch_catalog():
    """Return the four explicitly saved two-colorable source definitions."""
    return {number: {
        'vertexType': _VERTEX_TYPES[number],
        'tileSpecs': (_TWO_COLORABLE_TILES_2 if number == 2 else _TILES[number]),
        'vectorRefs': (_TWO_COLORABLE_VECTORS_2 if number == 2 else _VECTORS[number]),
        'aliasOf': None if number == 2 else number,
        'parity': _TWO_COLORABLE_PARITY[number],
        'notebookIn': _TWO_COLORABLE_INS[number],
        'sampleRanges': ((0, 1), (0, 1)),
    } for number in sorted(_TWO_COLORABLE_PARITY)}


def two_colorable_archimedean_patch(number):
    """Build the explicit n=1/2/8/9 source and retain its offset parity."""
    if (isinstance(number, bool) or not isinstance(number, int) or
            number not in _TWO_COLORABLE_PARITY):
        raise ValueError('二色 ArchimedeanPatch 仅有原版显式定义的 1、2、8、9。')
    source = (_assemble(number, _TWO_COLORABLE_TILES_2,
                        _TWO_COLORABLE_VECTORS_2) if number == 2 else
              archimedean_patch(number))
    source['variant'] = 'two-colorable'
    source['parity'] = patch_check_parity(
        source['sourceTiles'], _TWO_COLORABLE_PARITY[number])
    return source


def two_colorable_archimedean_lattice_mesh(number, range1, range2):
    """Use the same lattice backend while preserving two-colorable provenance."""
    source = two_colorable_archimedean_patch(number)
    mesh = lattice_patch_mesh(source['sourceTiles'], source['lattice'], range1, range2)
    mesh['zhezhi_archimedean_patch_number'] = number
    mesh['zhezhi_archimedean_variant'] = 'two-colorable'
    mesh['zhezhi_archimedean_parity'] = source['parity']
    mesh['zhezhi_archimedean_vertex_type'] = source['vertexType']
    return mesh
