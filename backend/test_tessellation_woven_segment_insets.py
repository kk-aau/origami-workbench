import copy
import unittest

from tessellation_line_groups import apply_segment_insets, arrangement, inset_faces
from tessellation_woven import BOX, validate_woven, woven_pattern


def stamped_segment(data, edge, inset):
    a, b = data['mesh']['edges_vertices'][edge]
    return {'line': data['edgeLines'][edge],
            'from': data['mesh']['vertices_coords'][a].copy(),
            'to': data['mesh']['vertices_coords'][b].copy(),
            'inset': inset}


class WovenSegmentInsetTests(unittest.TestCase):
    def setUp(self):
        self.mother = arrangement([[0, -.4, .06], [0, .4, .06],
                                   [90, -.4, .06], [90, .4, .06]], BOX)
        self.edge = next(i for i, line in enumerate(self.mother['edgeLines'])
                         if line >= 0)

    def test_stamped_segment_changes_only_the_selected_edge_inset(self):
        data = copy.deepcopy(self.mother)
        before = inset_faces(data, border_inset=.03)
        override = stamped_segment(data, self.edge, .045)
        original = data['edgeWidths'].copy()
        apply_segment_insets(data, [override])
        self.assertAlmostEqual(data['edgeWidths'][self.edge], .09)
        self.assertEqual([i for i, (old, new) in enumerate(zip(original, data['edgeWidths']))
                          if abs(old - new) > 1e-12], [self.edge])
        self.assertNotEqual(inset_faces(data, border_inset=.03), before)
        self.assertEqual(data['edgeLines'], self.mother['edgeLines'])

    def test_reversed_endpoints_match_but_stale_or_duplicate_stamps_reject(self):
        data = copy.deepcopy(self.mother)
        item = stamped_segment(data, self.edge, .035)
        item['from'], item['to'] = item['to'], item['from']
        apply_segment_insets(data, [item])
        with self.assertRaisesRegex(ValueError, '变化或重复'):
            apply_segment_insets(copy.deepcopy(self.mother), [item, item])
        moved = copy.deepcopy(item)
        moved['from'] = [moved['from'][0] + .001, moved['from'][1]]
        with self.assertRaisesRegex(ValueError, '变化或重复'):
            apply_segment_insets(copy.deepcopy(self.mother), [moved])
        bad_line = copy.deepcopy(item)
        bad_line['line'] = 100
        with self.assertRaises(ValueError):
            apply_segment_insets(copy.deepcopy(self.mother), [bad_line])

    def test_request_validation_retains_exact_segment_stamp(self):
        item = stamped_segment(self.mother, self.edge, .035)
        parsed = validate_woven({'family': 'woven-lines', 'segmentInsets': [item]})
        self.assertEqual(parsed['segmentInsets'], [item])
        for value in (-1, 0, 1.5, float('nan'), True):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_woven({'family': 'woven-lines',
                                'segmentInsets': [{**item, 'inset': value}]})

    def test_changed_single_segment_reaches_a_valid_full_cp_and_flat_form(self):
        from tessellate import generate

        original = generate({'family': 'woven-lines'})
        edge = next(i for i, line in enumerate(original['source']['edgeLines'])
                    if line >= 0)
        data = {'mesh': original['mother'],
                'edgeLines': original['source']['edgeLines']}
        inset = original['source']['edgeWidths'][edge] * .55
        changed = generate({'family': 'woven-lines',
                            'segmentInsets': [stamped_segment(data, edge, inset)]})
        self.assertEqual(changed['stats']['checks']['geometry']['status'], 'passed')
        self.assertAlmostEqual(changed['source']['edgeWidths'][edge], 2 * inset)
        self.assertNotEqual(changed['fold']['vertices_coords'],
                            original['fold']['vertices_coords'])
        self.assertEqual(len(changed['source']['foldedForm']),
                         len(changed['fold']['vertices_coords']))

    def test_periodic_endpoint_width_mismatch_is_rejected(self):
        data = copy.deepcopy(self.mother)
        points = data['mesh']['vertices_coords']
        pairs = [[i, j] for i, a in enumerate(points) for j, b in enumerate(points)
                 if (abs(a[0]+1)<1e-8 and abs(b[0]-1)<1e-8 and abs(a[1]-b[1])<1e-8 and abs(a[1])<.9)
                 or (abs(a[1]+1)<1e-8 and abs(b[1]-1)<1e-8 and abs(a[0]-b[0])<1e-8 and abs(a[0])<.9)]
        woven_pattern(data, periodicity=pairs)
        edge = next(i for i, (a, b) in enumerate(data['mesh']['edges_vertices'])
                    if data['edgeLines'][i]>=0 and
                    any(abs(points[v][0]+1)<1e-8 for v in (a,b)))
        apply_segment_insets(data, [stamped_segment(data, edge, .05)])
        with self.assertRaisesRegex(ValueError, '周期两端条带宽度'):
            woven_pattern(data, periodicity=pairs)


if __name__ == '__main__':
    unittest.main()
