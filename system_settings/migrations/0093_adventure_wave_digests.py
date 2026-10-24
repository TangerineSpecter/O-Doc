from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0092_adventure_parties')]

    operations = [
        migrations.AddField(
            model_name='adventureparty', name='frame_version',
            field=models.PositiveSmallIntegerField(default=1),
        ),
        migrations.AddField(
            model_name='adventurewave', name='content_digest',
            field=models.CharField(blank=True, default='', max_length=64),
            preserve_default=False,
        ),
    ]
