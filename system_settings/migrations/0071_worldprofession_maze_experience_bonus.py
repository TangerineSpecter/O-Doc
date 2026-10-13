import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [('system_settings', '0070_worldprofession_maze_bonuses')]

    operations = [
        migrations.AddField(
            model_name='worldprofession',
            name='maze_experience_bonus_percentage',
            field=models.DecimalField(
                decimal_places=4, default=0, max_digits=12,
                validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)],
            ),
        ),
        migrations.AddConstraint(
            model_name='worldprofession',
            constraint=models.CheckConstraint(
                condition=models.Q(('maze_experience_bonus_percentage__gte', 0), ('maze_experience_bonus_percentage__lte', 100)),
                name='world_prof_maze_exp_range',
            ),
        ),
    ]
