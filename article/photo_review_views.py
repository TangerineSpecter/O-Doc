from rest_framework.views import APIView

from article.access import can_access_anthology
from article.models import Image
from article.photo_observation import review_summary
from utils.error_codes import ErrorCode
from utils.response_utils import error_result, success_result


class ImageReviewListView(APIView):
    """一张照片已保存的评价。没有评价时综合分为空。"""

    def get(self, request, image_id):
        image = Image.objects.filter(image_id=image_id, is_valid=True).first()
        if image is None or not can_access_anthology(request, image.coll_id, 'image'):
            return error_result(ErrorCode.RESOURCE_NOT_FOUND)
        return success_result(data=review_summary(image))
