import unittest

from tessellation_huffman_circle4_query import (
    query_huffman_circle4, validate_huffman_circle4_query,
)


class HuffmanCircle4QueryTests(unittest.TestCase):
    def test_saved_pair_keeps_the_larger_third_spatial_ruling_explicit(self):
        result = query_huffman_circle4({'family': 'huffman-circle4-in4072'})
        self.assertEqual(result['source']['samplingStatus'], 'saved-input')
        self.assertEqual(len(result['sample']['rows']), 26)
        self.assertLess(result['closure']['maximumAbsoluteResidual'], 2e-6)
        self.assertFalse(result['closure']['rootUniqueCertified'])
        self.assertFalse(result['certification']['completeBlockExactIsometry'])
        self.assertFalse(result['certification']['exactStraightCreaseFOLD'])
        self.assertFalse(result['certification']['adoptableCreasePattern'])
        self.assertFalse(result['source']['machineReadableWolframOut'])
        for row in result['sample']['rows']:
            self.assertEqual(len(row['flat']), 4)
            self.assertEqual(len(row['folded']), 4)
            self.assertEqual(len(row['flatMirror']), 4)
            self.assertEqual(len(row['foldedMirror']), 4)
            self.assertAlmostEqual(row['foldedThirdRulingLength'] -
                                   row['flatThirdRulingLength'], 1e-6, places=11)

    def test_bounded_sampling_is_marked_as_local_extension(self):
        result = query_huffman_circle4({
            'family': 'huffman-circle4-in4072', 'divisions': 8})
        self.assertEqual(len(result['sample']['rows']), 9)
        self.assertEqual(result['source']['samplingStatus'], 'bounded-local-extension')

    def test_rejects_arbitrary_expressions_and_unbounded_numbers(self):
        for bad in (
            {'family': 'huffman-circle4-in4072', 'expression': 'Sin[t]'},
            {'family': 'huffman-circle4-in4072', 'divisions': True},
            {'family': 'huffman-circle4-in4072', 'divisions': 7},
            {'family': 'huffman-circle4-in4072', 'divisions': 65},
            {'family': 'huffman-circle4-in4072', 'divisions': '25'},
            {'family': 'other'},
        ):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                validate_huffman_circle4_query(bad)


if __name__ == '__main__':
    unittest.main()
