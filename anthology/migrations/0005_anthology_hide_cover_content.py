from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('anthology', '0004_normalize_admin_user_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='anthology',
            name='hide_cover_content',
            field=models.BooleanField(
                db_comment='是否隐藏文集列表封面内容',
                default=False,
                verbose_name='是否隐藏封面内容'
            ),
        ),
    ]
