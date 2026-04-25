# Generated migration for altering unique_together constraint
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('anthology', '0002_alter_anthology_table_comment_and_more'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='anthology',
            unique_together={('user_id', 'title', 'type')},
        ),
    ]
