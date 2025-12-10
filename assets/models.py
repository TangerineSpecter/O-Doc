from django.db import models
from article.models import Article


class Asset(models.Model):
    """资源管理模型 - 用于管理项目中的各种文件资源"""
    
    # 文件类型枚举
    FILE_TYPE_CHOICES = [
        ('document', '文档'),
        ('image', '图片'),
        ('audio', '音频'),
        ('video', '视频'),
        ('archive', '压缩包'),
        ('code', '代码'),
        ('other', '其他'),
    ]
    
    # 基础信息
    id = models.CharField(max_length=32, primary_key=True, verbose_name='资源ID')
    name = models.CharField(max_length=255, verbose_name='文件名')
    original_name = models.CharField(max_length=255, verbose_name='原始文件名')
    
    # 文件属性
    file_type = models.CharField(max_length=20, choices=FILE_TYPE_CHOICES, verbose_name='文件类型')
    file_size = models.BigIntegerField(verbose_name='文件大小(字节)')
    file_path = models.CharField(max_length=500, verbose_name='文件存储路径')
    file_extension = models.CharField(max_length=10, verbose_name='文件扩展名')
    mime_type = models.CharField(max_length=100, verbose_name='MIME类型')
    
    # 关联信息
    uploader = models.CharField(max_length=50, default='admin', verbose_name='上传者')
    linked_article = models.ForeignKey(Article, on_delete=models.SET_NULL, null=True, blank=True, verbose_name='关联文章')
    is_linked = models.BooleanField(default=False, verbose_name='是否已关联')
    
    # 状态管理
    is_valid = models.BooleanField(default=True, verbose_name='是否有效')
    upload_time = models.DateTimeField(auto_now_add=True, verbose_name='上传时间')
    update_time = models.DateTimeField(auto_now=True, verbose_name='更新时间')
    
    # 文件哈希（用于去重）
    file_hash = models.CharField(max_length=64, db_index=True, verbose_name='文件哈希值')
    
    # 元数据（JSON格式存储额外信息）
    metadata = models.JSONField(default=dict, blank=True, verbose_name='文件元数据')
    
    class Meta:
        db_table = 'assets'
        verbose_name = '资源'
        verbose_name_plural = '资源管理'
        ordering = ['-upload_time']
        indexes = [
            models.Index(fields=['file_type']),
            models.Index(fields=['is_linked']),
            models.Index(fields=['uploader']),
            models.Index(fields=['linked_article']),
            models.Index(fields=['file_hash']),
            models.Index(fields=['upload_time']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.get_file_type_display()})"
    
    @property
    def formatted_size(self):
        """格式化的文件大小"""
        size = self.file_size
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size < 1024.0:
                return f"{size:.1f} {unit}"
            size /= 1024.0
        return f"{size:.1f} PB"
    
    @property
    def download_url(self):
        """下载链接"""
        return f"/resource/download/{self.id}"
    
    def get_source_info(self):
        """获取来源信息"""
        if self.linked_article:
            return {
                'id': self.linked_article.id,
                'title': self.linked_article.title
            }
        return None
    
    def soft_delete(self):
        """软删除"""
        self.is_valid = False
        self.save(update_fields=['is_valid'])
    
    @classmethod
    def get_by_hash(cls, file_hash):
        """通过文件哈希获取资源"""
        return cls.objects.filter(file_hash=file_hash, is_valid=True).first()
    
    @classmethod
    def get_user_assets(cls, username, **kwargs):
        """获取用户的资源列表"""
        return cls.objects.filter(uploader=username, is_valid=True, **kwargs)
    
    @classmethod
    def get_linked_assets(cls, article_id):
        """获取文章关联的资源"""
        return cls.objects.filter(linked_article_id=article_id, is_valid=True)
    
    @classmethod
    def get_unlinked_assets(cls):
        """获取未关联的资源"""
        return cls.objects.filter(is_linked=False, is_valid=True)
