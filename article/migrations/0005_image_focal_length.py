from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('article', '0004_image_country_city'),
    ]

    operations = [
        migrations.AddField(
            model_name='image',
            name='focal_length',
            field=models.CharField(blank=True, db_comment='焦段', default='', help_text='焦段', max_length=50),
        ),
    ]
