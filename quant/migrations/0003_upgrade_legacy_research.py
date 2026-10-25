from django.db import migrations
from quant.research.legacy_v1 import upgrade


def forwards(apps, schema_editor):
    upgrade(apps, schema_editor.connection.alias)


class Migration(migrations.Migration):
    dependencies = [('quant', '0002_researchreport_reportrevision_sourcematerial_and_more')]
    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
