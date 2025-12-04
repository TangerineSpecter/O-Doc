class DatetimeUtils:
    @staticmethod
    def format_datetime(dt):
        """将datetime对象格式化为yyyy-MM-dd HH:mm:ss格式"""
        if dt is None:
            return None
        return dt.strftime('%Y-%m-%d %H:%M:%S')


# 提供便捷的函数式调用方式
format_datetime = DatetimeUtils.format_datetime
