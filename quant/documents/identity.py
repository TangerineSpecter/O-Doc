"""One research document per entry, including IDs issued before stable creation."""
from quant.research.contracts import digest


def document_id(entry_id: str) -> str:
    return digest(['research-document-v1', str(entry_id)])[:40]


def reuse_local_ids(data: list[dict]) -> None:
    """Keep an existing local one-to-one row when the remote winner uses another ID."""
    from quant.models import ResearchDocument
    documents = [row for row in data if row.get('model') == 'quant.researchdocument']
    local = dict(ResearchDocument.objects.filter(entry_id__in=[row['fields']['entry'] for row in documents])
                 .values_list('entry_id', 'id'))
    for row in documents:
        entry_id = row['fields']['entry']
        row['pk'] = local.get(entry_id, document_id(entry_id))
