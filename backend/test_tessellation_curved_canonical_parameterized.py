import math
import unittest

import tessellation_curved_canonical_cone_cylinder as m


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


class CanonicalParameterizedTests(unittest.TestCase):
    def test_defaults_preserve_original_numeric_functions(self):
        for kind, query in m.INPUT_PRESETS.items():
            result = m.evaluate_input_query(query)
            self.assertTrue(result['source']['matchesSavedInput'])
            for i, u in enumerate(result['uValues']):
                self.assertEqual(tuple(result['rawBase'][i]), m.raw_directrix(kind, u))
                self.assertEqual(tuple(result['rawTip'][i]), m.raw_point(kind, u, 1))
                for j, v in enumerate(result['vValues']):
                    self.assertEqual(tuple(result['canonicalGrid'][j][i]), m.canonical_point(kind, u, v))
                    self.assertEqual(tuple(result['flatGrid'][j][i]), m.derived_flat_point(kind, u, v))

    def test_normalization_projection_and_original_ruling_coordinates(self):
        for kind in m.CASES:
            for length in (.1, 2, 6):
                query = dict(m.INPUT_PRESETS[kind], directorLength=length)
                if kind == m.CASES[0]:
                    query.update(radius=3, axialPitch=-4)
                else:
                    query.update(angleDeg=75, apexZ=-3)
                q = m.validate_input_query(query)
                point = m._input_coordinates(q, .7, .3)
                self.assertAlmostEqual(math.sqrt(dot(point['canonicalDirector'],
                                                     point['canonicalDirector'])), 1)
                for lam in (-1, 0, .4, 1):
                    raw = tuple(b+lam*(t-b) for b, t in zip(point['rawBase'], point['rawTip']))
                    v = length*lam+(q['axialPitch']*.7 if kind == m.CASES[0] else 0)
                    expected = tuple(b+v*d for b, d in zip(point['canonicalDirectrix'],
                                                          point['canonicalDirector']))
                    self.assertLess(math.dist(raw, expected), 1e-13)

    def test_three_metric_components_for_parameter_extremes(self):
        inputs = [dict(m.INPUT_PRESETS[m.CASES[0]], radius=.1, axialPitch=-4),
                  dict(m.INPUT_PRESETS[m.CASES[0]], radius=3, axialPitch=4),
                  dict(m.INPUT_PRESETS[m.CASES[1]], angleDeg=15, apexZ=-3),
                  dict(m.INPUT_PRESETS[m.CASES[1]], angleDeg=75, apexZ=3)]
        step, u, v = 1e-5, .7, .6
        for q in inputs:
            expected = q['radius']**2 if q['kind'] == m.CASES[0] else (
                v*math.sin(q['angleDeg']*math.pi/180))**2
            for name in ('space', 'flat'):
                pu, mu = m._input_coordinates(q, u+step, v)[name], m._input_coordinates(q, u-step, v)[name]
                pv, mv = m._input_coordinates(q, u, v+step)[name], m._input_coordinates(q, u, v-step)[name]
                du = tuple((a-b)/(2*step) for a, b in zip(pu, mu))
                dv = tuple((a-b)/(2*step) for a, b in zip(pv, mv))
                self.assertAlmostEqual(dot(du, du), expected, places=8)
                self.assertAlmostEqual(dot(du, dv), 0, places=8)
                self.assertAlmostEqual(dot(dv, dv), 1, places=8)

    def test_closed_domain_gate_treats_the_entire_apex_as_singular(self):
        query = m.INPUT_PRESETS[m.CASES[1]]
        original = m.evaluate_input_query(query)
        self.assertFalse(original['certification']['regularClosedDomain'])
        self.assertFalse(original['certification']['globalInjectiveClosedDomain'])
        self.assertTrue(original['certification']['includesSingularApex'])
        self.assertEqual(original['certification']['minimumJacobian'], 0)
        positive = m.evaluate_input_query(dict(query, rulingStart=.2))
        self.assertTrue(positive['certification']['regularClosedDomain'])
        self.assertTrue(positive['certification']['globalInjectiveClosedDomain'])
        self.assertFalse(positive['certification']['includesSingularApex'])
        self.assertAlmostEqual(positive['certification']['minimumJacobian'], .1)
        self.assertFalse(positive['source']['matchesSavedInput'])
        self.assertFalse(positive['certification']['sameFinitePatchAsRawInput'])
        self.assertFalse(positive['certification']['sampledMeshExactFOLD'])

    def test_cylinder_raw_pitch_and_scale_are_removed_by_actual_projection(self):
        preset = m.INPUT_PRESETS[m.CASES[0]]
        low = m.evaluate_input_query(dict(preset, axialPitch=-4, directorLength=.1))
        high = m.evaluate_input_query(dict(preset, axialPitch=4, directorLength=6))
        self.assertEqual(low['canonicalGrid'], high['canonicalGrid'])
        self.assertNotEqual(low['rawBase'], high['rawBase'])
        self.assertNotEqual(low['rawTip'], high['rawTip'])

    def test_invalid_query_does_not_silently_ignore_fields_or_normalize_zero(self):
        preset = m.INPUT_PRESETS[m.CASES[1]]
        for patch in ({'directorLength': 0}, {'angleDeg': 0}, {'angleDeg': 90},
                      {'radius': 1}, {'rulingStart': 1, 'rulingEnd': 1},
                      {'segments': 16.5}, {'apexZ': True}, {'angleDeg': '30'},
                      {'directorLength': math.nan}):
            with self.assertRaises(ValueError):
                m.evaluate_input_query(dict(preset, **patch))

    def test_same_finite_patch_flag_depends_on_actual_coordinate_ranges(self):
        cone = m.INPUT_PRESETS[m.CASES[1]]
        cylinder = m.INPUT_PRESETS[m.CASES[0]]
        self.assertTrue(m.evaluate_input_query(dict(cone, directorLength=1))[
            'certification']['sameFinitePatchAsRawInput'])
        self.assertTrue(m.evaluate_input_query(dict(cylinder, axialPitch=0, directorLength=1))[
            'certification']['sameFinitePatchAsRawInput'])
        self.assertFalse(m.evaluate_input_query(dict(cylinder, axialPitch=.1, directorLength=1))[
            'certification']['sameFinitePatchAsRawInput'])
        self.assertFalse(m.evaluate_input_query(dict(cone, directorLength=1, rulingStart=.1))[
            'certification']['sameFinitePatchAsRawInput'])


if __name__ == '__main__':
    unittest.main()
