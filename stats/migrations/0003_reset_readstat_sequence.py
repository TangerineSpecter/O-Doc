from django.core.management.color import no_style
from django.db import migrations


def reset_readstat_sequence(apps, schema_editor):
    read_stat = apps.get_model('stats', 'ReadStat')
    statements = schema_editor.connection.ops.sequence_reset_sql(no_style(), [read_stat])
    for statement in statements:
        schema_editor.execute(statement)


class Migration(migrations.Migration):
    dependencies = [
        ('stats', '0002_alter_readstat_table_comment_alter_readstat_article_and_more'),
    ]

    operations = [
        migrations.RunPython(reset_readstat_sequence, migrations.RunPython.noop),
    ]
