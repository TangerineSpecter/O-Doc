from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0023_agent_relations'),
    ]

    operations = [
        migrations.AddField(
            model_name='agent',
            name='money',
            field=models.DecimalField(
                db_comment='Agent 金钱余额，精确到分',
                decimal_places=2,
                default=Decimal('10000.00'),
                max_digits=12,
                verbose_name='金钱',
            ),
        ),
    ]
