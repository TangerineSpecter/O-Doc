"""只清理旅行记录模板写入的措辞，保留用户编辑的心得与状态。"""
from django.db import migrations
from django.utils import timezone


def reword_content(content):
    lines = content.splitlines(keepends=True)
    if lines and lines[0].startswith('这是一次模拟旅行，地点：'):
        lines[0] = lines[0].replace('这是一次模拟旅行，地点：', '旅行地点：', 1)
    for index, line in enumerate(lines):
        if line.startswith('模拟遭遇：'):
            description = line.removeprefix('模拟遭遇：').removeprefix('模拟遭遇：')
            lines[index] = '旅途遭遇：' + description
    return ''.join(lines)


def apply(apps, schema_editor):
    Memory = apps.get_model('system_settings', 'AgentLongTermMemory')
    alias = schema_editor.connection.alias
    for memory in Memory.objects.using(alias).filter(metadata__source='travel').iterator():
        content = reword_content(memory.content)
        if content != memory.content:
            Memory.objects.using(alias).filter(pk=memory.pk).update(content=content, updated_at=timezone.now())


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0050_migrate_world_life_schedule')]
    operations = [migrations.RunPython(apply, migrations.RunPython.noop)]
