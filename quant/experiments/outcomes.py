"""Publish immutable completion facts separately from revocable execution leases."""
from quant.models import ExperimentRequest, ExperimentResult, ExperimentCheckpoint
from quant.research.contracts import digest


def finish(request, status: str, *, output=None, error=''):
    checkpoints = list(ExperimentCheckpoint.objects.filter(request=request))
    # A conservative overlap notice. This is not an attestation of unused data:
    # external experiments and activity in other collections are not observable.
    snapshot = request.dataset.snapshot
    peers = ExperimentRequest.objects.filter(anthology_id=request.anthology_id,
        dataset__snapshot__symbol=snapshot['symbol'], dataset__snapshot__timeframe=snapshot['timeframe']).exclude(pk=request.pk).select_related('dataset')
    start, end = snapshot['rows'][0]['timestamp'], snapshot['rows'][-1]['timestamp']
    overlaps = [peer.pk for peer in peers if peer.dataset.snapshot['rows'][0]['timestamp'] <= end
        and peer.dataset.snapshot['rows'][-1]['timestamp'] >= start]
    data = {'version': 1, 'status': status, 'error': error, 'output': output,
        'checkpoint_hashes': [row.content_hash for row in checkpoints],
        'overlap_audit': {'scope': 'same_collection_symbol_timeframe_requested_ranges', 'request_ids': sorted(overlaps)[:100],
            'total': len(overlaps), 'independent_holdout_proven': False}}
    result, _ = ExperimentResult.objects.get_or_create(id=digest(['experiment-result-v1', request.pk])[:40],
        defaults={'request': request, 'data': data, 'content_hash': digest(data)})
    from quant.verification.services import experiment as archive_verification
    archive_verification(result)
    return result
