from django.core.management.base import BaseCommand, CommandError
from article.video_notes.asr_models import prepare_model
from article.video_notes.storage import VideoError


class Command(BaseCommand):
    help = '预下载部署机器的 CPU 视频转写模型'

    def handle(self, **options):
        try:
            state = prepare_model()
        except VideoError as exc:
            raise CommandError(str(exc)) from exc
        if state['state'] != 'ready':
            raise CommandError(state['message'])
        self.stdout.write('视频转写模型已就绪')
