import unittest

from tessellation_lff_reduction import lff_reduction_query, reduce_lff_vertex


class LffReductionTests(unittest.TestCase):
    def test_original_degree_six_example_fully_reduces(self):
        labels = list('abcdef')
        result = reduce_lff_vertex([100, 20, 30, 40, 50, 120], labels)
        self.assertEqual(result['crimpPairs'], [['b', 'c'], ['d', 'e'], ['a', 'f']])
        self.assertEqual([step['remaining'] for step in result['steps']][1],
                         [['a', 110.], ['d', 40.], ['e', 50.], ['f', 120.]])
        self.assertEqual(result['alternatingSums'], [180., 180.])
        self.assertTrue(result['fullyReduced'])

    def test_original_degree_eight_examples(self):
        first = reduce_lff_vertex([60, 20, 30, 40, 50, 60, 40, 60], list('abcdefgh'))
        self.assertEqual(first['crimpPairs'],
                         [['b', 'c'], ['d', 'e'], ['g', 'h'], ['a', 'f']])
        second = reduce_lff_vertex([60, 45, 40, 45, 40, 45, 40, 45], list('abcdefgh'))
        self.assertEqual(second['crimpPairs'],
                         [['c', 'd'], ['e', 'f'], ['g', 'h'], ['a', 'b']])
        self.assertTrue(first['fullyReduced'])
        self.assertTrue(second['fullyReduced'])

    def test_wraparound_first_sector_and_two_sector_final(self):
        result = reduce_lff_vertex([20, 50, 80, 50], list('abcd'))
        self.assertEqual(result['crimpPairs'], [['a', 'b'], ['c', 'd']])
        self.assertTrue(result['fullyReduced'])
        self.assertEqual(result['steps'][1]['remaining'], [['c', 80.], ['d', 80.]])

    def test_equal_neighbors_stop_without_falsely_claiming_full_reduction(self):
        result = reduce_lff_vertex([90, 90, 90, 90], list('abcd'))
        self.assertFalse(result['fullyReduced'])
        self.assertEqual(result['crimpPairs'], [])
        self.assertEqual(result['stopReason'], 'no_strict_local_minimum')
        self.assertEqual(len(result['steps']), 1)

    def test_near_tie_stops_at_numeric_tolerance(self):
        result = reduce_lff_vertex([90, 90 + 1e-10, 90, 90 - 1e-10])
        self.assertFalse(result['fullyReduced'])

    def test_validation_and_no_input_mutation(self):
        angles = [100, 20, 30, 40, 50, 120]
        labels = list('abcdef')
        reduce_lff_vertex(angles, labels)
        self.assertEqual(angles, [100, 20, 30, 40, 50, 120])
        self.assertEqual(labels, list('abcdef'))
        invalid = [([90, 90, 90], None), ([100, 20, 30, 40], None),
                   ([90, 90, 90, float('nan')], None),
                   ([90, 90, 90, 90], ['a', 'a', 'c', 'd'])]
        for sectors, names in invalid:
            with self.subTest(sectors=sectors, names=names):
                with self.assertRaises(ValueError):
                    reduce_lff_vertex(sectors, names)
        with self.assertRaises(ValueError):
            lff_reduction_query({'sectorAnglesDeg': [90] * 4, 'operation': 'unsafe'})


if __name__ == '__main__':
    unittest.main()
