from django.conf import settings
from django.db import migrations


def normalize_admin_user_id(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    Anthology = apps.get_model('anthology', 'Anthology')

    admin_user = User.objects.filter(username='admin', is_superuser=True).first()
    if not admin_user:
        return

    Anthology.objects.filter(user_id=str(admin_user.id)).update(user_id='admin')


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('anthology', '0003_alter_anthology_unique_together'),
    ]

    operations = [
        migrations.RunPython(normalize_admin_user_id, migrations.RunPython.noop),
    ]
