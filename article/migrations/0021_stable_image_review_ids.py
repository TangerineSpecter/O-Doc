"""统一已有照片评价的跨设备主键。"""
import hashlib

from django.db import migrations


def stabilize_ids(apps, schema_editor):
    Review = apps.get_model('article', 'ImageReview')
    for review in Review.objects.using(schema_editor.connection.alias).all().iterator():
        key = f'{review.image_id}\0{review.agent_key}'.encode('utf-8')
        stable_id = 'irev_' + hashlib.sha256(key).hexdigest()[:27]
        if review.pk != stable_id:
            Review.objects.using(schema_editor.connection.alias).filter(pk=review.pk).update(review_id=stable_id)


class Migration(migrations.Migration):
    dependencies = [('article', '0020_image_review')]
    operations = [migrations.RunPython(stabilize_ids, migrations.RunPython.noop)]
