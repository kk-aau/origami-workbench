"""Saved In[3378] bounded Voronoi primal/dual contract."""
import math
import unittest

from tessellate import generate
from tessellation_meshes import site_mesh
from tessellation_prune import prune_mesh


SITES = [[.16, .18], [.78, .19], [.72, .82], [.21, .67]]


class OriginalVoronoiDualTests(unittest.TestCase):
    def test_each_input_site_is_the_corresponding_dual_vertex(self):
        mesh = site_mesh('voronoi', SITES)
        self.assertEqual(mesh['zhezhi_voronoi_dual_targets'], SITES)
        result = generate(dict(family='nonperiodic', kind='voronoi', points=SITES,
                               count=len(SITES), angle=15, scale=.3))
        self.assertEqual(result['mother']['zhezhi_voronoi_dual_targets'], SITES)
        self.assertEqual(result['dual']['vertices_coords'], SITES)
        self.assertEqual(result['source']['dual'], 'input Voronoi seeds')
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')

        coords = result['mother']['vertices_coords']
        faces = result['mother']['faces_vertices']
        owners = {}
        for face_id, face in enumerate(faces):
            for a, b in zip(face, face[1:] + face[:1]):
                owners.setdefault(tuple(sorted((a, b))), []).append(face_id)
        for (a, b), adjacent in owners.items():
            if len(adjacent) != 2:
                continue
            edge = [coords[b][k] - coords[a][k] for k in (0, 1)]
            sites = [SITES[adjacent[1]][k] - SITES[adjacent[0]][k] for k in (0, 1)]
            self.assertLess(abs(sum(x*y for x, y in zip(edge, sites))), 1e-7)

    def test_whole_tile_pruning_preserves_site_face_order(self):
        window = [[.5, .02], [.98, .02], [.98, .98], [.5, .98]]
        mesh = prune_mesh(site_mesh('voronoi', SITES), window)
        self.assertEqual(mesh['zhezhi_voronoi_dual_targets'], SITES[1:])
        result = generate(dict(family='nonperiodic', kind='voronoi', points=SITES,
                               count=len(SITES), angle=15, scale=.3,
                               pruneBoundary=window))
        self.assertEqual(result['mother']['zhezhi_voronoi_dual_targets'], SITES[1:])
        self.assertEqual(result['dual']['vertices_coords'], SITES[1:])
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')

    def test_skew_boundary_and_nested_primal_dual_keep_exact_sites(self):
        sites = [[.15, .2], [1.1, .2], [1.35, .9], [.9, 1.35], [.2, 1.05]]
        boundary = [[0, 0], [1.4, 0], [1.8, .9], [1.2, 1.7], [.1, 1.5], [-.2, .7]]
        mother = dict(family='nonperiodic', kind='voronoi', points=sites,
                      count=len(sites), boundary=boundary, angle=15, scale=.3)
        for params in (mother, dict(family='primal-dual', motherParams=mother,
                                    angle=15, scale=.3)):
            with self.subTest(family=params['family']):
                result = generate(params)
                self.assertEqual(result['mother']['zhezhi_voronoi_dual_targets'], sites)
                self.assertEqual(result['dual']['vertices_coords'], sites)
                self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')

    def test_explicit_dual_edit_still_projects_edit_instead_of_resetting_sites(self):
        params = dict(family='nonperiodic', kind='voronoi', points=SITES,
                      count=len(SITES), angle=15, scale=.3)
        base = generate(params)
        edited = [point[:] for point in SITES]
        edited[0][0] += .04
        changed = generate({**params, 'dualTargets': edited})
        self.assertGreater(max(math.dist(a, b) for a, b in zip(SITES, changed['dual']['vertices_coords'])), .001)
        self.assertNotEqual(changed['fold']['vertices_coords'], base['fold']['vertices_coords'])
        self.assertEqual(changed['stats']['checks']['geometry']['status'], 'passed')

    def test_short_bisector_edges_do_not_move_valid_random_sites(self):
        # These seeds create sub-millimetre Voronoi edges after source mesh
        # rounding.  A reciprocal least-squares solve moves otherwise valid
        # site coordinates unless we retain the originals explicitly.
        for seed in (10, 13, 39):
            with self.subTest(seed=seed):
                result = generate(dict(family='nonperiodic', kind='voronoi',
                                       count=9, seed=seed))
                self.assertEqual(result['dual']['vertices_coords'],
                                 result['source']['seedPoints'])
                self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')


if __name__ == '__main__':
    unittest.main()
