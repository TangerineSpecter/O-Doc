from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('article', '0008_image_place_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='article',
            name='mind_map',
            field=models.JSONField(blank=True, db_comment='文章思维导图结构化数据', default=dict, help_text='文章思维导图结构化数据'),
        ),
    ]
