from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from article.video_notes.asr_models import model_status, prepare_model
from article.video_notes.storage import VideoError
from utils.response_utils import success_result, valid_result


class VideoASRModelView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        try:
            return success_result(model_status())
        except (VideoError, OSError):
            return valid_result('无法读取模型目录，请检查服务器目录权限与配置', status=503)

    def post(self, request):
        if not request.user.is_superuser:
            return valid_result('请由管理员下载服务器转写模型', status=403)
        try:
            return success_result(prepare_model(background=True))
        except VideoError as exc:
            return valid_result(str(exc), status=400)
        except OSError:
            return valid_result('无法创建模型文件，请检查服务器磁盘空间与目录权限', status=503)
