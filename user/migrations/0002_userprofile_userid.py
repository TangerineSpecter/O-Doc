from django.db import migrations, models


def set_admin_userid(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    UserProfile = apps.get_model('user', 'UserProfile')

    admin_user = User.objects.filter(username='admin', is_superuser=True).first()
    if not admin_user:
        return

    profile, _ = UserProfile.objects.get_or_create(user=admin_user)
    changed = False
    if profile.userid != 'admin':
        profile.userid = 'admin'
        changed = True
    if not profile.nickname:
        profile.nickname = '管理员'
        changed = True
    if changed:
        profile.save()


class Migration(migrations.Migration):

    dependencies = [
        ('user', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='userid',
            field=models.CharField(blank=True, default='', max_length=50, verbose_name='用户业务ID'),
        ),
        migrations.RunPython(set_admin_userid, migrations.RunPython.noop),
    ]
