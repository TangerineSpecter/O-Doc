import json
def source_data(source):
    from quant.feedback.execution import presentation
    return {'id': source.pk, 'material_id': source.material_id, 'code_version_id': source.code_version_id,
            'content_hash': source.content_hash, 'material_current_source_id': source.material.current_revision_id,
            'payload': presentation(source.payload), 'created_at': source.created_at}


def report_data(report, *, include_history=True):
    from quant.feedback.execution import analysis_presentation
    from quant.experiments.proposals import presentation
    from quant.models import ExperimentProposal
    proposal = ExperimentProposal.objects.filter(run_id=report.run_id).first()
    revisions = list(report.revisions.all()) if include_history else list(report.revisions.filter(pk=report.current_revision_id))
    selected = next((item for item in revisions if item.pk == report.current_revision_id), None)
    return {'id': report.pk, 'source_id': report.source_id, 'run_id': report.run_id,
            'research_memory_json':json.dumps(report.data['research_memory'],ensure_ascii=False) if 'research_memory' in report.data else None,
            'schema_version': report.schema_version, 'proposal': presentation(proposal) if proposal else None, 'data': analysis_presentation({key:value for key,value in report.data.items() if key!='research_memory'}), **({'original_markdown': report.markdown} if include_history else {}),
            'markdown': selected.markdown if selected else report.markdown,
            'current_revision_id': report.current_revision_id, 'created_at': report.created_at,
            **({'revisions': [{'id': row.pk, 'markdown': row.markdown, 'created_at': row.created_at} for row in revisions]} if include_history else {'revision_count': report.revisions.count(), 'content_hash': report.content_hash})}
