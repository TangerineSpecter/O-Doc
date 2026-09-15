from django.db import migrations, models


def protect_existing_copies(apps, schema_editor):
    article = apps.get_model('article', 'Article')
    references = apps.get_model('article', 'ArticleAsset')
    # Before this migration only HTML conversion created Markdown material references.
    copy_ids = references.objects.using(schema_editor.connection.alias).filter(role='material').values('article_id')
    article.objects.using(schema_editor.connection.alias).filter(
        content_format='markdown', pk__in=copy_ids,
    ).update(enforce_note_privacy=True)


class Migration(migrations.Migration):
    dependencies = [('article', '0014_html_notes')]
    operations = [
        migrations.AddField(
            model_name='article', name='enforce_note_privacy',
            field=models.BooleanField(default=False, editable=False),
        ),
        migrations.RunPython(protect_existing_copies, migrations.RunPython.noop),
    ]
