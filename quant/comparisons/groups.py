"""Logical connected curation groups; direct comparisons never imply transitive proof."""
from quant.factors.curation import curation_data, unique_labels
from quant.models import FactorMerge


def active_merges(collection_id):
    return FactorMerge.objects.filter(anthology_id=collection_id, withdrawal__isnull=True).select_related('comparison')


def components(candidates: list, merges=None) -> tuple[list[list], list]:
    if not candidates:
        return [], []
    identities = {row.pk: row for row in candidates}
    parent = {identity: identity for identity in identities}
    def root(identity):
        while parent[identity] != identity:
            parent[identity] = parent[parent[identity]]
            identity = parent[identity]
        return identity
    links = list(merges if merges is not None else active_merges(candidates[0].report.entry.anthology_id))
    for link in links:
        left, right = link.comparison.left_id, link.comparison.right_id
        if left in identities and right in identities:
            a, b = root(left), root(right)
            parent[max(a, b)] = min(a, b)
    grouped = {}
    for candidate in candidates:
        grouped.setdefault(root(candidate.pk), []).append(candidate)
    return list(grouped.values()), links


def group_data(members: list, links: list, *, curations=None) -> dict:
    identities = {row.pk for row in members}
    names, aliases = [], []
    for member in members:
        data = curation_data(member, curations=curations)['curation']
        names += [data['name'], member.data['name']]
        aliases += data['aliases']
    related = [row for row in links if row.comparison.left_id in identities and row.comparison.right_id in identities]
    for link in related:
        names.append(link.name)
        for key in ('left', 'right'):
            names.append(link.curation[key]['data']['name'])
            aliases += link.curation[key]['data']['aliases']
    return {'id': 'merged:' + min(identities), 'member_ids': sorted(identities), 'names': unique_labels(names),
        'aliases': unique_labels(aliases), 'active_merge_ids': sorted(row.pk for row in related)}
