from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0015_agent_memory'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='agentimsession',
            name='uniq_agent_im_session_chat',
        ),
        migrations.AddConstraint(
            model_name='agentimsession',
            constraint=models.UniqueConstraint(
                fields=('agent', 'platform', 'chat_id', 'sender_id'),
                name='uniq_agent_im_session_user',
            ),
        ),
    ]
