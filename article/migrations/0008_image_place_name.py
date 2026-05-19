from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('article', '0007_normalize_admin_author'),
    ]

    operations = [
        migrations.AddField(
            model_name='image',
            name='place_name',
            field=models.CharField(blank=True, db_comment='具体地点', default='', help_text='具体地点，如公园、街道、建筑或店铺名称', max_length=100),
        ),
    ]
