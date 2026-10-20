# Generated manually for the bounty board.

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models

import system_settings.agent_world.bounty_models


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0080_alchemy'),
        ('article', '0026_alter_article_source_url'),
    ]

    operations = [
        migrations.CreateModel(
            name='Bounty',
            fields=[
                ('id', models.CharField(default=system_settings.agent_world.bounty_models.bounty_id,
                                        max_length=40, primary_key=True, serialize=False)),
                ('owner_id', models.CharField(db_index=True, max_length=40)),
                ('title', models.CharField(max_length=200)),
                ('objective', models.TextField()),
                ('requirements', models.TextField(blank=True, default='')),
                ('collection_id', models.CharField(max_length=40)),
                ('category_id', models.CharField(max_length=64)),
                ('reward', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('status', models.CharField(choices=[('open', 'open'), ('claimed', 'claimed'), ('delivered', 'delivered'),
                                                     ('accepted', 'accepted'), ('cancelled', 'cancelled')],
                                            db_index=True, default='open', max_length=16)),
                ('invite_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('invite_round', models.PositiveIntegerField(default=0)),
                ('claimed_at', models.DateTimeField(blank=True, null=True)),
                ('expire_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('next_try_at', models.DateTimeField(blank=True, null=True)),
                ('delivered_at', models.DateTimeField(blank=True, null=True)),
                ('accepted_at', models.DateTimeField(blank=True, null=True)),
                ('attempt', models.PositiveIntegerField(default=0)),
                ('failures', models.PositiveIntegerField(default=0)),
                ('reject_reason', models.TextField(blank=True, default='')),
                ('last_error', models.CharField(blank=True, default='', max_length=500)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('agent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                            related_name='bounties', to='system_settings.agent')),
                ('article', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                              related_name='bounty_deliveries', to='article.article')),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
        migrations.CreateModel(
            name='BountyInvite',
            fields=[
                ('id', models.CharField(default=system_settings.agent_world.bounty_models.invite_id,
                                        max_length=40, primary_key=True, serialize=False)),
                ('sort', models.PositiveIntegerField(default=0)),
                ('scheduled_at', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('status', models.CharField(choices=[('pending', 'pending'), ('accepted', 'accepted'),
                                                     ('declined', 'declined'), ('expired', 'expired')],
                                            default='pending', max_length=16)),
                ('decision', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('agent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                            related_name='bounty_invites', to='system_settings.agent')),
                ('bounty', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                             related_name='invites', to='system_settings.bounty')),
            ],
            options={
                'ordering': ['bounty_id', 'sort', 'id'],
            },
        ),
        migrations.CreateModel(
            name='BountyDelivery',
            fields=[
                ('id', models.CharField(default=system_settings.agent_world.bounty_models.delivery_id,
                                        max_length=40, primary_key=True, serialize=False)),
                ('summary', models.TextField(blank=True, default='')),
                ('status', models.CharField(choices=[('pending', 'pending'), ('accepted', 'accepted'),
                                                     ('rejected', 'rejected')],
                                            db_index=True, default='pending', max_length=16)),
                ('reject_reason', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('agent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                            related_name='bounty_submissions', to='system_settings.agent')),
                ('article', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                              related_name='bounty_submission_records', to='article.article')),
                ('bounty', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                             related_name='deliveries', to='system_settings.bounty')),
                ('run_record', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                                 related_name='bounty_deliveries', to='system_settings.agentrunrecord')),
            ],
            options={
                'ordering': ['-created_at', '-id'],
            },
        ),
    ]
