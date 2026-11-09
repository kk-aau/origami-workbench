"""Finite straight-edge FOLD boundary for the linked zero-perturbation view.

The exact surface is curved and locally isometric.  This test only rules out
claiming that its *current sampled vertices*, connected as straight edges,
are an exact edge-preserving 2D/3D FOLD pair.
"""

import math
import unittest

from tessellation_curved_linked_zero_chain_query import query_linked_zero_chain


class LinkedZeroChainAdoptionAuditTests(unittest.TestCase):
    def test_sampled_longitudinal_edges_do_not_preserve_straight_chord_length(self):
        for segments in (8, 32, 128):
            with self.subTest(segments=segments):
                result = query_linked_zero_chain(segments)
                first, second = result['sample']['rows'][:2]
                step = math.pi / segments
                for index in range(5):
                    radius = 1. + .1 * index
                    flat_chord = math.dist(first['flatCurves'][index],
                                           second['flatCurves'][index])
                    folded_chord = math.dist(first['foldedCurves'][index],
                                             second['foldedCurves'][index])
                    self.assertAlmostEqual(flat_chord,
                                           2. * radius * math.sin(step / 2.),
                                           places=12)
                    self.assertAlmostEqual(folded_chord,
                                           radius * math.sin(step), places=12)
                    self.assertGreater(flat_chord - folded_chord, 0.)
                cert = result['certification']
                self.assertFalse(cert['exactStraightCreaseFOLD'])
                self.assertFalse(cert['globalLayerOrderChecked'])
                self.assertFalse(cert['adoptableCreasePattern'])


if __name__ == '__main__':
    unittest.main()
