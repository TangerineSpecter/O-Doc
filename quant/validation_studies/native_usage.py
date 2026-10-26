"""Data supplied to arbitrary Python is used even if output comparison fails."""
from rest_framework.exceptions import ValidationError


def bounds(offset: int, count: int, timestamps: list[str]) -> dict:
    if (type(offset) is not int or type(count) is not int or offset < 0 or not 30 <= count <= 20000
            or offset + count > len(timestamps)):
        raise ValidationError('原始Python预约片段无法由冻结行情重建')
    # Warmup is not excluded: the source receives every supplied row and can
    # inspect it before producing any output, including failure/early return.
    return {'start_timestamp':timestamps[offset], 'end_timestamp':timestamps[offset+count-1]}


def sample(offset: int, count: int) -> dict:
    return {'offset':offset, 'row_count':count, 'scope':'all_supplied_rows_including_warmup'}
