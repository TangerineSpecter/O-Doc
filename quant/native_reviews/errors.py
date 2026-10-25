"""Safe workflow reasons; never expose provider text or credentials."""
from rest_framework.exceptions import ValidationError


class NativeReviewStopped(ValidationError):
    def __init__(self,message):
        self.safe_user_message=message
        super().__init__(message)


class NativeReviewBudget(NativeReviewStopped):
    pass


class NativeReviewRejected(NativeReviewStopped):
    pass
