class CurrentUserOrAdminDefault:
    """
    自定义默认值逻辑：
    如果用户已登录，返回用户ID；
    如果用户未登录（游客），返回 'admin'。
    配合 Serializer 的 HiddenField 使用。
    """
    # 这一行必须加，告诉 DRF 这个类需要访问 context (request)
    requires_context = True

    def __call__(self, serializer_field):
        # 从 context 中获取 request
        request = serializer_field.context.get('request')

        # 判断用户是否登录
        if request and request.user and request.user.is_authenticated:
            try:
                profile_userid = getattr(request.user.profile, 'userid', '')
            except Exception:
                profile_userid = ''
            if profile_userid:
                return profile_userid
            if request.user.is_superuser and request.user.username == 'admin':
                return 'admin'
            return str(request.user.id)

        # 游客模式，返回默认值
        return 'admin'
