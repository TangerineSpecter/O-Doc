from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0096_adventure_backup_equipment')]
    operations = [migrations.CreateModel(name='TournamentIllustration', fields=[
        ('tournament', models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, primary_key=True,
                                             related_name='illustration', serialize=False, to='system_settings.tournament')),
        ('owner_id', models.CharField(db_index=True, max_length=40)),
        ('asset_id', models.CharField(blank=True, default='', max_length=32)),
        ('request_id', models.CharField(blank=True, default='', max_length=80)),
        ('updated_at', models.DateTimeField(auto_now=True)),
    ])]
