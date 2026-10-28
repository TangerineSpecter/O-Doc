from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('quant', '0032_mt4_expert_requirements')]

    operations = [
        migrations.AddField(
            model_name='mt4attachment',
            name='note',
            field=models.CharField(blank=True, default='', max_length=500),
        ),
    ]
