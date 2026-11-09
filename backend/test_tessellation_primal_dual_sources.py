"""Bounded custom mother graphs for Origamica P39 primal/dual twist candidates."""

import unittest
import math
from collections import Counter, defaultdict

from tessellate import generate, validate_request


GRID = {
    'family': 'custom',
    'vertices': [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1],
                 [0, 2], [1, 2], [2, 2]],
    'faces': [[0, 1, 4, 3], [1, 2, 5, 4], [3, 4, 7, 6], [4, 5, 8, 7]],
}


class PrimalDualMotherSourceTests(unittest.TestCase):
    def test_saved_section_39_directed_pair_source_oracle_all_24_edges(self):
        # In[3354] supplies these directed Edges. In[1193] preserves each
        # primal direction and orients the paired dual edge CCW from it.
        vertices = [[x, y] for y in (0, 2, 4) for x in (0, 2, 4)]
        faces = [[0, 1, 4, 3], [1, 2, 5, 4], [3, 4, 7, 6], [4, 5, 8, 7]]
        directed_interior = [(1, 4), (3, 4), (4, 5), (4, 7)]
        result = generate(dict(family='primal-dual',
                               motherParams=dict(family='custom', vertices=vertices,
                                                 faces=faces),
                               parameterization='gamma-alpha', gamma=2,
                               pleatAngle=20, twistDirection='ccw',
                               postRotation='primal', faceupFace=3))
        a = math.radians(20)
        rho = 2 / math.hypot(2 + math.sin(a), math.cos(a))
        beta = math.atan2(math.cos(a), 2 + math.sin(a))
        cb, sb = math.cos(beta), math.sin(beta)
        centers = [[sum(vertices[v][axis] for v in face) / len(face)
                    for axis in (0, 1)] for face in faces]
        owners = defaultdict(list)
        for face_id, face in enumerate(faces):
            for v, w in zip(face, face[1:] + face[:1]):
                owners[tuple(sorted((v, w)))].append(face_id)
        boundary = {v for edge, ids in owners.items() if len(ids) == 1 for v in edge}

        def rotated(point, center):
            dx, dy = point[0]-center[0], point[1]-center[1]
            x = center[0] + rho*(cb*dx-sb*dy)
            y = center[1] + rho*(sb*dx+cb*dy)
            # In[3350] applies PrimalRotation = -beta after constructing CP.
            return cb*x+sb*y, -sb*x+cb*y

        def key(pair, assignment):
            return (tuple(sorted(tuple(round(c, 8) for c in point)
                                 for point in pair)), assignment)

        expected = []
        for p1, p2 in directed_interior:
            d1, d2 = [centers[i] for i in owners[tuple(sorted((p1, p2)))]]
            px, py = (vertices[p2][k]-vertices[p1][k] for k in (0, 1))
            dx, dy = (d2[k]-d1[k] for k in (0, 1))
            if px*dy-py*dx < 0:
                d1, d2 = d2, d1
            p1d1, p2d1 = rotated(vertices[p1], d1), rotated(vertices[p2], d1)
            p1d2, p2d2 = rotated(vertices[p1], d2), rotated(vertices[p2], d2)
            ob = sum((p2d1[k]-p1d1[k])*(p1d2[k]-p1d1[k])
                     for k in (0, 1)) < 0
            # These four assignments are copied as independent arithmetic
            # from In[3344], including its two boundary-endpoint exceptions.
            expected.extend([
                key((p2d1, p1d1), 'M'),
                key((p1d1, p1d2), 'B' if p1 in boundary else 'M' if ob else 'V'),
                key((p1d2, p2d2), 'V'),
                key((p2d1, p2d2), 'B' if p2 in boundary else 'V' if ob else 'M'),
            ])
        for (p1, p2), ids in owners.items():
            if len(ids) == 1:
                expected.append(key((rotated(vertices[p1], centers[ids[0]]),
                                     rotated(vertices[p2], centers[ids[0]])), 'B'))

        fold = result['fold']
        actual = [key((fold['vertices_coords'][v], fold['vertices_coords'][w]), a)
                  for (v, w), a in zip(fold['edges_vertices'],
                                       fold['edges_assignment'])]
        self.assertEqual(len(expected), 24)
        self.assertEqual(Counter(actual), Counter(expected))
        self.assertEqual(result['source']['assignmentMethod'],
                         'Origamica directed primal input edges / CCW dual pairs')
        self.assertEqual(result['stats']['parameters']['faceupFace'], 3)
        self.assertEqual({name: result['stats']['checks'][name]['status']
                          for name in ('geometry', 'local', 'lff', 'layerOrder')},
                         {'geometry': 'passed', 'local': 'passed',
                          'lff': 'passed', 'layerOrder': 'not_checked'})

    def test_saved_section_39_square_input_has_source_formula_anchor(self):
        # The notebook saves this input, but no machine-readable numerical Out.
        vertices = [[x, y] for y in (0, 2, 4) for x in (0, 2, 4)]
        faces = [[j*3+i, j*3+i+1, (j+1)*3+i+1, (j+1)*3+i]
                 for j in range(2) for i in range(2)]
        result = generate(dict(family='primal-dual',
                               motherParams=dict(family='custom', vertices=vertices,
                                                 faces=faces),
                               parameterization='gamma-alpha', gamma=2,
                               pleatAngle=20, twistDirection='ccw',
                               postRotation='primal'))
        p = result['stats']['parameters']
        self.assertAlmostEqual(p['scale'], .7925482672068609, places=12)
        self.assertAlmostEqual(p['angle'], 21.862218721594214, places=10)
        self.assertEqual((result['stats']['vertices'], result['stats']['edges'],
                          result['stats']['faces']), (16, 24, 9))
        self.assertEqual(len(result['dual']['vertices_coords']), 4)
        self.assertLess(result['source']['foldedFormMaxIsometryError'], 1e-8)

    def test_custom_mother_cp_direct_ff_and_check_levels(self):
        data = dict(family='primal-dual', motherParams=GRID,
                    parameterization='gamma-alpha', gamma=.8, pleatAngle=20)
        result = generate(data)
        self.assertEqual(result['stats']['tiles'], 4)
        self.assertEqual(len(result['mother']['faces_vertices']), len(GRID['faces']))
        self.assertEqual(len(result['mother']['vertices_coords']), len(GRID['vertices']))
        self.assertEqual(result['source']['motherFamily'], 'custom')
        self.assertEqual(result['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['local']['status'], 'passed')
        self.assertEqual(result['stats']['checks']['layerOrder']['status'], 'not_checked')
        self.assertEqual(result['stats']['foldability'], 'candidate')
        self.assertLess(result['source']['foldedFormMaxIsometryError'], 1e-8)
        self.assertEqual(len(result['source']['foldedForm']),
                         len(result['fold']['vertices_coords']))

    def test_existing_preset_is_unchanged_and_external_periodic_mother_is_exact(self):
        preset = generate(dict(family='primal-dual', tiling='square', rings=1,
                               angle=36, scale=.5))
        self.assertNotIn('motherFamily', preset['source'])
        source = dict(family='periodic', tiling='square', rows=3, columns=3)
        external = generate(dict(family='primal-dual', motherParams=source,
                                 angle=36, scale=.5))
        periodic = generate(source)
        self.assertEqual(external['mother'], periodic['mother'])
        self.assertEqual(external['source']['motherFamily'], 'periodic')
        self.assertNotEqual(external['mother'], preset['mother'])

    def test_reversing_one_primal_dual_edge_pair_flips_only_local_assignments(self):
        data = dict(family='primal-dual', motherParams=GRID,
                    parameterization='gamma-alpha', gamma=.8, pleatAngle=20)
        original = generate(data)
        changed = generate({**data, 'dualEdgeFlips': [[1, 2]]})
        self.assertEqual(original['fold']['vertices_coords'],
                         changed['fold']['vertices_coords'])
        self.assertEqual(original['fold']['edges_vertices'],
                         changed['fold']['edges_vertices'])
        self.assertEqual(changed['source']['dualEdgeFlips'], [[1, 2]])
        differences = [(a, b) for a, b in zip(
            original['fold']['edges_assignment'],
            changed['fold']['edges_assignment']) if a != b]
        self.assertEqual(len(differences), 3)
        self.assertTrue(all({a, b} == {'M', 'V'} for a, b in differences))
        self.assertEqual(changed['stats']['checks']['geometry']['status'], 'passed')
        self.assertEqual(changed['stats']['checks']['local']['status'], 'passed')
        with self.assertRaisesRegex(ValueError, '内部共享边'):
            generate({**data, 'dualEdgeFlips': [[0, 1]]})

    def test_signed_visible_top_face_is_preserved_but_out_of_range_is_rejected(self):
        for signed_face in (3, -3):
            params = dict(family='primal-dual', motherParams=GRID,
                          angle=36, scale=.5, visibleTopFace=signed_face)
            self.assertEqual(generate(params)['stats']['parameters']['visibleTopFace'],
                             signed_face)
        for invalid in (0, 1.5, 4097, True):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                validate_request(dict(family='primal-dual', visibleTopFace=invalid))

    def test_faceup_face_is_a_separate_signed_local_seed(self):
        for signed_face in (3, -3):
            params = dict(family='primal-dual', motherParams=GRID,
                          angle=36, scale=.5, faceupFace=signed_face)
            result = generate(params)
            self.assertEqual(result['stats']['parameters']['faceupFace'], signed_face)
            self.assertNotIn('visibleTopFace', result['stats']['parameters'])
        for invalid in (0, 1.5, 4097, True):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                validate_request(dict(family='primal-dual', faceupFace=invalid))
        with self.assertRaisesRegex(ValueError, 'faceupFace 超出'):
            generate(dict(family='primal-dual', motherParams=GRID,
                          angle=36, scale=.5, faceupFace=20))

    def test_recursive_direct_pattern_and_nonplanar_sources_are_rejected(self):
        for source in (None, dict(family='primal-dual'), dict(family='flagstone'),
                       dict(family='twist'), dict(family='ring', ringMode='origamica')):
            with self.subTest(source=source), self.assertRaises(ValueError):
                validate_request(dict(family='primal-dual', motherParams=source))
        with self.assertRaisesRegex(ValueError, '母结构必须'):
            generate(dict(family='primal-dual', motherParams={
                'family': 'custom', 'vertices': [[0, 0], [1, 0], [1, 1], [0, 1],
                                                 [3, 0], [4, 0], [4, 1], [3, 1]],
                'faces': [[0, 1, 2, 3], [4, 5, 6, 7]]}))


if __name__ == '__main__':
    unittest.main()
