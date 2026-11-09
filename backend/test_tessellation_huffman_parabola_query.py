"""Focused checks for the partially worked-out saved parabola example."""

import json
import math
import unittest

import numpy as np

from tessellation_huffman_parabola import (
    HALF_PI, SAVED_PARAMETERS_DEG, THIRD_RULING_OFFSET, saved_parabola_audit,
)
from tessellation_huffman_parabola_query import (
    query_huffman_parabola, validate_huffman_parabola_query,
)


class HuffmanParabolaQueryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = saved_parabola_audit()
        cls.result = query_huffman_parabola({'family': 'huffman-parabola-in4060'})

    def test_only_bounded_saved_family_is_accepted(self):
        for query in (
            None, {}, {'family': 'huffman-circle4-in4072'},
            {'family': 'huffman-parabola-in4060', 'divisions': True},
            {'family': 'huffman-parabola-in4060', 'divisions': 65},
            {'family': 'huffman-parabola-in4060', 'divisions': 7},
            {'family': 'huffman-parabola-in4060', 'parametersDeg': list(SAVED_PARAMETERS_DEG)},
        ):
            with self.subTest(query=query), self.assertRaises(ValueError):
                validate_huffman_parabola_query(query)
        self.assertEqual(validate_huffman_parabola_query(
            {'family': 'huffman-parabola-in4060'}
        )['divisions'], 25)

    def test_saved_parabola_equation_and_sampling_anchors(self):
        result = self.result
        self.assertEqual(result['source']['savedParametersDeg'], [5, 85, 60, -90])
        self.assertEqual(result['source']['originalCompletionStatus'], 'partially-worked-out')
        self.assertEqual(result['source']['samplingStatus'], 'saved-input')
        self.assertFalse(result['source']['machineReadableWolframOut'])
        self.assertEqual(result['sample']['pairedBlocks'], 2)
        rows = result['sample']['rows']
        self.assertEqual(len(rows), 26)
        self.assertAlmostEqual(rows[0]['t'], 0)
        self.assertAlmostEqual(rows[-1]['t'], HALF_PI)
        np.testing.assert_allclose(rows[0]['flat'][2], (2, 0), atol=1e-12)
        np.testing.assert_allclose(rows[0]['flat'][3], (2, 0), atol=1e-12)
        self.assertGreater(rows[-1]['flat'][2][1], 0)
        self.assertAlmostEqual(rows[-1]['flat'][2][0]
                               + rows[-1]['flat'][2][1] ** 2 / 8, 2, places=10)
        self.assertAlmostEqual(rows[-1]['flat'][3][0], 2, places=12)
        json.dumps(result, allow_nan=False)

    def test_literal_offset_prohibits_complete_isometry_and_adoption(self):
        result = self.result
        for row in result['sample']['rows']:
            flat = np.asarray(row['flat'])
            folded = np.asarray(row['folded'])
            self.assertAlmostEqual(np.linalg.norm(flat[3] - flat[2]),
                                   row['flatThirdRulingLength'], places=10)
            self.assertAlmostEqual(np.linalg.norm(folded[3] - folded[2]),
                                   row['foldedThirdRulingLength'], places=9)
            self.assertAlmostEqual(row['foldedThirdRulingLength']
                                   - row['flatThirdRulingLength'],
                                   THIRD_RULING_OFFSET, places=12)
        self.assertFalse(result['certification']['completeBlockExactIsometry'])
        self.assertFalse(result['certification']['exactStraightCreaseFOLD'])
        self.assertFalse(result['certification']['adoptableCreasePattern'])
        self.assertFalse(result['diagnostics']['closureConditionsSaved'])

    def test_first_two_patches_local_metric_and_active_cylinder_direction(self):
        # Independent finite differences of the actual 2D/3D surface samples.
        model = self.model
        t = (model.parameters.first_cone_end + model.parameters.second_cone_start) / 2
        h = 2e-5

        def surface(u, width, folded):
            frame = model.frame(u)
            a, b = ('ff1', 'ff2') if folded else ('f1', 'f2')
            return (1 - width) * frame[a] + width * frame[b]

        for width in (0.0, 0.4, 1.0):
            flat_t = (surface(t + h, width, False) - surface(t - h, width, False)) / (2 * h)
            folded_t = (surface(t + h, width, True) - surface(t - h, width, True)) / (2 * h)
            flat_r = surface(t, 1, False) - surface(t, 0, False)
            folded_r = surface(t, 1, True) - surface(t, 0, True)
            self.assertLess(abs(np.dot(flat_t, flat_t) - np.dot(folded_t, folded_t)), 3e-7)
            self.assertLess(abs(np.dot(flat_t, flat_r) - np.dot(folded_t, folded_r)), 3e-7)
            self.assertLess(abs(np.dot(flat_r, flat_r) - np.dot(folded_r, folded_r)), 3e-7)
        for u in np.linspace(model.parameters.first_cone_end + .05,
                             model.parameters.second_cone_start - .05, 7):
            self.assertLess(np.linalg.norm(model._instant_third_ruling(float(u))
                                           - model._axis), 2e-8)

    def test_mirrors_are_rigid_and_other_sampling_is_local_extension(self):
        result = query_huffman_parabola({
            'family': 'huffman-parabola-in4060', 'divisions': 8,
        })
        self.assertEqual(result['source']['samplingStatus'], 'bounded-local-extension')
        self.assertEqual(len(result['sample']['rows']), 9)
        for row in result['sample']['rows']:
            for a, b in ((0, 1), (1, 2), (2, 3)):
                self.assertAlmostEqual(
                    np.linalg.norm(np.asarray(row['flat'][a]) - row['flat'][b]),
                    np.linalg.norm(np.asarray(row['flatMirror'][a]) - row['flatMirror'][b]),
                    places=9,
                )
                self.assertAlmostEqual(
                    np.linalg.norm(np.asarray(row['folded'][a]) - row['folded'][b]),
                    np.linalg.norm(np.asarray(row['foldedMirror'][a]) - row['foldedMirror'][b]),
                    places=9,
                )


if __name__ == '__main__':
    unittest.main()
