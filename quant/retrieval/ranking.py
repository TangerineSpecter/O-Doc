"""Deterministic lexical evidence and rank fusion; scores are not research ratings."""
import json
import re
import unicodedata
from quant.graph.projection import cosine


def normalized(value: str) -> str:
    return unicodedata.normalize('NFKC', value).casefold().strip()


def lexical(query: str, data: dict) -> tuple[float, list[str]]:
    query = normalized(query)
    words = list(dict.fromkeys(re.findall(r'[a-z0-9_]+|[\u3400-\u9fff]+', query)))[:32]
    # Chinese descriptions need partial recall without a language model tokenizer.
    grams = list(dict.fromkeys(word[i:i+2] for word in words if re.fullmatch(r'[\u3400-\u9fff]{3,}', word) for i in range(len(word)-1)))[:100]
    curated, raw = data['curation'], data['data']
    fields = {'名称': (curated['name'] + ' ' + raw['name'], 5),
        '标签或别名': (' '.join([*curated['tags'], *curated['aliases']]), 4),
        '公式或表达式': (raw['formula'] + ' ' + json.dumps(raw['expression'], ensure_ascii=False), 3),
        '说明': (raw['summary'] + ' ' + curated['note'], 2), '来源标题': (data['entry_title'], 1)}
    if data.get('classification'):
        from quant.taxonomy.normalization import search_labels
        fields['分类词表'] = (' '.join(search_labels(data['classification'])), 4)
    score, reasons = 0., []
    for label, (text, weight) in fields.items():
        text = normalized(text)
        hits = sum(word in text for word in words)
        pairs = sum(gram in text for gram in grams)
        value = (4 if query and query in text else 0) + hits + pairs * .15
        if value:
            score += weight * value
            reasons.append(label)
    return score, reasons


def rank(rows: list[dict], query: str, query_vector: list | None) -> list[dict]:
    keyword, semantic, evidence = [], [], {}
    for row in rows:
        score, fields = lexical(query, row['item'])
        similarity = cosine(query_vector, row['vector']) if query_vector and row['vector'] else None
        evidence[row['item']['id']] = {'keyword_fields': fields, 'semantic_similarity': round(similarity, 8) if similarity is not None and similarity >= .3 else None}
        if score > 0:
            keyword.append((score, row))
        if similarity is not None and similarity >= .3:
            semantic.append((similarity, row))
    scores, selected = {}, {}
    for channel in (keyword, semantic):
        channel.sort(key=lambda pair: (-pair[0], pair[1]['item']['id']))
        for position, (_, row) in enumerate(channel, 1):
            identity = row['item']['id']
            selected[identity] = row
            scores[identity] = scores.get(identity, 0) + 1 / (60 + position)
    return [{**selected[key], 'match': evidence[key] | {'method': 'hybrid-rrf-v1', 'rank_score': scores[key]}}
            for key in sorted(selected, key=lambda key: (-scores[key], key))]
