import unittest

from tessellation_tile_monolithic import merge_point, cleanup_collinear_edges


class MonolithicGraphOptionTests(unittest.TestCase):
    def test_same_point_tolerance_is_euclidean_and_can_be_disabled(self):
        vertices, buckets = [], {}
        first = merge_point([0, 0], vertices, buckets, 1e-4)
        near = merge_point([6e-5, 6e-5], vertices, buckets, 1e-4)
        far = merge_point([9e-5, 9e-5], vertices, buckets, 1e-4)
        self.assertEqual(first, near)
        self.assertNotEqual(first, far)
        exact, exact_buckets = [], {}
        self.assertNotEqual(merge_point([0, 0], exact, exact_buckets, 0),
                            merge_point([1e-12, 0], exact, exact_buckets, 0))

    def test_collinear_cleanup_preserves_fold_type_change(self):
        points = [[0, 0], [1, 0], [2, 0], [3, 0]]
        vertices, edges, types = cleanup_collinear_edges(
            points, [(0, 1), (1, 2), (2, 3)], ['B', 'B', 'M'], 1e-8)
        self.assertEqual(vertices, [[0, 0], [2, 0], [3, 0]])
        self.assertEqual(set((tuple(sorted(edge)), kind) for edge, kind in zip(edges, types)),
                         {((0, 1), 'B'), ((1, 2), 'M')})
        _, unchanged, kinds = cleanup_collinear_edges(
            points, [(0, 1), (1, 2)], ['M', 'V'], 1e-8)
        self.assertEqual(len(unchanged), 2)
        self.assertEqual(kinds, ['M', 'V'])

    def test_collinear_tolerance_does_not_erase_a_real_corner(self):
        points = [[0, 0], [1, 0], [2, 2e-4]]
        _, edges, _ = cleanup_collinear_edges(
            points, [(0, 1), (1, 2)], ['B', 'B'], 1e-4)
        self.assertEqual(len(edges), 2)


if __name__ == '__main__':
    unittest.main()
