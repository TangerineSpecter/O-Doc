from django.db import models
from django.contrib.auth.models import User


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile', verbose_name='用户')
    nickname = models.CharField(max_length=150, blank=True, default='', verbose_name='昵称')
    avatar = models.CharField(max_length=500, blank=True, default='', verbose_name='头像')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        db_table = 'user_profile'
        verbose_name = '用户资料'
        verbose_name_plural = verbose_name

    def __str__(self):
        return self.nickname or self.user.username
