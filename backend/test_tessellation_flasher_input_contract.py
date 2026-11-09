"""Shared JSON frontend/backend input contract; no solver changes."""
import json
from pathlib import Path
import unittest

from tessellate import validate_request

CASES = json.loads((Path(__file__).resolve().parents[1] /
                    'tests/fixtures/flasher-input-contract-20261010.json').read_text(encoding='utf-8'))


class FlasherInputContractTests(unittest.TestCase):
    def test_absent_fields_default_and_all_valid_values_are_preserved(self):
        for case in CASES['valid']:
            with self.subTest(name=case['name']):
                actual = validate_request(case['input'])
                self.assertEqual(actual, case['expected'])
                for key in ('rings', 'heightOrder', 'rotationalOrder'):
                    self.assertIs(type(actual[key]), int)

    def test_explicit_invalid_values_never_default_and_raise_value_error(self):
        for case in CASES['invalid']:
            with self.subTest(name=case['name']), self.assertRaises(ValueError):
                validate_request(case['input'])

    def test_json_decimal_exponent_and_overflow_share_frontend_semantics(self):
        for case in CASES['raw']:
            with self.subTest(name=case['name']):
                data = json.loads(case['text'])
                if case['expected'] is None:
                    with self.assertRaises(ValueError):
                        validate_request(data)
                else:
                    actual = validate_request(data)
                    self.assertEqual(actual, case['expected'])
                    for key in ('rings', 'heightOrder', 'rotationalOrder'):
                        self.assertIs(type(actual[key]), int)

    def test_native_nonfinite_numbers_fail_before_geometry(self):
        for key in ('rings', 'heightOrder', 'rotationalOrder', 'radialIncrement', 'minimumAngleDeg'):
            for value in (float('nan'), float('inf'), float('-inf')):
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    validate_request({'family': 'flasher', key: value})


if __name__ == '__main__':
    unittest.main()
