import math
import unittest

from tessellation_alt_mosely_pot_query import query_alt_mosely_pot, validate_alt_mosely_query


class AltMoselyPotSavedExamplesTest(unittest.TestCase):
    def query(self, example, sectors=None):
        data = {'family': 'alt-mosely-pot-reference', 'example': example}
        if sectors is not None:
            data['sectors'] = sectors
        return query_alt_mosely_pot(data)

    def test_saved_examples_axis_completion_height_counts_and_first_panel(self):
        first = self.query(3557)
        second = self.query(3558)
        self.assertEqual(first['query']['sectors'], 8)
        self.assertEqual(second['query']['sectors'], 6)
        self.assertEqual(first['profile']['axisCompleted'][-1], [0, 3.0001])
        self.assertEqual(first['profile']['heightFromOriginal'], 3)
        self.assertTrue(first['profile']['axisPointAdded'])
        self.assertFalse(second['profile']['axisPointAdded'])
        self.assertEqual(second['profile']['original'][2], [2, math.sqrt(3)])
        self.assertAlmostEqual(second['profile']['heightFromOriginal'], 2*math.sqrt(3))
        self.assertEqual(len(first['display']['foldedFaces']), 160)
        self.assertEqual(len(second['display']['foldedFaces']), 120)
        self.assertEqual(len(first['display']['flatLines']), 272)
        self.assertEqual(len(second['display']['flatLines']), 180)
        face = first['splitWedge']['foldedFaces'][0]
        self.assertEqual(face['role'], 'panel')
        self.assertEqual(face['vertices'][0], [0, 0, 0])
        self.assertAlmostEqual(face['vertices'][3][1], .95*math.tan(math.pi/8))

    def test_alternate_flat_reflection_translation_and_final_rotation(self):
        result = self.query(3557)
        lines = result['splitWedge']['flatLines']
        forward = next(line for line in lines if line['part'] == 'forward' and
                       line['role'] == 'B')
        reverse = next(line for line in lines if line['part'] == 'reverse' and
                       line['role'] == 'B')
        self.assertTrue(all(math.isfinite(v) for line in (forward, reverse)
                            for point in line['points'] for v in point))
        width = result['profile']['splitWedgeWidth']
        phi = math.pi/8
        copies = [line for line in result['display']['flatLines']
                  if line['part'] == 'forward' and line['role'] == 'B']
        self.assertEqual(len(copies), 3*4)  # Three Default-boundary segments.
        first, next_copy = copies[0], copies[1]
        delta = [b-a for a, b in zip(first['points'][0], next_copy['points'][0])]
        expected = [width*(math.cos(2*phi)-1), width*math.sin(2*phi)]
        expected = [expected[0]*math.cos(phi)+expected[1]*math.sin(phi),
                    -expected[0]*math.sin(phi)+expected[1]*math.cos(phi)]
        for actual, wanted in zip(delta, expected):
            self.assertAlmostEqual(actual, wanted, places=10)

    def test_reversed_spatial_faces_are_lifted_rotated_and_opposite_winding(self):
        result = self.query(3558)
        forward = next(face for face in result['splitWedge']['foldedFaces']
                       if face['part'] == 'forward' and face['role'] == 'panel')
        reverse = next(face for face in result['splitWedge']['foldedFaces']
                       if face['part'] == 'reverse' and face['role'] == 'panel')
        self.assertEqual(len(forward['vertices']), 4)
        self.assertEqual(len(reverse['vertices']), 4)
        self.assertTrue(all(math.isfinite(v) for face in (forward, reverse)
                            for vertex in face['vertices'] for v in vertex))
        self.assertEqual(result['options']['FoldedFormGapSize'], .05)
        self.assertFalse(result['certification']['exactFOLD'])
        self.assertFalse(result['certification']['selfIntersectionChecked'])
        copies = [face for face in result['display']['foldedFaces']
                  if face['part'] == 'forward' and face['role'] == 'panel']
        self.assertEqual([face['repeat'] for face in copies[:3]], [0, 1, 2])
        original = copies[0]['vertices'][3]
        rotated = copies[1]['vertices'][3]
        angle = 4*math.pi/6
        self.assertAlmostEqual(rotated[0], original[0]*math.cos(angle)-
                               original[1]*math.sin(angle))
        self.assertAlmostEqual(rotated[1], original[0]*math.sin(angle)+
                               original[1]*math.cos(angle))
        self.assertAlmostEqual(rotated[2], original[2])

    def test_even_m_and_closed_saved_domain(self):
        for invalid in (0, 3, 17, 3.0, True):
            with self.assertRaises(ValueError):
                validate_alt_mosely_query({'family': 'alt-mosely-pot-reference',
                                           'example': 3557, 'sectors': invalid})
        for invalid in (3556, '3557', True):
            with self.assertRaises(ValueError):
                validate_alt_mosely_query({'family': 'alt-mosely-pot-reference',
                                           'example': invalid})
        with self.assertRaises(ValueError):
            validate_alt_mosely_query({'family': 'alt-mosely-pot-reference',
                                       'example': 3557, 'promoteToFold': True})
        variant = self.query(3558, 8)
        self.assertEqual(variant['query']['sectors'], 8)
        self.assertEqual(variant['source']['savedCell'], 'In[3558]')


if __name__ == '__main__':
    unittest.main()
