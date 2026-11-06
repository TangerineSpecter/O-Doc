"""Add finite retention policies without changing inventory or historical choices."""
import hashlib
import json
from django.core.serializers.json import DjangoJSONEncoder
from django.db import migrations, models
from utils.sync_datetime import SyncJSONEncoder

NAMES = ('MarketBatch', 'MarketListing', 'MarketSession', 'MarketTransaction', 'AgentFarm',
         'AgentInventoryItem', 'MarketPlan', 'MarketGoal', 'MarketDisposition', 'MarketNoBuy')


def hashes(apps, alias, owner, encoder=SyncJSONEncoder):
    result = {}
    for name in NAMES:
        rows = list(apps.get_model('system_settings', name).objects.using(alias)
                    .filter(owner_id=owner).order_by('pk').values())
        if name == 'MarketBatch':
            for row in rows:
                if not row['supplies']:
                    row.pop('supplies')
        result[name] = hashlib.sha256(json.dumps(rows, cls=encoder, sort_keys=True,
                                                 separators=(',', ':')).encode()).hexdigest()
    return result


def check(apps, editor):
    alias = editor.connection.alias
    checkpoints = apps.get_model('system_settings', 'MarketIntegrity').objects.using(alias)
    owners = set(checkpoints.values_list('pk', flat=True))
    for name in ('MarketBatch', 'MarketListing', 'MarketSession', 'MarketTransaction', 'MarketPlan', 'MarketGoal', 'MarketDisposition', 'MarketNoBuy'):
        if apps.get_model('system_settings', name).objects.using(alias).exclude(owner_id__in=owners).exists():
            raise ValueError('市场资产缺少原检查点，拒绝升级库存策略')
    for row in checkpoints.all():
        if row.hashes not in (hashes(apps, alias, row.pk), hashes(apps, alias, row.pk, DjangoJSONEncoder)):
            raise ValueError('市场旧检查点不一致，拒绝升级库存策略；请先修复原设备快照')


def refresh(apps, editor):
    alias = editor.connection.alias
    for row in apps.get_model('system_settings', 'MarketIntegrity').objects.using(alias).all():
        row.hashes = hashes(apps, alias, row.pk)
        row.save(using=alias, update_fields=['hashes', 'updated_at'])


def reverse_check(apps, editor):
    from django.db.migrations.exceptions import IrreversibleError
    if apps.get_model('system_settings', 'MarketDisposition').objects.using(editor.connection.alias).exclude(strategy={}).exists():
        raise IrreversibleError('已有新版业务策略，不能通过回滚字段丢弃；请恢复升级前完整备份')


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0106_combat_solo_settlement')]
    operations = [migrations.RunPython(check, refresh),
                  migrations.AddField(model_name='marketdisposition', name='strategy',
                                      field=models.JSONField(default=dict)),
                  migrations.RunPython(refresh, reverse_check)]
