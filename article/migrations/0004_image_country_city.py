from django.db import migrations, models


def split_location(apps, schema_editor):
    Image = apps.get_model('article', 'Image')

    for image in Image.objects.all():
        location = (getattr(image, 'location', '') or '').strip()
        if not location:
            continue

        parts = location.split(maxsplit=1)
        image.country = parts[0]
        image.city = parts[1] if len(parts) > 1 else ''
        image.save(update_fields=['country', 'city'])


class Migration(migrations.Migration):

    dependencies = [
        ('article', '0003_image'),
    ]

    operations = [
        migrations.AddField(
            model_name='image',
            name='country',
            field=models.CharField(blank=True, db_comment='拍摄国家', default='', help_text='拍摄国家', max_length=100),
        ),
        migrations.AddField(
            model_name='image',
            name='city',
            field=models.CharField(blank=True, db_comment='拍摄城市', default='', help_text='拍摄城市', max_length=100),
        ),
        migrations.RunPython(split_location, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='image',
            name='location',
        ),
    ]
