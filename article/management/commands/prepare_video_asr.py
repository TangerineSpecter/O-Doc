import os
from django.core.management.base import BaseCommand
from article.video_notes.storage import runtime_root


class Command(BaseCommand):
    help = '预下载部署机器的 CPU 视频转写模型'

    def handle(self, **options):
        from faster_whisper.utils import download_model
        download_model(os.getenv('ODOC_VIDEO_ASR_MODEL', 'small'), cache_dir=str(runtime_root() / 'models'))
        self.stdout.write('视频转写模型已就绪')
