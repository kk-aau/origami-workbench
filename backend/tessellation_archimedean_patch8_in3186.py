"""Source-preserving, prune-first construction of saved Origamica In[3186].

The notebook expands 120 ArchimedeanPatch[8] source tiles, keeps whole tiles
touching [0.1, 3.9]^2, then builds a monolithic centered Alt CP. We enumerate
the bounded source instances but weld and twist only the retained tiles.
No machine-readable Wolfram CP or folded Out is present in the notebook.
"""

from tessellation_archimedean_patch_catalog import archimedean_patch
from tessellation_lattice_patch import make_lattice_tiling, twist_patch_options
from tessellation_meshes import polygon_mesh
from tessellation_prune import intersects
from tessellation_tile_patch import construct_tile_patch


SOURCE_RANGES = ((-2, 2), (-1, 2))
WINDOW = ((.1, .1), (3.9, .1), (3.9, 3.9), (.1, 3.9))
SOURCE_TYPES = (('M',) * 4, ('V',) * 3, ('M',) * 4,
                ('V',) * 3, ('M',) * 4, ('V',) * 6)
MONOLITHIC_OPTIONS = {
    'mergedEdges': 'delete', 'samePtTolerance': 1e-8,
    'collinearCleanup': True, 'collinearTolerance': 1e-8,
}


def build_archimedean_patch8_in3186():
    """Return the saved CP with original lattice-cell and source-face IDs.

    This is deliberately a closed saved-example entry, not an arbitrary
    expression evaluator or a claim that its 3D deployment is certified.
    """
    from tessellate import check_geometry, check_local_conditions

    source = archimedean_patch(8)
    patch, lattice = source['sourceTiles'], source['lattice']
    instances = make_lattice_tiling(
        patch, lattice, SOURCE_RANGES[0], SOURCE_RANGES[1], max_tiles=120)
    if len(instances) != 120:
        raise ValueError('In[3186] source extent must contain 120 tiles.')
    retained = [item for item in instances if intersects(item['polygon'], WINDOW)]
    if len(retained) != 21:
        raise ValueError('In[3186] crop must retain exactly 21 source tiles.')
    mother = polygon_mesh([item['polygon'] for item in retained])
    if len(mother['faces_vertices']) != len(retained):
        raise ValueError('Saved crop changed source face identity.')
    mother['zhezhi_custom_face_index'] = [item['sourceFace'] for item in retained]
    mother['zhezhi_custom_polygons'] = [item['polygon'] for item in retained]
    mother['zhezhi_lattice_cells'] = [item['cell'] for item in retained]
    mother['zhezhi_lattice_ranges'] = [list(pair) for pair in SOURCE_RANGES]
    mother['zhezhi_lattice_vectors'] = lattice
    mother['zhezhi_original_tile_index'] = [item['tileIndex'] for item in retained]
    mother['zhezhi_archimedean_patch_number'] = 8

    source_mesh = polygon_mesh(patch)
    options = twist_patch_options(patch, SOURCE_TYPES, .12,
                                  variant='centered-angle', angle=29)
    fold = construct_tile_patch(
        mother, options, source_mesh['vertices_coords'],
        source_mesh['faces_vertices'], MONOLITHIC_OPTIONS)
    original_instances = fold['zhezhi_face_tile_instance']
    fold['zhezhi_face_tile_cell'] = [mother['zhezhi_lattice_cells'][index]
                                     for index in original_instances]
    fold['zhezhi_face_original_tile_index'] = [
        mother['zhezhi_original_tile_index'][index]
        for index in original_instances]
    fold['zhezhi_archimedean_patch_number'] = 8
    return {
        'source': {
            'cell': 'In[3186]', 'patch': 'ArchimedeanPatch[8]',
            'machineReadableWolframOut': False,
            'sourceRanges': [list(pair) for pair in SOURCE_RANGES],
            'pruneBoundary': [list(point) for point in WINDOW],
            'width': .12, 'twistAngleDeg': 29,
            'centralTypes': [list(item) for item in SOURCE_TYPES],
        },
        'counts': {
            'sourceTiles': len(instances), 'retainedTiles': len(retained),
            'vertices': len(fold['vertices_coords']),
            'edges': len(fold['edges_vertices']),
            'faces': len(fold['faces_vertices']),
        },
        'checks': {
            'geometry': check_geometry(fold),
            'local': check_local_conditions(fold),
        },
        'mother': mother, 'fold': fold,
    }
