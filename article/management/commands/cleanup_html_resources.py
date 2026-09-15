from django.core.management.base import BaseCommand
from article.html_note_resources import retry_html_cleanup
from assets.models import Asset


class Command(BaseCommand):
    help = '重试清理已删除 HTML 笔记的专属资源文件'

    def handle(self, *args, **options):
        retry_html_cleanup()
        remaining = Asset.objects.filter(is_valid=False, metadata__html_cleanup_pending=True).count()
        message = f'HTML 资源清理完成，仍待重试 {remaining} 项。'
        self.stdout.write(self.style.WARNING(message) if remaining else self.style.SUCCESS(message))
