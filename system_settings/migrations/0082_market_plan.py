# Generated manually for daily market planning, disposition and hourly ticks.

import decimal

import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('system_settings', '0081_bounty'),
    ]

    operations = [
        migrations.CreateModel(
            name='MarketPlan',
            fields=[
                ('id', models.CharField(max_length=80, primary_key=True, serialize=False)),
                ('owner_id', models.CharField(db_index=True, max_length=40)),
                ('actor_id', models.CharField(db_index=True, max_length=40)),
                ('actor_name', models.CharField(blank=True, default='', max_length=50)),
                ('plan_date', models.DateField(db_index=True)),
                ('status', models.CharField(default='active', max_length=16)),
                ('budget', models.DecimalField(decimal_places=2, default=decimal.Decimal('0'), max_digits=16)),
                ('spent', models.DecimalField(decimal_places=2, default=decimal.Decimal('0'), max_digits=16)),
                ('equipment_signature', models.CharField(blank=True, default='', max_length=64)),
                ('summary', models.CharField(blank=True, default='', max_length=1000)),
                ('context', models.JSONField(default=dict)),
                ('version', models.PositiveIntegerField(default=1)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-plan_date', 'id'],
                'constraints': [
                    models.UniqueConstraint(fields=('owner_id', 'actor_id', 'plan_date'),
                                            name='market_plan_actor_day_unique'),
                ],
            },
        ),
        migrations.CreateModel(
            name='MarketDisposition',
            fields=[
                ('id', models.CharField(max_length=64, primary_key=True, serialize=False)),
                ('owner_id', models.CharField(db_index=True, max_length=40)),
                ('actor_id', models.CharField(db_index=True, max_length=40)),
                ('sku', models.CharField(max_length=128)),
                ('target_hold', models.PositiveIntegerField(default=0)),
                ('sell_ratio', models.PositiveSmallIntegerField(default=0)),
                ('list_ratio', models.PositiveSmallIntegerField(default=0)),
                ('star_order', models.CharField(default='low', max_length=8)),
                ('list_price_ratio', models.DecimalField(decimal_places=2, default=decimal.Decimal('1.20'), max_digits=6)),
                ('status', models.CharField(default='active', max_length=16)),
                ('source', models.CharField(default='model', max_length=16)),
                ('reason', models.CharField(blank=True, default='', max_length=500)),
                ('revision', models.PositiveIntegerField(default=1)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['sku', 'id'],
                'constraints': [
                    models.UniqueConstraint(fields=('owner_id', 'actor_id', 'sku'),
                                            name='market_disposition_actor_sku_unique'),
                ],
            },
        ),
        migrations.CreateModel(
            name='MarketDispositionTask',
            fields=[
                ('id', models.CharField(max_length=64, primary_key=True, serialize=False)),
                ('owner_id', models.CharField(db_index=True, max_length=40)),
                ('actor_id', models.CharField(db_index=True, max_length=40)),
                ('sku', models.CharField(max_length=128)),
                ('quantity', models.PositiveIntegerField(default=0)),
                ('source', models.CharField(blank=True, default='', max_length=24)),
                ('status', models.CharField(default='pending', max_length=16)),
                ('attempts', models.PositiveSmallIntegerField(default=0)),
                ('answers', models.JSONField(default=dict)),
                ('error', models.CharField(blank=True, default='', max_length=500)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['created_at', 'id'],
                'indexes': [
                    models.Index(fields=['owner_id', 'actor_id', 'status'], name='market_task_actor_status'),
                    models.Index(fields=['status', 'created_at'], name='market_task_status_created'),
                ],
            },
        ),
        migrations.CreateModel(
            name='MarketNoBuy',
            fields=[
                ('id', models.CharField(max_length=64, primary_key=True, serialize=False)),
                ('owner_id', models.CharField(db_index=True, max_length=40)),
                ('actor_id', models.CharField(db_index=True, max_length=40)),
                ('equipment_id', models.CharField(max_length=64)),
                ('snapshot', models.JSONField(default=dict)),
                ('price', models.DecimalField(decimal_places=2, default=decimal.Decimal('0'), max_digits=12)),
                ('reason', models.CharField(blank=True, default='', max_length=300)),
                ('decided_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-decided_at', 'id'],
                'constraints': [
                    models.UniqueConstraint(fields=('owner_id', 'actor_id', 'equipment_id'),
                                            name='market_no_buy_actor_equipment_unique'),
                ],
            },
        ),
        migrations.CreateModel(
            name='MarketTick',
            fields=[
                ('id', models.CharField(max_length=64, primary_key=True, serialize=False)),
                ('owner_id', models.CharField(db_index=True, max_length=40)),
                ('actor_id', models.CharField(db_index=True, max_length=40)),
                ('hour', models.DateTimeField(db_index=True)),
                ('scheduled_at', models.DateTimeField()),
                ('status', models.CharField(default='pending', max_length=16)),
                ('reason', models.CharField(blank=True, default='', max_length=500)),
                ('hits', models.JSONField(default=dict)),
                ('session_id', models.CharField(blank=True, default='', max_length=64)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-hour', 'id'],
                'indexes': [
                    models.Index(fields=['status', 'scheduled_at'], name='market_tick_status_scheduled'),
                ],
                'constraints': [
                    models.UniqueConstraint(fields=('owner_id', 'actor_id', 'hour'),
                                            name='market_tick_actor_hour_unique'),
                ],
            },
        ),
        migrations.CreateModel(
            name='MarketGoal',
            fields=[
                ('id', models.CharField(max_length=80, primary_key=True, serialize=False)),
                ('owner_id', models.CharField(db_index=True, max_length=40)),
                ('actor_id', models.CharField(db_index=True, max_length=40)),
                ('kind', models.CharField(max_length=16)),
                ('sku', models.CharField(blank=True, default='', max_length=128)),
                ('slot', models.CharField(blank=True, default='', max_length=32)),
                ('min_stars', models.PositiveSmallIntegerField(default=1)),
                ('quantity', models.PositiveIntegerField(default=1)),
                ('filled_quantity', models.PositiveIntegerField(default=0)),
                ('max_unit_price', models.DecimalField(decimal_places=2, default=decimal.Decimal('0'), max_digits=12)),
                ('deadline', models.DateTimeField(blank=True, null=True)),
                ('status', models.CharField(default='open', max_length=16)),
                ('reason', models.CharField(blank=True, default='', max_length=500)),
                ('context', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('plan', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                                           related_name='goals', to='system_settings.marketplan')),
            ],
            options={
                'ordering': ['created_at', 'id'],
                'indexes': [
                    models.Index(fields=['owner_id', 'actor_id', 'status'], name='market_goal_actor_status'),
                    models.Index(fields=['plan', 'status'], name='market_goal_plan_status'),
                ],
            },
        ),
    ]
