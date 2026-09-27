from django.db import migrations


def seed_snapshots(apps, schema_editor):
    Agent = apps.get_model('system_settings', 'Agent')
    Activity = apps.get_model('system_settings', 'AgentActivity')
    Review = apps.get_model('article', 'ImageReview')
    alias = schema_editor.connection.alias
    for agent in Agent.objects.using(alias).all().iterator():
        for activity in Activity.objects.using(alias).filter(agent_id=agent.pk).iterator():
            metadata = activity.metadata if isinstance(activity.metadata, dict) else {}
            if not metadata.get('agentSnapshot'):
                activity.metadata = {**metadata, 'agentSnapshot': {
                    'id': agent.pk, 'name': agent.name, 'avatar': agent.avatar,
                }}
                activity.save(using=alias, update_fields=['metadata'])
        for review in Review.objects.using(alias).filter(agent_key=agent.pk, agent_avatar='').iterator():
            review.agent_avatar = agent.avatar
            review.save(using=alias, update_fields=['agent_avatar'])


class Migration(migrations.Migration):
    dependencies = [
        ('system_settings', '0031_worldmonthsettlement_collection_title'),
        ('article', '0024_imagereview_agent_avatar'),
    ]
    operations = [migrations.RunPython(seed_snapshots, migrations.RunPython.noop)]
