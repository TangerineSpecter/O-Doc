import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [('system_settings', '0069_agent_battle_appearance')]

    operations = [
        migrations.AddField(
            model_name='worldprofession',
            name='maze_equipment_drop_bonus_percentage',
            field=models.DecimalField(
                decimal_places=4, default=0, max_digits=12,
                validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)],
            ),
        ),
        migrations.AddField(
            model_name='worldprofession',
            name='maze_material_yield_percentage',
            field=models.DecimalField(
                decimal_places=4, default=0, max_digits=12,
                validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)],
            ),
        ),
        migrations.AddField(
            model_name='worldprofession',
            name='maze_equipment_interval_reduction_percentage',
            field=models.DecimalField(
                decimal_places=4, default=0, max_digits=12,
                validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)],
            ),
        ),
        migrations.AddConstraint(
            model_name='worldprofession',
            constraint=models.CheckConstraint(
                condition=models.Q(('maze_equipment_drop_bonus_percentage__gte', 0), ('maze_equipment_drop_bonus_percentage__lte', 100)),
                name='world_prof_maze_drop_range',
            ),
        ),
        migrations.AddConstraint(
            model_name='worldprofession',
            constraint=models.CheckConstraint(
                condition=models.Q(('maze_material_yield_percentage__gte', 0), ('maze_material_yield_percentage__lte', 100)),
                name='world_maze_mat_range',
            ),
        ),
        migrations.AddConstraint(
            model_name='worldprofession',
            constraint=models.CheckConstraint(
                condition=models.Q(('maze_equipment_interval_reduction_percentage__gte', 0), ('maze_equipment_interval_reduction_percentage__lte', 100)),
                name='world_prof_maze_int_range',
            ),
        ),
    ]
