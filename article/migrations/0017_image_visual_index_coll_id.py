"""补齐图片本机索引的文集字段，兼容曾运行过不同版本 0016 的设备。"""

from django.db import migrations, models


def add_coll_id_if_missing(apps, schema_editor):
    image_index = apps.get_model('article', 'ImageVisualIndex')
    table = image_index._meta.db_table
    with schema_editor.connection.cursor() as cursor:
        columns = {
            column.name
            for column in schema_editor.connection.introspection.get_table_description(cursor, table)
        }
    if 'coll_id' in columns:
        return

    field = models.CharField(max_length=32, blank=True, default='')
    field.set_attributes_from_name('coll_id')
    field.model = image_index
    schema_editor.add_field(image_index, field)


class Migration(migrations.Migration):
    dependencies = [('article', '0016_image_visual_search')]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[migrations.RunPython(add_coll_id_if_missing, migrations.RunPython.noop)],
            state_operations=[
                migrations.AddField(
                    model_name='imagevisualindex', name='coll_id',
                    field=models.CharField(max_length=32, blank=True, default=''),
                ),
            ],
        ),
    ]
