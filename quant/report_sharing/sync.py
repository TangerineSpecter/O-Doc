"""Validate portable snapshots before restoring them on another device."""
from .contracts import ShareFormatError, validate_package


def validate_imported_reports(rows, fail):
    seen = set()
    for identity, fields in rows.get('quant.importedresearchreport', {}).items():
        entry = fields.get('entry')
        if entry not in rows.get('quant.entry', {}) or entry in seen or str(identity) != str(entry):
            fail('导入报告归属无效')
        seen.add(entry)
        try:
            validate_package(fields.get('package'))
        except ShareFormatError:
            fail('导入报告内容无效')
