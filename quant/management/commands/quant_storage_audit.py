import json
from django.core.management.base import BaseCommand, CommandError
from anthology.models import Anthology
from quant.reading.capacity import capacity


class Command(BaseCommand):
    help = 'Read-only counts and logical UTF-8 bytes for one quant collection; prints no source or report text.'

    def add_arguments(self, parser):
        parser.add_argument('--collection-id', required=True)

    def handle(self, *args, **options):
        identity = options['collection_id']
        if not Anthology.objects.filter(pk=identity, type='quant').exists():
            raise CommandError('量化文集不存在')
        self.stdout.write(json.dumps(capacity(identity), ensure_ascii=False, indent=2))
