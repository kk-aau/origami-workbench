"""Exact seam counterexample for repeating Origamica In[3182]'s Alt recipe.

The notebook saves the three-tile Alt patch and a separate 2x2 untwisted
lattice. Applying the saved per-source recipe to several cells is an explicit
extension, not a claimed saved Wolfram output.
"""
import math
import unittest

from tessellation_archimedean_patch_catalog import archimedean_patch, archimedean_lattice_mesh
from tessellation_lattice_patch import twist_patch_options
from tessellation_meshes import polygon_mesh
from tessellation_tile_patch import construct_tile_patch
from tessellation_tile_twist import polygon_pleat_tile
from tessellate import check_geometry, check_local_conditions, generate


H = math.sqrt(3) / 2
SAVED_TYPES = [['M'] * 3, ['V'] * 3, ['M'] * 4]


def saved_recipe():
    source = archimedean_patch(6)
    unit = polygon_mesh(source['sourceTiles'])
    options = twist_patch_options(source['sourceTiles'], SAVED_TYPES, .2,
                                  variant='centered-angle', angle=25)
    return source, unit, options


def independent_seam_rays(mother, options, point):
    """Read rays on a seam from independently made tiles, before graph gluing."""
    found = []
    for polygon, source, cell in zip(mother['zhezhi_custom_polygons'],
                                     mother['zhezhi_custom_face_index'],
                                     mother['zhezhi_lattice_cells']):
        option = options[source]
        tile, _, _ = polygon_pleat_tile(polygon, option['width'], option['offset'],
                                        option['tilt'], option['centralTypes'])
        vertices = [i for i, xy in enumerate(tile['vertices_coords'])
                    if math.dist(xy, point) < 1e-8]
        for vertex in vertices:
            rays = [assignment for (a, b), assignment in
                    zip(tile['edges_vertices'], tile['edges_assignment'])
                    if vertex in (a, b) and assignment != 'B']
            if rays:
                found.append((tuple(cell), source, rays))
    return found


class ArchimedeanPatch6AltSeamsTests(unittest.TestCase):
    def test_saved_single_patch_still_passes_geometry_and_local_conditions(self):
        _, unit, options = saved_recipe()
        mother = archimedean_lattice_mesh(6, [0, 0], [0, 0])
        fold = construct_tile_patch(mother, options,
                                    unit['vertices_coords'], unit['faces_vertices'])
        self.assertEqual(check_geometry(fold)['status'], 'passed')
        self.assertEqual(check_local_conditions(fold)['status'], 'passed')

    def test_first_lattice_direction_has_fixed_square_square_mv_conflict(self):
        _, unit, options = saved_recipe()
        mother = archimedean_lattice_mesh(6, [0, 1], [0, 0])
        # Both vertices are interior after the coincident B edges are deleted.
        # A degree-two vertex must be MM or VV by Maekawa, not MV.
        self.assertEqual(independent_seam_rays(mother, options, [1.5, H + .4]),
                         [((0, 0), 2, ['M']), ((1, 0), 2, ['V'])])
        self.assertEqual(independent_seam_rays(mother, options, [1.5, H + .6]),
                         [((0, 0), 2, ['V']), ((1, 0), 2, ['M'])])
        with self.assertRaisesRegex(ValueError,
                                    r'Maekawa：顶点 \(1\.5, 1\.2660254\) 有 M=1、V=1'):
            construct_tile_patch(mother, options,
                                 unit['vertices_coords'], unit['faces_vertices'])

    def test_second_lattice_direction_has_fixed_square_triangle_mv_conflict(self):
        _, unit, options = saved_recipe()
        mother = archimedean_lattice_mesh(6, [0, 0], [0, 1])
        self.assertEqual(independent_seam_rays(mother, options, [.9, 1 + H]),
                         [((0, 0), 2, ['V']), ((0, 1), 0, ['M'])])
        with self.assertRaisesRegex(ValueError,
                                    r'Maekawa：顶点 \(0\.9, 1\.8660254\) 有 M=1、V=1'):
            construct_tile_patch(mother, options,
                                 unit['vertices_coords'], unit['faces_vertices'])

    def test_saved_two_by_two_mother_with_alt_recipe_is_rejected_at_dispatch(self):
        source, unit, options = saved_recipe()
        request = dict(family='custom', vertices=unit['vertices_coords'],
                       faces=unit['faces_vertices'], repeatX=1, repeatY=1,
                       lattice=source['lattice'], range1=[0, 1], range2=[0, 1],
                       customOutput='tile-twists', tileTwists=options,
                       angle=36, scale=.3)
        with self.assertRaisesRegex(ValueError, r'Maekawa.*M=1、V=1'):
            generate(request)


if __name__ == '__main__':
    unittest.main()
