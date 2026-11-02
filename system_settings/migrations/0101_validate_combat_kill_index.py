"""Validate or safely recover the index on devices that already applied 0100."""
from importlib import import_module

from django.db import migrations


def validate_index(apps, schema_editor):
    import_module('system_settings.migrations.0100_combat_kill_index').create_index(apps, schema_editor)


class Migration(migrations.Migration):
    atomic = False
    dependencies = [('system_settings', '0100_combat_kill_index')]
    operations = [migrations.RunPython(validate_index, migrations.RunPython.noop, atomic=False)]
