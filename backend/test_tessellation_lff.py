import math
import unittest

from tessellate import check_local_conditions, generate
from tessellation_lff import analyze_lff_graph, check_vertex_against_assignment


def wheel(sector_angles=(0, 50, 150, 280), assignments=('M', 'V', 'M', 'M')):
    n = len(sector_angles)
    coords = [[0.0, 0.0]] + [
        [math.cos(math.radians(angle)), math.sin(math.radians(angle))]
        for angle in sector_angles
    ]
    spokes = [[0, i + 1] for i in range(n)]
    boundary = [[i + 1, (i + 1) % n + 1] for i in range(n)]
    return {
        'vertices_coords': coords,
        'edges_vertices': spokes + boundary,
        'edges_assignment': list(assignments) + ['B'] * n,
        'faces_vertices': [[0, i + 1, (i + 1) % n + 1] for i in range(n)],
    }


class OrigamicaLffTests(unittest.TestCase):
    def test_direct_blb_matches_notebook_examples_and_unique_odd_crease(self):
        origin = [0, 0]
        self.assertTrue(check_vertex_against_assignment(origin, [1, 0], [1, 1], [-1, 0], [1, -1])[0])
        self.assertFalse(check_vertex_against_assignment(origin, [1, 0], [-1, 1], [-1, 0], [-1, -1])[0])

        # A Maekawa-compatible wheel can put its odd crease on the wrong side
        # of the acute sector. This checks the original formula independently
        # of the derived LFF parity graph.
        fold = wheel(assignments=('M', 'M', 'V', 'M'))
        self.assertEqual(check_local_conditions(fold)['status'], 'passed')
        points = fold['vertices_coords']
        self.assertFalse(check_vertex_against_assignment(points[0], points[3], points[4], points[1], points[2])[0])
        self.assertTrue(check_vertex_against_assignment(points[0], points[2], points[3], points[4], points[1])[0])

    def test_unique_minimum_creates_original_anto_and_iso_relations(self):
        fold = wheel()
        result = analyze_lff_graph(fold)
        self.assertEqual(result['status'], 'passed')
        self.assertEqual(result['interiorVertices'], 1)
        self.assertEqual(result['graphEdges'], [[0, 1], [2, 3]])
        self.assertEqual(result['edgeTypes'], [-1, 1])
        self.assertEqual(result['constraintVertices'], [0, 0])
        self.assertEqual(result['graphVertices'][0], [fold['vertices_coords'][1][0] / 2, 0])

    def test_mountain_valley_conflict_and_unassigned_are_reported(self):
        # Three mountains and one valley pass Maekawa, but the odd valley lies
        # away from the acute sector and cannot satisfy Origamica's BLB test.
        conflicting = wheel(assignments=('M', 'M', 'V', 'M'))
        self.assertEqual(check_local_conditions(conflicting)['status'], 'passed')
        result = analyze_lff_graph(conflicting)
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['assignmentViolations'], [0, 1])
        unknown = wheel(assignments=('U', 'V', 'M', 'M'))
        result = analyze_lff_graph(unknown)
        self.assertEqual(result['status'], 'incomplete')
        self.assertEqual(result['unassignedConstraints'], [0])

    def test_non_four_valent_and_tied_minimum_are_not_applicable(self):
        mother_only = wheel(assignments=('F', 'F', 'F', 'F'))
        self.assertEqual(analyze_lff_graph(mother_only)['reason'], 'no_crease_pattern')
        six = wheel((0, 60, 120, 180, 240, 300), ('M', 'V', 'M', 'V', 'M', 'V'))
        result = analyze_lff_graph(six)
        self.assertEqual(result['status'], 'not_applicable')
        self.assertEqual(result['reason'], 'non_four_valent_vertices')
        tied = wheel((0, 90, 180, 270))
        result = analyze_lff_graph(tied)
        self.assertEqual(result['status'], 'not_applicable')
        self.assertEqual(result['reason'], 'ambiguous_or_nonflat_stars')
        self.assertEqual(result['problemVertices'][0]['reason'], 'non_unique_extreme_sector')
        self.assertEqual(result['graphEdges'], [])

    def test_nonflat_or_degenerate_star_is_not_mislabeled_as_lff(self):
        nonflat = wheel((0, 40, 140, 270))
        result = analyze_lff_graph(nonflat)
        self.assertEqual(result['status'], 'not_applicable')
        self.assertEqual(result['problemVertices'][0]['reason'], 'kawasaki')
        degenerate = wheel((0, .0001, 180, 270))
        result = analyze_lff_graph(degenerate, geometry_status='passed')
        self.assertEqual(result['status'], 'not_applicable')
        self.assertEqual(result['problemVertices'][0]['reason'], 'degenerate_sector')

    def test_generation_api_exposes_lff_without_replacing_existing_checks(self):
        result = generate({'family': 'twist', 'sides': 4})
        checks = result['stats']['checks']
        self.assertEqual(checks['geometry']['status'], 'passed')
        self.assertEqual(checks['local']['status'], 'passed')
        self.assertEqual(checks['lff']['status'], 'passed')
        self.assertEqual(len(checks['lff']['graphEdges']), checks['lff']['interiorVertices'] * 2)
        self.assertEqual(checks['layerOrder']['status'], 'not_checked')

    def test_default_voronoi_repairs_upstream_assignment_to_satisfy_blb(self):
        result = generate({'family': 'nonperiodic', 'kind': 'voronoi', 'seed': 1})
        checks = result['stats']['checks']
        self.assertEqual(checks['geometry']['status'], 'passed')
        self.assertEqual(checks['local']['status'], 'passed')
        self.assertEqual(checks['lff']['status'], 'passed')
        self.assertEqual(checks['lff']['assignmentViolations'], [])
        self.assertEqual(result['source']['version'], 2)
        self.assertIn('BLB', result['source']['assignmentMethod'])


if __name__ == '__main__':
    unittest.main()
