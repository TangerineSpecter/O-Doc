from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0011_agenttask_webhook_notification'),
    ]

    operations = [
        migrations.AddField(
            model_name='mcpserver',
            name='available_in_chat',
            field=models.BooleanField(default=False, db_comment='是否可在 AI Chat 中装载', verbose_name='提供给 AI 对话'),
        ),
    ]
