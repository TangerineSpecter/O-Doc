from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0016_agentimsession_sender_scope'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='agenttask',
            name='output',
        ),
        migrations.RemoveField(
            model_name='agenttask',
            name='target_collection_id',
        ),
        migrations.RemoveField(
            model_name='agenttask',
            name='target_collection_title',
        ),
    ]
