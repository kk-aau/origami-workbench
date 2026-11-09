"""Original ordered DualFaces survives both MaxMin flagstone return branches."""
import copy
import unittest
from unittest.mock import patch

import tessellation_flagstone as flagstone
from tessellation_meshes import custom_mesh
from tessellation_patterns import fold_from_faces


VERTICES = [[-1,-1],[0,-1],[1,-1],[-1,0],[0,0],[1,0],[-.5,1],[.5,1]]
FACES = [[0,1,4,3],[1,2,5,4],[3,4,6],[4,7,6],[4,5,7]]


class FlagstoneDualFacesTests(unittest.TestCase):
    def setUp(self):
        self.mother = fold_from_faces(VERTICES, FACES)
        # Original In1137 angle order -> In1278 RotateLeft, around source v4.
        self.expected_faces = [[1, 4, 3, 2, 0]]

    def assert_topology(self, dual):
        self.assertEqual(dual['faces_vertices'], self.expected_faces)
        self.assertEqual(dual['zhezhi_dual_primal_vertices'], [4])

    def test_default_optimized_branch_retains_source_face_and_mother_ids(self):
        before = copy.deepcopy(self.mother)
        _, dual = flagstone.maxmin_flagstone_centers(self.mother)
        self.assert_topology(dual)
        self.assertEqual(self.mother, before)

    def test_supplied_feasible_branch_preserves_exact_coordinates(self):
        from tessellation_meshes import reciprocal_centers
        targets, _ = reciprocal_centers(self.mother)
        before = copy.deepcopy(self.mother)
        with patch.object(flagstone, 'linprog', side_effect=AssertionError('feasible input must bypass LP')):
            centers, dual = flagstone.maxmin_flagstone_centers(self.mother, targets)
        self.assertEqual(centers, targets)
        self.assertEqual(dual['vertices_coords'], targets)
        self.assert_topology(dual)
        self.assertEqual(self.mother, before)

    def test_infeasible_supplied_target_enters_optimized_branch(self):
        from tessellation_meshes import reciprocal_centers
        targets, _ = reciprocal_centers(self.mother)
        targets[0][0] += .1
        with patch.object(flagstone, 'linprog', wraps=flagstone.linprog) as solver:
            centers, dual = flagstone.maxmin_flagstone_centers(self.mother, targets)
        self.assertEqual(solver.call_count, 1)
        self.assertNotEqual(centers, targets)
        self.assert_topology(dual)

    def test_existing_coordinate_face_only_caller_keeps_input_and_ids(self):
        mother = {k: copy.deepcopy(self.mother[k]) for k in ('vertices_coords', 'faces_vertices')}
        before = copy.deepcopy(mother)
        _, dual = flagstone.maxmin_flagstone_centers(mother)
        self.assert_topology(dual)
        self.assertEqual(mother, before)
        self.assertNotIn('edges_vertices', mother)

    def test_solver_failure_still_rejects_without_returning_a_dual(self):
        from types import SimpleNamespace
        before = copy.deepcopy(self.mother)
        with patch.object(flagstone, 'linprog', return_value=SimpleNamespace(success=False)):
            with self.assertRaisesRegex(ValueError, '双褶'):
                flagstone.maxmin_flagstone_centers(self.mother)
        self.assertEqual(self.mother, before)

    def test_missing_declared_edge_fails_instead_of_faking_empty_faces(self):
        invalid = copy.deepcopy(self.mother)
        invalid['edges_vertices'].pop()
        before = copy.deepcopy(invalid)
        with self.assertRaisesRegex(ValueError, '母面边'):
            flagstone.maxmin_flagstone_centers(invalid)
        self.assertEqual(invalid, before)

    def test_boundary_only_patch_retains_proven_empty_dual_face_list(self):
        mother = custom_mesh([[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]], [[0,1,4,3],[1,2,5,4]])
        _, dual = flagstone.maxmin_flagstone_centers(mother)
        self.assertEqual(dual['faces_vertices'], [])
        self.assertEqual(dual['zhezhi_dual_primal_vertices'], [])


if __name__ == '__main__':
    unittest.main()
