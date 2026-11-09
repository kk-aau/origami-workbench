"""Saved source-order and checkerboard checks for In[4123]."""

import math
import unittest

from tessellation_flasher import (flasher_default_cp_point, flasher_sector_quads,
                                  flasher_x_diagonal_picks)
from tessellation_flasher_x_topology import saved_flasher_x_first_sector


class FlasherXTopologyTests(unittest.TestCase):
    def test_saved_input_and_original_major_minor_partition(self):
        result = saved_flasher_x_first_sector()
        self.assertEqual(result['savedInput'], {
            'rings': 3, 'heightOrder': 2, 'rotationalOrder': 5,
            'sector': 0, 'radialOrder': 6})
        self.assertEqual((result['majorRows'], result['minorRows']), ([6, 4, 2], [5, 3, 1]))
        self.assertEqual(len(result['diagonals']), 21)
        self.assertEqual([d['region'] for d in result['diagonals']],
                         ['minor'] * 9 + ['major'] * 12)
        self.assertEqual([d['sourceQuadIndex'] for d in result['diagonals']],
                         list(range(12, 21)) + list(range(12)))

    def test_x_parity_is_source_mapindexed_not_uniform_y_or_z(self):
        diagonals = saved_flasher_x_first_sector()['diagonals']
        picks = flasher_x_diagonal_picks(3, 2, 5)
        self.assertEqual(len(picks), 21)
        self.assertEqual({d['sourceQuadIndex']: d['diagonal'] for d in diagonals},
                         {i: pick for i, pick in enumerate(picks)})
        groups = {}
        for d in diagonals:
            groups.setdefault((d['region'], d['row']), []).append(d['diagonal'])
        self.assertEqual(groups, {
            ('minor', 1): ['13', '24', '13', '24', '13'],
            ('minor', 2): ['24', '13', '24'],
            ('minor', 3): ['13'],
            ('major', 1): ['13', '24', '13', '24', '13', '24'],
            ('major', 2): ['24', '13', '24', '13'],
            ('major', 3): ['13', '24'],
        })
        self.assertEqual([sum(d['diagonal'] == variant for d in diagonals)
                          for variant in ('13', '24')], [11, 10])

    def test_wrapped_source_quad_and_ideal_cp_coordinates(self):
        result = saved_flasher_x_first_sector()
        first = result['diagonals'][0]
        self.assertEqual(first['quadLabels'],
                         [[2, 0, 4], [1, 0, 4], [0, 1, 0], [1, 2, 0]])
        self.assertEqual(first['endpointLabels'], [[2, 0, 4], [0, 1, 0]])
        quads = flasher_sector_quads(3, 2, 5, 0)
        unique_edges = set()
        for d in result['diagonals']:
            labels = [tuple(label) for label in d['quadLabels']]
            self.assertEqual(labels, list(quads[d['sourceQuadIndex']]))
            expected = [flasher_default_cp_point(*label, 5) for label in labels]
            for actual, wanted in zip(d['quadCoords'], expected):
                self.assertAlmostEqual(math.dist(actual, wanted), 0, 13)
            positions = (0, 2) if d['diagonal'] == '13' else (1, 3)
            self.assertEqual(d['endpointLabels'], [list(labels[i]) for i in positions])
            self.assertGreater(math.dist(*d['endpointCoords']), .8)
            self.assertEqual(d['quadSignedArea'] > 0, d['region'] == 'major')
            unique_edges.add(tuple(sorted(tuple(x) for x in d['endpointLabels'])))
        self.assertEqual(len(unique_edges), 21)

    def test_output_is_explicitly_not_a_solved_fold(self):
        result = saved_flasher_x_first_sector()
        for field in ('solvedCreasePattern', 'foldedForm', 'mountainValleyAssigned',
                      'isometryVerified', 'layerOrderVerified',
                      'exactStraightCreaseFOLD', 'adoptableCreasePattern'):
            self.assertFalse(result[field], field)
        self.assertTrue(result['idealCPSeedOnly'])
        self.assertNotIn('faces_vertices', result)
        self.assertNotIn('edges_vertices', result)


if __name__ == '__main__':
    unittest.main()
