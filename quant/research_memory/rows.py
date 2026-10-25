"""Read selected immutable evidence from a sync snapshot without replaying retrieval."""
from rest_framework.exceptions import ValidationError
from quant.research.contracts import digest
from .contract import instant, project, validate_header
from .evidence import experiment_record, feedback_record


class RowReader:
    def __init__(self, rows: dict):
        self.rows = rows

    def get(self, model: str, identity: str) -> dict:
        row = self.rows.get('quant.' + model, {}).get(str(identity))
        if not isinstance(row, dict):
            raise ValidationError('研究记忆引用的业务事实不存在')
        return row

    def candidate(self, identity: str) -> dict:
        row = self.get('factorcandidate', identity)
        report = self.get('researchreport', row['report'])
        entry = self.get('entry', report['entry'])
        return {'data': row['data'], 'source_id': str(report['source']), 'entry_id': str(report['entry']),
                'collection_id': str(entry['anthology']), 'created_at': row['created_at']}

    def source(self, identity: str) -> dict:
        row = self.get('sourcerevision', identity)
        material = self.get('sourcematerial', row['material'])
        return {**row, 'entry_id': str(material['entry'])}

    def experiment(self, identity: str) -> dict:
        result = self.get('experimentresult', identity)
        request = self.get('experimentrequest', result['request'])
        dataset = self.get('marketdataset', request['dataset'])
        checkpoints = [row for row in self.rows.get('quant.experimentcheckpoint', {}).values()
                       if str(row['request']) == str(result['request'])]
        references = {row['id']: self.candidate(row['id']) for row in request['plan']['seeds']}
        return experiment_record(identity, result, request, dataset, checkpoints, references)

    def feedback(self, identity: str) -> dict:
        source = self.source(identity)
        target = self.source(source['payload']['target_source_id'])
        entry = self.get('entry', source['entry_id'])
        refs = {}
        for key, row in self.rows.get('quant.factorcandidate', {}).items():
            report = self.rows.get('quant.researchreport', {}).get(str(row['report']), {})
            if str(report.get('source')) == source['payload']['target_source_id']:
                refs[key] = self.candidate(key)
        linked_id = source['payload'].get('experiment_result_id')
        linked = self.experiment(linked_id) if linked_id else None
        if linked and (linked['collection_id'] != str(entry['anthology']) or instant(linked['created_at']) > instant(source['created_at'])):
            raise ValidationError('历史反馈引用未来或跨文集实验')
        return feedback_record(identity, source, entry, target, refs,
            linked['seeds'] if linked else None, linked['market'] if linked else None)

    def comparison(self, identity: str, cutoff: str, selected_ids: list[str] | None = None) -> dict:
        from .comparisons import record, MERGE_LIMIT
        comparison = self.get('factorcomparison', identity)
        dataset = self.get('marketdataset', comparison['dataset'])
        refs = {comparison[side]: self.candidate(comparison[side]) for side in ('left', 'right')}
        merges = [{'id': key, **row} for key, row in self.rows.get('quant.factormerge', {}).items()
                  if str(row['comparison']) == identity and instant(row['created_at']) < instant(cutoff)]
        merges.sort(key=lambda row: (instant(row['created_at']), row['id']), reverse=True)
        withdrawals = {str(row['merge']): {'id': key, **row} for key, row in self.rows.get('quant.factormergewithdrawal', {}).items()}
        if selected_ids is None:
            chosen = merges[:MERGE_LIMIT]
        else:
            if (len(selected_ids) > MERGE_LIMIT or any(not isinstance(key, str) for key in selected_ids)
                    or len(set(selected_ids)) != len(selected_ids)):
                raise ValidationError('历史对照合并选择重复或无效')
            by_id = {row['id']: row for row in merges}
            if any(key not in by_id for key in selected_ids):
                raise ValidationError('历史对照合并选择缺失、跨对照或来自未来')
            chosen = [by_id[key] for key in selected_ids]
        selected = [{**row, 'withdrawal': withdrawals.get(row['id'])} for row in chosen]
        return record(identity, comparison, dataset, refs, selected, cutoff=cutoff, merge_total=len(merges))


    def fixed_validation(self,identity,cutoff):
        from .fixed_validations import record
        result=self.get('validationresult',identity)
        request=self.get('validationrequest',result['request']);plan=self.get('validationplan',request['plan'])
        dataset=self.get('marketdataset',request['dataset'])
        source=self.experiment(plan['data']['source']['result_id'])
        return record(identity,result,request,plan,dataset,source,cutoff=cutoff)


def validate_from_rows(memory: dict, rows: dict, *, collection_id: str, latest_at: str, options: list[dict],
                       exclude_result_id: str | None = None, exclude_source_id: str | None = None, exclude_validation_id: str | None = None) -> dict:
    validate_header(memory, latest_at=latest_at)
    reader = RowReader(rows)
    try:
        current = reader.experiment(exclude_result_id) if exclude_result_id else None
    except (KeyError, TypeError, ValueError, RecursionError) as exc:
        raise ValidationError('当前研究实验引用无效') from exc
    if current and current['collection_id'] != collection_id:
        raise ValidationError('当前研究实验不属于研究文集')
    current_market = current['market'] if current else None
    cutoff = instant(memory['cutoff'])
    for item in memory['items']:
        try:
            identity = item['id']
            if identity == (exclude_result_id if item['kind'] == 'experiment' else exclude_source_id if item['kind'] == 'feedback' else exclude_validation_id if item['kind']=='fixed_validation' else None):
                raise ValidationError('研究记忆不能引用当前待分析事实')
            if item['kind'] == 'fixed_validation':
                record=reader.fixed_validation(identity,memory['cutoff'])
            elif item['kind'] == 'comparison':
                evidence = item.get('evidence')
                group = evidence.get('logical_merges') if isinstance(evidence, dict) else None
                states = group.get('items') if isinstance(group, dict) else None
                if not isinstance(states, list) or any(not isinstance(row, dict) or 'id' not in row for row in states):
                    raise ValidationError('历史对照合并快照结构无效')
                record = reader.comparison(identity, memory['cutoff'], [row['id'] for row in states])
            else:
                record = reader.experiment(identity) if item['kind'] == 'experiment' else reader.feedback(identity)
            if record['collection_id'] != collection_id or instant(record['created_at']) >= cutoff:
                raise ValidationError('研究记忆引用跨文集或冻结时点之后的事实')
            expected = project(record, options, current_market)
            if (expected['reason']['rank_score'] <= 0 or item['kind'] == 'comparison' and not expected['reason']['shared_candidate_ids']
                    or digest(item) != digest(expected)):
                raise ValidationError('研究记忆的内容、出处或相关依据被改写')
        except (KeyError, TypeError, ValueError, RecursionError) as exc:
            raise ValidationError('研究记忆的关联事实或结构无效') from exc
    return memory
