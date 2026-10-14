from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0071_worldprofession_maze_experience_bonus')]
    operations = [migrations.AddField(model_name='agent', name='role_profile',
        field=models.JSONField(default=dict, blank=True, verbose_name='角色设定', db_comment='结构化角色设定，随 Agent 同步'))]
