"""The notebook's CW long arcs remain source graphics, never paper."""

import math
import unittest

from tessellate import dispatch_request, generate
from tessellation_radial_pot_cw_query import query_radial_pot_cw


SAVED = {'family': 'radial-pot', 'crossSection': [[0, 0], [1, 1], [1, 2],
          [1, 3], [2, 4]], 'sectors': 5, 'asymmetry': 0,
         'gapHalfAngleDeg': 3, 'typeMinimumAngleDeg': 10,
         'border': 'circular', 'arcDirection': 'CW'}


class RadialPotCWQueryTests(unittest.TestCase):
    def test_saved_profile_has_original_major_arcs_but_no_adoptable_paper(self):
        result = dispatch_request({'operation': 'radial-pot-cw-reference', **SAVED})
        self.assertEqual(result['family'], 'radial-pot-cw-reference')
        self.assertEqual(result['query'], SAVED)
        self.assertNotIn('fold', result)
        self.assertNotIn('faces', result['graph'])
        self.assertFalse(result['certification']['adoptableCreasePattern'])
        self.assertFalse(result['certification']['paperGeometryChecked'])
        self.assertFalse(result['certification']['savedNumericalOut'])
        graph = result['graph']
        self.assertEqual((len(graph['vertices']), len(graph['edges']),
                          len(graph['arcs'])), (1816, 1915, 25))
        first = graph['arcs'][0]
        self.assertEqual((first['wedge'], first['between']), (0, 'ab'))
        self.assertAlmostEqual(first['sweepDeg'], -345.2891719998076, 8)
        self.assertEqual(len(first['edgeIndices']), 70)
        radius = math.hypot(*graph['vertices'][graph['edges'][first['edgeIndices'][0]][0]])
        arc_points = [graph['vertices'][i] for edge in first['edgeIndices']
                      for i in graph['edges'][edge]]
        self.assertTrue(any(x < -radius*.9 for x, _ in arc_points))
        self.assertEqual(result['diagnostics']['majorArcCount'], 25)
        self.assertEqual(result['diagnostics']['angularOverlapWitness']['sectorSpacingDeg'], 72)
        with self.assertRaisesRegex(ValueError, 'ArcDirection=CW'):
            generate(SAVED)

    def test_cw_source_options_read_back_and_invalid_modes_fail_closed(self):
        changed = {**SAVED, 'arcMaximumAngleDeg': 10, 'arcDivisions': 4,
                   'arcMethod': 'circumscribed'}
        result = query_radial_pot_cw(changed)
        self.assertEqual(result['query'], changed)
        self.assertGreater(result['diagnostics']['maximumArcSweepDeg'], 340)
        self.assertTrue(all(0 <= edge < len(result['graph']['edges'])
                            for arc in result['graph']['arcs']
                            for edge in arc['edgeIndices']))
        for patch in ({'arcDirection': 'CCW'}, {'border': 'planar'},
                      {'arcMethod': 'wrong'}, {'arcDivisions': 0},
                      {'unknown': 1}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                query_radial_pot_cw({**SAVED, **patch})


if __name__ == '__main__':
    unittest.main()
