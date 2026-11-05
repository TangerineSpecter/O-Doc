import unittest
from .contracts import ShareFormatError, validate_package


class ShareContractTests(unittest.TestCase):
    def setUp(self):
        self.package = {'format': 'odoc.quant.report', 'version': 1,
                        'entry': {'title': '研究', 'kind': 'factor'},
                        'source': {'code': 'x = 1', 'description': '', 'url': '', 'language': 'python', 'files': [], 'related': []},
                        'report': {'markdown': '# 报告', 'data': {'total_score': 70, 'parameters': []}}}

    def test_round_trip_and_copy(self):
        result = validate_package(self.package)
        result['report']['data']['parameters'].append('different')
        self.assertEqual(self.package['report']['data']['parameters'], [])

    def test_rejects_future_version(self):
        self.package['version'] = 2
        with self.assertRaises(ShareFormatError):
            validate_package(self.package)

    def test_rejects_nonfinite_data(self):
        self.package['report']['data']['total_score'] = float('nan')
        with self.assertRaises(ShareFormatError):
            validate_package(self.package)

    def test_rejects_postgres_nul_in_nested_data(self):
        self.package['report']['data']['parameters'] = [{'name': 'bad\0name'}]
        with self.assertRaises(ShareFormatError):
            validate_package(self.package)

    def test_preserves_user_defined_identifiers(self):
        self.package['report']['data']['parameters'] = [{'name': 'ATR_period', 'default_value': '20'}]
        self.assertEqual(validate_package(self.package)['report']['data']['parameters'][0]['name'], 'ATR_period')

    def test_rejects_deeply_nested_data(self):
        nested = []
        for _ in range(500):
            nested = [nested]
        self.package['report']['data']['nested'] = nested
        with self.assertRaisesRegex(ShareFormatError, '嵌套过深'):
            validate_package(self.package)
