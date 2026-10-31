"""Build genuine pre-document snapshots for legacy restore regression fixtures."""
from copy import deepcopy


def without_documents(snapshot):
    rows = [deepcopy(row) for row in snapshot if row['model'] != 'quant.researchdocument']
    for row in rows:
        if row['model'] == 'quant.researchreport':
            row['fields'].pop('publication_mode', None)
            row['fields'].pop('factor_bindings', None)
    return rows
