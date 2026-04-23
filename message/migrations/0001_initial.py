import django.conf
import django.db.models.deletion
import utils.id_generator
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(django.conf.settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.CharField(default=utils.id_generator.generate_msg_id, max_length=40, primary_key=True, serialize=False, verbose_name='消息 ID')),
                ('title', models.CharField(max_length=100, verbose_name='标题')),
                ('content', models.TextField(verbose_name='内容')),
                ('type', models.CharField(choices=[('info', '信息'), ('success', '成功'), ('warning', '警告'), ('error', '错误')], default='info', max_length=20, verbose_name='类型')),
                ('link', models.CharField(blank=True, max_length=255, null=True, verbose_name='关联链接')),
                ('is_read', models.BooleanField(default=False, verbose_name='已读')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to=django.conf.settings.AUTH_USER_MODEL, verbose_name='接收用户')),
            ],
            options={
                'verbose_name': '系统通知',
                'verbose_name_plural': '系统通知',
                'ordering': ['-created_at'],
            },
        ),
    ]
