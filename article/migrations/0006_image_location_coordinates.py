from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0004_geolocation'),
        ('article', '0005_image_focal_length'),
    ]

    operations = [
        migrations.AddField(
            model_name='image',
            name='latitude',
            field=models.DecimalField(blank=True, db_comment='纬度', decimal_places=6, help_text='纬度', max_digits=9, null=True),
        ),
        migrations.AddField(
            model_name='image',
            name='longitude',
            field=models.DecimalField(blank=True, db_comment='经度', decimal_places=6, help_text='经度', max_digits=9, null=True),
        ),
        migrations.AddField(
            model_name='image',
            name='location',
            field=models.ForeignKey(blank=True, db_comment='拍摄地点配置ID', help_text='拍摄地点配置ID', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='images', to='system_settings.geolocation', verbose_name='拍摄地点'),
        ),
    ]
