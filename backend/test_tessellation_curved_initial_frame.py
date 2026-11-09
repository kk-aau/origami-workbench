"""Raw initial tolerances must not silently certify an orthonormal frame."""
import copy,unittest
from tessellation_curved_generic_darboux import query_generic_darboux,FLATTEN_PRESET,RESHAPE_PRESET
from tessellation_curved_fold_flatten_generic import query_flatten_fold_generic,PRESET

class InitialFrameTests(unittest.TestCase):
    def test_near_unit_raw_values_keep_real_geometry_but_not_formal_unit_frame_claims(self):
        for preset,fn in [(FLATTEN_PRESET,query_generic_darboux),(RESHAPE_PRESET,query_generic_darboux),(PRESET,query_flatten_fold_generic)]:
            with self.subTest(family=preset['family']):
                query=copy.deepcopy(preset);query.update(segments=8,rulingSegments=3,
                    initialTangent=[1+4.5e-11]+[0]*(len(preset['initialTangent'])-1))
                r=fn(query);self.assertEqual(r['query']['initialTangent'],query['initialTangent'])
                self.assertGreater(r['initial']['frameGramResidual'],r['initial']['frameCompatibilityTolerance'])
                self.assertFalse(r['initial']['frameCompatible']);self.assertFalse(r['certification']['initialFrameCompatible'])
                self.assertTrue(r['domain']['certified']);self.assertEqual(len(r['sample']['rows']),9)
                if 'formalIsometryCertified' in r['certification']:
                    self.assertFalse(r['certification']['formalIsometryCertified']);self.assertEqual(r['domain']['formalStripRegularity']['status'],'unknown')
                else:
                    self.assertFalse(r['certification']['formalCommonFlatteningCertified'])
                    for side in ('left','right'):
                        self.assertEqual(r['domain']['sourceStripRegularity'][side]['status'],'verified')
                        self.assertEqual(r['domain']['formalStripRegularity'][side]['status'],'unknown')
    def test_roundoff_compatible_raw_frames_keep_previous_formal_and_finite_results(self):
        for preset,fn in [(FLATTEN_PRESET,query_generic_darboux),(RESHAPE_PRESET,query_generic_darboux),(PRESET,query_flatten_fold_generic)]:
            with self.subTest(family=preset['family']):
                r=fn({**copy.deepcopy(preset),'segments':8,'rulingSegments':3})
                self.assertTrue(r['initial']['frameCompatible']);self.assertTrue(r['certification']['initialFrameCompatible'])
                self.assertTrue(r['certification'].get('formalIsometryCertified',r['certification'].get('formalCommonFlatteningCertified')))
                self.assertEqual(r['query']['initialTangent'],preset['initialTangent'])

if __name__=='__main__':unittest.main()
