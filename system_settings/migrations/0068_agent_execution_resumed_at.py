"""补齐恢复时间；兼容开发期间曾在 0067 中提前添加此列的数据库。"""
from django.db import migrations, models


class AddFieldIfMissing(migrations.AddField):
    def database_forwards(self, app_label, schema_editor, from_state, to_state):
        model = to_state.apps.get_model(app_label, self.model_name)
        if not self.allow_migrate_model(schema_editor.connection.alias, model):
            return
        field = model._meta.get_field(self.name)
        with schema_editor.connection.cursor() as cursor:
            columns = schema_editor.connection.introspection.get_table_description(cursor, model._meta.db_table)
        if field.column not in {column.name for column in columns}:
            super().database_forwards(app_label, schema_editor, from_state, to_state)


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0067_agent_archive')]
    operations = [
        AddFieldIfMissing(
            model_name='agent', name='execution_resumed_at',
            field=models.DateTimeField(null=True, blank=True),
        ),
    ]
