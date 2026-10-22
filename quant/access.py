from django.shortcuts import get_object_or_404
from anthology.models import Anthology
from utils.drf_utils import get_current_user_identifier
from .models import Entry


def owned_collection(request, coll_id):
    return get_object_or_404(Anthology, pk=coll_id, type='quant', is_valid=True,
                             permission='private', user_id=get_current_user_identifier(request))


def owned_entry(collection, entry_id):
    return get_object_or_404(Entry, pk=entry_id, anthology=collection, is_valid=True)
