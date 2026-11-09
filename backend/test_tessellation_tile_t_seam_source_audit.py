"""Source-bounded T-seam counterexample for Origamica's monolithic tile merge.

The original MergeGraphsData identifies equal whole edges, while the saved
polygon twist places two nondegenerate pleat taps on every tile edge.  This
test distinguishes a three-tile T from a genuinely edge-to-edge remesh.
"""

from fractions import Fraction
import itertools
import math
import unittest

from tessellate import generate
from tessellation_split_exact import centered_tilt
from tessellation_tile_twist import polygon_pleat_tile


MERGE = {'mergedEdges': 'delete', 'samePtTolerance': 1e-8,
         'collinearCleanup': True, 'collinearTolerance': 1e-8}


def _taps(start, end, width, offset=0):
    """The two source tile-pleat vertices on one directed boundary edge."""
    return tuple(start + (end - start) * ((1 + sign * width) / 2 + offset)
                 for sign in (-1, 1))


class TSeamSourceAudit(unittest.TestCase):
    def test_original_whole_edge_merge_cannot_pair_one_edge_with_two(self):
        fifth = Fraction(1, 5)
        long_edge = _taps(Fraction(0), Fraction(1), fifth)
        two_short_edges = (*_taps(Fraction(0), Fraction(1, 2), fifth),
                           *_taps(Fraction(1, 2), Fraction(1), fifth))
        self.assertEqual(long_edge, (Fraction(2, 5), Fraction(3, 5)))
        self.assertEqual(two_short_edges,
                         (Fraction(1, 5), Fraction(3, 10),
                          Fraction(7, 10), Fraction(4, 5)))
        self.assertEqual(len(set(two_short_edges) - set(long_edge)), 4)
        # For every valid tile offset, each short edge still has two distinct
        # taps in its own open half.  A single long edge has only two taps.
        for width, offset in ((Fraction(1, 5), 0),
                              (Fraction(2, 5), Fraction(1, 10)),
                              (Fraction(3, 5), -Fraction(1, 10))):
            taps = (*_taps(0, Fraction(1, 2), width, offset),
                    *_taps(Fraction(1, 2), 1, width, offset))
            self.assertEqual(len(set(taps)), 4)
            self.assertTrue(all(0 < t < Fraction(1, 2) for t in taps[:2]))
            self.assertTrue(all(Fraction(1, 2) < t < 1 for t in taps[2:]))

    def test_t_mother_conforms_but_source_tile_cannot_be_decorated(self):
        vertices = [[0, 0], [1, 0], [2, 0], [1, .5], [2, .5],
                    [0, 1], [1, 1], [2, 1]]
        faces = [[0, 1, 6, 5], [1, 2, 4, 3], [3, 4, 7, 6]]
        choices = [dict(width=.2, offset=0, tilt=70,
                        centralTypes=['M'] * 4) for _ in faces]
        with self.assertRaisesRegex(ValueError, '细分.*完整边'):
            generate(dict(family='custom', vertices=vertices, faces=faces,
                          repeatX=1, repeatY=1, customOutput='tile-twists',
                          tileTwists=choices, monolithicOptions=MERGE))
        # Adding the midpoint to the source polygon does not solve this: the
        # two adjacent collinear edge rays have no unique intersection.
        with self.assertRaisesRegex(ValueError, '相邻边不能共线'):
            polygon_pleat_tile([[0, 0], [1, 0], [1, .5], [1, 1], [0, 1]],
                               .2, 0, 70, ['M'] * 5)

    def test_edge_to_edge_remesh_preserves_outer_sheet_and_has_checked_ff(self):
        # This is an eight-square redesign of the same [0,2] x [0,1] sheet,
        # not a claim that the original three T-joined tiles were merged.
        vertices = [[.5 * x, .5 * y] for y in range(3) for x in range(5)]
        faces = [[5*y+x, 5*y+x+1, 5*(y+1)+x+1, 5*(y+1)+x]
                 for y in range(2) for x in range(4)]
        tilt = centered_tilt(.18, 30)
        choices = [dict(width=.18, offset=0, tilt=tilt,
                        centralTypes=[('V' if (i % 4 + i // 4) % 2 == 0
                                       else 'M')] * 4) for i in range(8)]
        result = generate(dict(family='custom', vertices=vertices, faces=faces,
                               repeatX=1, repeatY=1, customOutput='tile-twists',
                               tileTwists=choices, monolithicOptions=MERGE))
        self.assertEqual(len(result['mother']['faces_vertices']), 8)
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
        self.assertLess(result['source']['closureError'], 1e-7)
        fold, flat = result['fold'], result['source']['foldedForm']
        for face in fold['faces_vertices']:
            for a, b in itertools.combinations(face, 2):
                self.assertLess(abs(math.dist(fold['vertices_coords'][a],
                                              fold['vertices_coords'][b]) -
                                    math.dist(flat[a], flat[b])), 1e-7)


if __name__ == '__main__':
    unittest.main()
