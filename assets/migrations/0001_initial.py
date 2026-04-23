import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('article', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Asset',
            fields=[
                ('id', models.CharField(max_length=32, primary_key=True, serialize=False, verbose_name='资源ID')),
                ('name', models.CharField(max_length=255, verbose_name='文件名')),
                ('original_name', models.CharField(max_length=255, verbose_name='原始文件名')),
                ('file_type', models.CharField(choices=[('document', '文档'), ('image', '图片'), ('audio', '音频'), ('video', '视频'), ('archive', '压缩包'), ('code', '代码'), ('other', '其他')], max_length=20, verbose_name='文件类型')),
                ('file_size', models.BigIntegerField(verbose_name='文件大小(字节)')),
                ('file_path', models.CharField(max_length=500, verbose_name='文件存储路径')),
                ('file_extension', models.CharField(max_length=10, verbose_name='文件扩展名')),
                ('mime_type', models.CharField(max_length=100, verbose_name='MIME类型')),
                ('uploader', models.CharField(default='admin', max_length=50, verbose_name='上传者')),
                ('is_linked', models.BooleanField(default=False, verbose_name='是否已关联')),
                ('source_type', models.CharField(choices=[('attachment', '附件'), ('content', '内容'), ('other', '其他')], default='other', max_length=20, verbose_name='资源来源类型')),
                ('is_valid', models.BooleanField(default=True, verbose_name='是否有效')),
                ('upload_time', models.DateTimeField(auto_now_add=True, verbose_name='上传时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('file_hash', models.CharField(db_index=True, max_length=64, verbose_name='文件哈希值')),
                ('metadata', models.JSONField(blank=True, default=dict, verbose_name='文件元数据')),
                ('linked_article', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='article.article', verbose_name='关联文章')),
            ],
            options={
                'verbose_name': '资源',
                'verbose_name_plural': '资源管理',
                'db_table': 'assets',
                'ordering': ['-upload_time'],
                'indexes': [
                    models.Index(fields=['file_type'], name='assets_file_ty_1073cc_idx'),
                    models.Index(fields=['is_linked'], name='assets_is_link_5069e6_idx'),
                    models.Index(fields=['uploader'], name='assets_uploade_5a0888_idx'),
                    models.Index(fields=['linked_article'], name='assets_linked__123de5_idx'),
                    models.Index(fields=['file_hash'], name='assets_file_ha_18713e_idx'),
                    models.Index(fields=['upload_time'], name='assets_upload__592f70_idx'),
                    models.Index(fields=['source_type'], name='assets_source__8764a8_idx'),
                ],
            },
        ),
    ]
