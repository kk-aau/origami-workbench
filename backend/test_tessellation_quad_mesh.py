"""MakeQuadMesh contract against Origamica 15.0, notebook lines 145010–145965."""

import math
import unittest

from tessellation_quad_mesh import make_quad_mesh


class QuadMeshTests(unittest.TestCase):
    def test_original_square_3_by_3_vertex_edge_order_and_corners(self):
        # Original example In[2074]. Notebook indices are these values + 1.
        mesh = make_quad_mesh(3, 3, vertices_fn=lambda i, j: (i, j))
        self.assertEqual(mesh['vertices_coords'], [(i, j) for j in range(4) for i in range(4)])
        self.assertEqual(mesh['edges_vertices'][:12],
                         [(4*j+i, 4*j+i+1) for j in range(4) for i in range(3)])
        self.assertEqual(mesh['edges_vertices'][12:],
                         [(4*j+i, 4*(j+1)+i) for j in range(3) for i in range(4)])
        self.assertEqual(mesh['cornerIndices'], ((0, 3), (12, 15)))
        self.assertEqual(mesh['vertices_coords3d'][5], (1, 1, 0))
        self.assertEqual(mesh['faces_vertices'], [])
        self.assertEqual(mesh['edges_assignment'], ['U'] * 24)
        self.assertEqual(mesh['edges_foldAngleRad'], [0] * 24)

    def test_original_miura_formula_boundary_override_and_angle_zero(self):
        # Original In[2075] declares nv=3 but passes nh,nh, hence a 4x4 mesh.
        mesh = make_quad_mesh(
            4, 4, vertices_fn=lambda i, j: (2*i+(-.3 if j % 2 == 0 else 0), 3*j),
            horizontal_type_fn=lambda i, j: 'M' if (i+j) % 2 == 0 else 'V',
            vertical_type_fn=lambda i, j: 'V' if i % 2 == 0 else 'M',
            horizontal_angle_fn=lambda i, j: .4,
            vertical_angle_fn=lambda i, j: -.25,
            border_override=True)
        self.assertEqual((len(mesh['vertices_coords']), len(mesh['edges_vertices'])), (25, 40))
        self.assertEqual(mesh['cornerIndices'], ((0, 4), (20, 24)))
        self.assertEqual(mesh['edges_assignment'].count('B'), 16)
        self.assertEqual(mesh['edges_assignment'][:4], ['B'] * 4)
        self.assertEqual(mesh['edges_assignment'][4:8], ['V', 'M', 'V', 'M'])
        self.assertEqual(mesh['edges_assignment'][20:25], ['B', 'M', 'V', 'M', 'B'])
        self.assertTrue(all(angle == 0 for assignment, angle in zip(
            mesh['edges_assignment'], mesh['edges_foldAngleRad']) if assignment == 'B'))
        self.assertEqual(mesh['edges_foldAngleRad'][4], .4)
        self.assertEqual(mesh['edges_foldAngleRad'][21], -.25)

    def test_original_rotational_center_and_seam_merge(self):
        # Original In[2076]: nr=3, na=5; rows j=0 and j=5 coincide.
        mesh = make_quad_mesh(3, 5, vertices_fn=lambda i, j: (
            i * math.cos(2*math.pi*(j-1)/5),
            i * math.sin(2*math.pi*(j-1)/5)))
        self.assertEqual(len(mesh['vertices_coords']), 16)
        self.assertEqual(len(mesh['edges_vertices']), 30)
        self.assertEqual(mesh['cornerIndices'], ((0, 3), (0, 3)))
        self.assertEqual(mesh['indexGrid'][0], mesh['indexGrid'][5])
        self.assertTrue(all(row[0] == 0 for row in mesh['indexGrid']))
        self.assertEqual(len({frozenset(edge) for edge in mesh['edges_vertices']}), 30)

    def test_two_dimensional_coordinates_determine_identity_when_both_supplied(self):
        mesh = make_quad_mesh(1, 1,
            vertices_fn=lambda i, j: (i, 0),
            vertices3d_fn=lambda i, j: (i, j, j),
            same_pt_tolerance=0)
        self.assertEqual(mesh['vertices_coords'], [(0, 0), (1, 0)])
        self.assertEqual(mesh['vertices_coords3d'], [(0, 0, 0), (1, 0, 0)])
        self.assertEqual(mesh['indexGrid'], [[0, 1], [0, 1]])
        self.assertEqual(mesh['edges_vertices'], [(0, 1)])
        self.assertEqual(mesh['cornerIndices'], ((0, 1), (0, 1)))

    def test_three_dimensional_only_and_no_merging(self):
        mesh = make_quad_mesh(1, 1, vertices3d_fn=lambda i, j: (i, 0, 0))
        self.assertEqual(mesh['indexGrid'], [[0, 1], [0, 1]])
        self.assertEqual(mesh['vertices_coords'], [(0, 0), (1, 0)])
        no_merge = make_quad_mesh(1, 1, vertices3d_fn=lambda i, j: (i, 0, 0),
                                  same_pt_tolerance=None)
        self.assertEqual(no_merge['indexGrid'], [[0, 1], [2, 3]])
        self.assertEqual(len(no_merge['edges_vertices']), 4)

    def test_tolerance_is_inclusive_euclidean_distance(self):
        with_merge = make_quad_mesh(1, 1, vertices_fn=lambda i, j: (i, j*1e-6))
        self.assertEqual(len(with_merge['vertices_coords']), 2)
        without = make_quad_mesh(1, 1, vertices_fn=lambda i, j: (i, j*1.1e-6))
        self.assertEqual(len(without['vertices_coords']), 4)

    def test_invalid_inputs_are_rejected(self):
        for kwargs in ({'vertices_fn': None}, {'vertices_fn': lambda i,j: (i,j), 'same_pt_tolerance': -1},
                       {'vertices_fn': lambda i,j: (i,j), 'border_override': 1},
                       {'vertices_fn': lambda i,j: (i,j,float('nan'))},
                       {'vertices_fn': lambda i,j: (i,j), 'horizontal_angle_fn': lambda i,j: float('inf')}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                make_quad_mesh(1, 1, **kwargs)


if __name__ == '__main__':
    unittest.main()
