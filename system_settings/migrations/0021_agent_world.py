import django.db.models.deletion
import django.utils.timezone
import utils.id_generator
from django.db import migrations, models


def _agent_for_creator(Agent, creator_id, creator_name=''):
    value = str(creator_id or '')
    candidates = [value]
    if value.startswith('agent:'):
        candidates.append(value[6:])
    return Agent.objects.filter(id__in=candidates).first() or Agent.objects.filter(name=creator_name).first()


def backfill_agent_activities(apps, schema_editor):
    Agent = apps.get_model('system_settings', 'Agent')
    AgentActivity = apps.get_model('system_settings', 'AgentActivity')
    AgentRunRecord = apps.get_model('system_settings', 'AgentRunRecord')
    Article = apps.get_model('article', 'Article')
    ArticlePostComment = apps.get_model('article', 'ArticlePostComment')
    ArticleAnnotation = apps.get_model('article', 'ArticleAnnotation')
    ArticleAnnotationComment = apps.get_model('article', 'ArticleAnnotationComment')
    covered_annotation_comment_ids = set()

    for record in AgentRunRecord.objects.all().iterator():
        runs = record.agent_runs if isinstance(record.agent_runs, list) else []
        if not runs and record.agent_id:
            runs = [{
                'agent': record.agent_id,
                'agentName': record.agent_name,
                'status': record.status,
                'summary': record.summary,
                'content': record.output,
            }]
        for item in runs:
            if not isinstance(item, dict):
                continue
            agent_id = str(item.get('agent') or '')
            agent = Agent.objects.filter(id=agent_id).first()
            name = str(item.get('agentName') or (agent.name if agent else record.agent_name) or 'Agent')
            status = item.get('status') if item.get('status') in {'running', 'success', 'failed'} else record.status
            summary = str(item.get('summary') or record.summary or '') if status != 'failed' else '任务执行失败，请到执行记录查看详情'
            content = str(item.get('content') or '')
            AgentActivity.objects.get_or_create(
                event_key=f'legacy:run:{record.id}:{agent_id or name}',
                defaults={
                    'activity_type': 'work',
                    'status': status,
                    'agent': agent,
                    'run_record': record,
                    'title': f'{name}{"完成了" if record.status == "success" else "执行了"}「{record.task_name}」'[:180],
                    'summary': summary,
                    'current_action': '任务执行完成' if status == 'success' else ('执行遇到问题' if status == 'failed' else '任务正在执行'),
                    'metadata': {'outputPreview': content[:300]},
                    'occurred_at': record.started_at,
                },
            )

    for post in Article.objects.exclude(agent_post_creator_id='').filter(is_valid=True).iterator():
        agent = _agent_for_creator(Agent, post.agent_post_creator_id, post.agent_post_creator_name)
        AgentActivity.objects.get_or_create(
            event_key=f'legacy:post:{post.article_id}',
            defaults={
                'activity_type': 'publication',
                'status': 'success',
                'agent': agent,
                'title': f'{post.agent_post_creator_name or "Agent"}发布了《{post.title}》'[:180],
                'summary': post.post_summary or post.content[:500],
                'current_action': '发布了新作品',
                'artifact_kind': 'agentPost',
                'artifact_id': post.article_id,
                'artifact_article_id': post.article_id,
                'artifact_coll_id': post.coll_id,
                'artifact_title': post.title,
                'occurred_at': post.created_at,
            },
        )

    for comment in ArticlePostComment.objects.filter(is_valid=True, creator_id__startswith='agent:').select_related('article').iterator():
        agent = _agent_for_creator(Agent, comment.creator_id, comment.creator_name)
        AgentActivity.objects.get_or_create(
            event_key=f'legacy:post-comment:{comment.comment_id}',
            defaults={
                'activity_type': 'interaction',
                'status': 'success',
                'agent': agent,
                'title': f'{comment.creator_name or "Agent"}评价了《{comment.article.title}》'[:180],
                'summary': comment.content[:1000],
                'current_action': '发表了评论',
                'artifact_kind': 'articleComment',
                'artifact_id': comment.comment_id,
                'artifact_article_id': comment.article_id,
                'artifact_coll_id': comment.article.coll_id,
                'artifact_title': comment.article.title,
                'occurred_at': comment.created_at,
            },
        )

    for annotation in ArticleAnnotation.objects.filter(is_valid=True, creator_type='agent').select_related('article').iterator():
        agent = _agent_for_creator(Agent, annotation.creator_id, annotation.creator_name)
        first_comment = annotation.comments.filter(is_valid=True).order_by('created_at').first()
        if first_comment and first_comment.creator_type == 'agent' and first_comment.creator_id == annotation.creator_id:
            covered_annotation_comment_ids.add(first_comment.comment_id)
        AgentActivity.objects.get_or_create(
            event_key=f'legacy:annotation:{annotation.annotation_id}',
            defaults={
                'activity_type': 'interaction',
                'status': 'success',
                'agent': agent,
                'title': f'{annotation.creator_name or "Agent"}批注了《{annotation.article.title}》'[:180],
                'summary': (first_comment.content if first_comment else annotation.selected_text)[:1000],
                'current_action': '留下了文章批注',
                'artifact_kind': 'articleAnnotation',
                'artifact_id': annotation.annotation_id,
                'artifact_article_id': annotation.article_id,
                'artifact_coll_id': annotation.article.coll_id,
                'artifact_title': annotation.article.title,
                'occurred_at': annotation.created_at,
            },
        )

    annotation_comments = ArticleAnnotationComment.objects.filter(
        is_valid=True,
        creator_type='agent',
        annotation__is_valid=True,
        annotation__article__is_valid=True,
    ).exclude(comment_id__in=covered_annotation_comment_ids).select_related('annotation__article')
    for comment in annotation_comments.iterator():
        annotation = comment.annotation
        article = annotation.article
        agent = _agent_for_creator(Agent, comment.creator_id, comment.creator_name)
        AgentActivity.objects.get_or_create(
            event_key=f'legacy:annotation-comment:{comment.comment_id}',
            defaults={
                'activity_type': 'interaction',
                'status': 'success',
                'agent': agent,
                'title': f'{comment.creator_name or "Agent"}继续讨论《{article.title}》'[:180],
                'summary': comment.content[:1000],
                'current_action': '追加了评论',
                'artifact_kind': 'articleAnnotation',
                'artifact_id': annotation.annotation_id,
                'artifact_article_id': article.article_id,
                'artifact_coll_id': article.coll_id,
                'artifact_title': article.title,
                'occurred_at': comment.created_at,
            },
        )


class Migration(migrations.Migration):
    dependencies = [
        ('article', '0013_article_agent_post_category_articlepostrating'),
        ('system_settings', '0020_sync_entity_state'),
    ]

    operations = [
        migrations.AddField(
            model_name='agenttask',
            name='followup_action',
            field=models.CharField(choices=[('review', '评价作品'), ('continue_research', '继续调查')], db_comment='后续动作类型', default='review', max_length=30, verbose_name='后续动作'),
        ),
        migrations.AddField(
            model_name='agenttask',
            name='followup_agent',
            field=models.ForeignKey(blank=True, db_comment='后续执行 Agent ID', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='followup_tasks', to='system_settings.agent', verbose_name='后续 Agent'),
        ),
        migrations.AddField(
            model_name='agenttask',
            name='followup_enabled',
            field=models.BooleanField(db_comment='主任务完成后是否触发后续 Agent', default=False, verbose_name='启用后续任务'),
        ),
        migrations.AddField(
            model_name='agenttask',
            name='followup_prompt',
            field=models.TextField(blank=True, db_comment='后续 Agent 补充提示词', default='', verbose_name='后续要求'),
        ),
        migrations.AddField(
            model_name='agentrunrecord',
            name='followup_depth',
            field=models.PositiveSmallIntegerField(db_comment='普通任务为 0，首层后续任务为 1', default=0, verbose_name='后续深度'),
        ),
        migrations.AddField(
            model_name='agentrunrecord',
            name='parent_record',
            field=models.ForeignKey(blank=True, db_comment='触发本次后续执行的记录 ID', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='followup_records', to='system_settings.agentrunrecord', verbose_name='来源执行记录'),
        ),
        migrations.AddField(
            model_name='agentrunrecord',
            name='source_agent',
            field=models.ForeignKey(blank=True, db_comment='触发后续执行的来源 Agent ID', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='triggered_followup_records', to='system_settings.agent', verbose_name='来源 Agent'),
        ),
        migrations.AddConstraint(
            model_name='agentrunrecord',
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    agent__isnull=False,
                    followup_depth=1,
                    parent_record__isnull=False,
                    source_agent__isnull=False,
                ),
                fields=('parent_record', 'source_agent', 'agent', 'followup_depth'),
                name='uniq_agent_followup_run_src',
            ),
        ),
        migrations.CreateModel(
            name='AgentActivity',
            fields=[
                ('id', models.CharField(default=utils.id_generator.generate_agent_activity_id, max_length=40, primary_key=True, serialize=False)),
                ('event_key', models.CharField(db_comment='用于幂等写入动态', max_length=180, unique=True, verbose_name='事件唯一键')),
                ('activity_type', models.CharField(choices=[('work', '工作'), ('publication', '作品'), ('interaction', '互动')], db_comment='动态类型', max_length=20, verbose_name='动态类型')),
                ('status', models.CharField(choices=[('success', '成功'), ('failed', '失败'), ('running', '执行中')], db_comment='动态状态', default='success', max_length=20, verbose_name='状态')),
                ('title', models.CharField(db_comment='用户可读标题', max_length=180, verbose_name='标题')),
                ('summary', models.TextField(blank=True, db_comment='用户可读摘要', default='', verbose_name='摘要')),
                ('current_action', models.CharField(blank=True, db_comment='精选执行动作', default='', max_length=180, verbose_name='当前动作')),
                ('artifact_kind', models.CharField(blank=True, db_comment='关联作品类型', default='', max_length=30, verbose_name='作品类型')),
                ('artifact_id', models.CharField(blank=True, db_comment='文章、评论或批注 ID', default='', max_length=80, verbose_name='作品 ID')),
                ('artifact_article_id', models.CharField(blank=True, db_comment='关联文章 ID', default='', max_length=80, verbose_name='文章 ID')),
                ('artifact_coll_id', models.CharField(blank=True, db_comment='关联文集 ID', default='', max_length=80, verbose_name='文集 ID')),
                ('artifact_title', models.CharField(blank=True, db_comment='关联文章标题快照', default='', max_length=255, verbose_name='作品标题')),
                ('metadata', models.JSONField(blank=True, db_comment='脱敏后的展示扩展信息', default=dict, verbose_name='展示元数据')),
                ('occurred_at', models.DateTimeField(db_comment='动态发生时间', default=django.utils.timezone.now, verbose_name='发生时间')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('agent', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='activities', to='system_settings.agent')),
                ('run_record', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='activities', to='system_settings.agentrunrecord')),
            ],
            options={
                'db_table': 'sys_agent_activity',
                'db_table_comment': 'Agent 精选动态表',
                'ordering': ['-occurred_at', '-created_at'],
            },
        ),
        migrations.AddIndex(model_name='agentactivity', index=models.Index(fields=['activity_type', '-occurred_at'], name='idx_agent_act_type_time')),
        migrations.AddIndex(model_name='agentactivity', index=models.Index(fields=['agent', '-occurred_at'], name='idx_agent_act_agent_time')),
        migrations.RunPython(backfill_agent_activities, migrations.RunPython.noop),
    ]
