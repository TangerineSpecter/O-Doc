import csv
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

from django.test import SimpleTestCase

from .agent_world.travel_csv import HEADERS, export_city_template, read_chinese_names, validate_city_template


def city_line(source_id, name, region='30'):
    fields = [''] * 19
    fields[0], fields[1], fields[6], fields[7], fields[8], fields[10] = source_id, name, 'P', 'PPLA2', 'CN', region
    return '\t'.join(fields)


class TravelCityCsvTests(SimpleTestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        with ZipFile(self.root / 'cities15000.zip', 'w') as archive:
            # Same display names must remain two separate cities.
            archive.writestr('cities15000.txt', city_line('1001', 'Same City') + '\n' + city_line('1002', 'Same City', '11') + '\n')
        fields = [''] * 19
        fields[0], fields[4], fields[16] = 'CN', 'China', '100'
        (self.root / 'countryInfo.txt').write_text('#comment\n' + '\t'.join(fields) + '\n')
        (self.root / 'admin1CodesASCII.txt').write_text('CN.30\tGuangdong\tGuangdong\t200\nCN.11\tSichuan\tSichuan\t201\n')
        self.aliases = self.root / 'alternateNamesV2.zip'
        with ZipFile(self.aliases, 'w') as archive:
            archive.writestr('alternateNamesV2.txt', '\n'.join([
                '1\t100\tzh\t中国\t1\t\t\t',
                '2\t200\tzh\t广东\t1\t\t\t',
                '3\t201\tzh\t四川\t1\t\t\t',
                '4\t1001\tja\t日本語名\t1\t\t\t',
                '5\t1001\tzh\t过时名字\t1\t\t\t1',
                '6\t1001\tzh\t非首选\t\t\t\t',
                '7\t1001\tzh\t深圳\t1\t\t\t',
            ]) + '\n')

    def _rows(self):
        output = self.root / 'cities.csv'
        stats = export_city_template(self.root, output)
        self.assertTrue(output.read_bytes().startswith(b'\xef\xbb\xbf'))
        with output.open(encoding='utf-8-sig', newline='') as source:
            rows = validate_city_template(source)
        return stats, rows

    @staticmethod
    def _csv(rows, headers=HEADERS):
        source = StringIO()
        writer = csv.DictWriter(source, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)
        source.seek(0)
        return source

    def test_export_has_stable_identity_localization_and_empty_prices(self):
        stats, rows = self._rows()
        self.assertEqual(stats, {'cities': 2, 'countries': 1, 'cities_with_chinese_name': 1})
        self.assertEqual({row['城市ID'] for row in rows}, {'1001', '1002'})
        self.assertTrue(all(row['价格'] == '' for row in rows))
        self.assertTrue(all(row['国家'] == '中国' for row in rows))
        localized = next(row for row in rows if row['城市ID'] == '1001')
        self.assertEqual(localized['城市'], '深圳')
        self.assertEqual(localized['省/州'], '广东')
        self.assertEqual(next(row['城市'] for row in rows if row['城市ID'] == '1002'), 'Same City')

    def test_translation_rejects_wrong_language_historic_and_unknown_ids(self):
        self.assertEqual(read_chinese_names(self.aliases, {'1001'}), {'1001': '深圳'})

    def test_filled_prices_validate_and_blank_enabled_price_is_rejected(self):
        _, rows = self._rows()
        with self.assertRaises(ValueError):
            validate_city_template(self._csv(rows), require_prices=True)
        rows[0]['价格'] = '5000'
        rows[1]['价格'] = '3200.50'
        self.assertEqual(validate_city_template(self._csv(rows), require_prices=True), rows)
        rows[1]['价格'], rows[1]['启用'] = '', '0'
        self.assertEqual(len(validate_city_template(self._csv(rows), require_prices=True)), 2)

    def test_duplicate_id_is_rejected_but_duplicate_names_are_allowed(self):
        _, rows = self._rows()
        rows[1]['城市'] = rows[0]['城市']
        self.assertEqual(len(validate_city_template(self._csv(rows))), 2)
        rows[1]['城市ID'] = rows[0]['城市ID']
        with self.assertRaises(ValueError):
            validate_city_template(self._csv(rows))

    def test_invalid_prices_and_headers_are_rejected(self):
        _, rows = self._rows()
        for price in ('0', '-1', 'NaN', 'Infinity', '12.345', '10000000000', '2000元'):
            with self.subTest(price=price), self.assertRaises(ValueError):
                rows[0]['价格'] = price
                validate_city_template(self._csv(rows))
        with self.assertRaises(ValueError):
            validate_city_template(StringIO('国家,城市,价格\n中国,深圳,5000\n'))

    def test_malformed_source_is_rejected_and_formula_names_are_escaped(self):
        with ZipFile(self.root / 'cities15000.zip', 'w') as archive:
            archive.writestr('cities15000.txt', city_line('1002', '=HYPERLINK("https://example.org")') + '\n')
        _, rows = self._rows()
        self.assertTrue(rows[0]['城市'].startswith("'="))
        with ZipFile(self.root / 'cities15000.zip', 'w') as archive:
            archive.writestr('cities15000.txt', '1002\tIncomplete\n')
        with self.assertRaises(ValueError):
            export_city_template(self.root, self.root / 'invalid.csv')
