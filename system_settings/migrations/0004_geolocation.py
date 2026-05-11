import utils.id_generator
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0003_add_minimax_provider'),
    ]

    operations = [
        migrations.CreateModel(
            name='GeoLocation',
            fields=[
                ('id', models.CharField(db_comment='地点ID', default=utils.id_generator.generate_location_id, max_length=40, primary_key=True, serialize=False, verbose_name='地点ID')),
                ('country', models.CharField(db_comment='国家', max_length=100, verbose_name='国家')),
                ('city', models.CharField(db_comment='城市', max_length=100, verbose_name='城市')),
                ('latitude', models.DecimalField(db_comment='纬度', decimal_places=6, max_digits=9, verbose_name='纬度')),
                ('longitude', models.DecimalField(db_comment='经度', decimal_places=6, max_digits=9, verbose_name='经度')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_comment='创建时间', verbose_name='创建时间')),
                ('updated_at', models.DateTimeField(auto_now=True, db_comment='更新时间', verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '地理位置',
                'verbose_name_plural': '地理位置',
                'db_table': 'sys_geo_location',
                'ordering': ['country', 'city'],
                'db_table_comment': '地理位置配置表',
                'unique_together': {('country', 'city')},
            },
        ),
    ]
