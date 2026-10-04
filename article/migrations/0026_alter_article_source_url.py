from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('article', '0025_articlepostcomment_parent_comment_id_and_more')]

    operations = [
        migrations.AlterField(
            model_name='article',
            name='source_url',
            field=models.URLField(blank=True, null=True, max_length=2048,
                                  help_text='文章来源网址', db_comment='文章来源网址'),
        ),
    ]
