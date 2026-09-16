from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('book_analysis', '0006_correction_introduced_ordinal'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='analysisrun',
            name='node_id',
        ),
        migrations.RemoveField(
            model_name='analysisrun',
            name='through_chapter',
        ),
    ]
