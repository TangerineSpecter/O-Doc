from django.conf import settings
from django.db import migrations


def normalize_admin_author(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    Article = apps.get_model('article', 'Article')
    Image = apps.get_model('article', 'Image')

    admin_user = User.objects.filter(username='admin', is_superuser=True).first()
    if not admin_user:
        return

    admin_id = str(admin_user.id)
    Article.objects.filter(author=admin_id).update(author='admin')
    Image.objects.filter(author=admin_id).update(author='admin')


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('article', '0006_image_location_coordinates'),
    ]

    operations = [
        migrations.RunPython(normalize_admin_author, migrations.RunPython.noop),
    ]
