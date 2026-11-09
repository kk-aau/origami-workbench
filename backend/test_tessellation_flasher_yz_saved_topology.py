"""Fixed In[4125]/In[4127] first-sector source drawing checks."""

import math
import unittest

from tessellation_flasher import flasher_default_cp_point, flasher_sector_quads
from tessellation_flasher_yz_saved_topology import saved_flasher_yz_first_sector


class FlasherYzSavedTopologyTests(unittest.TestCase):
    def test_saved_inputs_and_source_major_minor_order(self):
        for variant, cells in (('Y', ['In[4099]', 'In[4116]', 'In[4124]', 'In[4125]']),
                               ('Z', ['In[4099]', 'In[4116]', 'In[4126]', 'In[4127]'])):
            with self.subTest(variant=variant):
                result = saved_flasher_yz_first_sector(variant)
                self.assertEqual(result['savedInput'], {
                    'rings': 3, 'heightOrder': 2, 'rotationalOrder': 5,
                    'sector': 0, 'radialOrder': 6})
                self.assertEqual(result['sourceCells'], cells)
                self.assertEqual([x['sourceQuadIndex'] for x in result['diagonals']],
                                 list(range(21)))
                self.assertEqual([x['region'] for x in result['diagonals']],
                                 ['major'] * 12 + ['minor'] * 9)
                self.assertEqual([(x['row'], x['column']) for x in result['diagonals']],
                                 [(row, column) for lengths in (
                                     (6, 4, 2), (5, 3, 1))
                                  for row, count in enumerate(lengths, 1)
                                  for column in range(1, count + 1)])

    def test_all_lines_follow_source_quad_choice_and_default_cp_seed(self):
        quads = flasher_sector_quads(3, 2, 5, 0)
        self.assertEqual(len(quads), 21)
        for variant, positions in (('Y', (0, 2)), ('Z', (1, 3))):
            with self.subTest(variant=variant):
                lines = saved_flasher_yz_first_sector(variant)['diagonals']
                self.assertEqual(len(lines), 21)
                for quad, line in zip(quads, lines):
                    self.assertEqual(line['quadLabels'], [list(index) for index in quad])
                    self.assertEqual(line['endpointLabels'],
                                     [list(quad[index]) for index in positions])
                    for label, coord in zip(line['quadLabels'], line['quadCoords']):
                        self.assertLess(math.dist(coord, flasher_default_cp_point(*label, 5)),
                                        1e-12)
                    self.assertGreater(math.dist(*line['endpointCoords']), .8)

    def test_seam_and_orientation_anchors_differ_between_y_and_z(self):
        y = saved_flasher_yz_first_sector('Y')['diagonals']
        z = saved_flasher_yz_first_sector('Z')['diagonals']
        self.assertEqual(y[0]['endpointLabels'], [[1, 0, 0], [0, 1, 0]])
        self.assertEqual(z[0]['endpointLabels'], [[0, 0, 0], [1, 2, 0]])
        self.assertEqual(y[12]['endpointLabels'], [[2, 0, 4], [0, 1, 0]])
        self.assertEqual(z[12]['endpointLabels'], [[1, 0, 4], [1, 2, 0]])
        self.assertEqual(y[-1]['endpointLabels'], [[3, 6, 0], [4, 5, 0]])
        self.assertEqual(z[-1]['endpointLabels'], [[3, 5, 0], [5, 6, 0]])
        for a, b in zip(y, z):
            self.assertEqual(a['quadLabels'], b['quadLabels'])
            self.assertEqual(a['quadCoords'], b['quadCoords'])
            self.assertNotEqual(a['endpointLabels'], b['endpointLabels'])

    def test_this_query_is_never_a_solved_or_adoptable_fold(self):
        with self.assertRaises(ValueError):
            saved_flasher_yz_first_sector('X')
        for variant in ('Y', 'Z'):
            result = saved_flasher_yz_first_sector(variant)
            self.assertTrue(result['idealCPSeedOnly'])
            for field in ('solvedCreasePattern', 'foldedForm', 'mountainValleyAssigned',
                          'isometryVerified', 'layerOrderVerified',
                          'exactStraightCreaseFOLD', 'adoptableCreasePattern'):
                self.assertFalse(result[field], field)
            self.assertNotIn('faces_vertices', result)
            self.assertNotIn('edges_vertices', result)


if __name__ == '__main__':
    unittest.main()
