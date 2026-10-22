"""Posting/interactions expose counts, cooldown and topics, never full posts."""
from datetime import datetime, timedelta
from .life_time import local_time, storage_time


def summaries(agent, tasks, day):
    result = {}
    for task in tasks:
        if task.task_kind == 'post_publish':
            from .publish_config import own_posts, quota_usage
            cfg = task.publish_config or {}
            total, actors = quota_usage(task, now=storage_time(datetime.combine(day, datetime.min.time(), tzinfo=local_time().tzinfo)))
            limits = []
            if cfg.get('quota_enabled'):
                if cfg.get('quota_total'):
                    limits.append(max(0, cfg['quota_total'] - total))
                if cfg.get('quota_per_agent'):
                    limits.append(max(0, cfg['quota_per_agent'] - actors.get(agent.pk, 0)))
            posts = own_posts(agent).order_by('-created_at')
            last = posts.first()
            # Titles are short published facts and provide topic deduplication.
            result['publishing'] = {'remaining_quota': min(limits) if limits else None,
                'quota_unlimited': not limits, 'cooldown_hours': cfg.get('cooldown_hours', 6),
                'next_available_at': (local_time(last.created_at) + timedelta(hours=cfg.get('cooldown_hours', 6))).isoformat() if last else None,
                'recent_topics': list(posts.values_list('title', flat=True)[:6])}
        elif task.task_kind == 'post_interaction':
            from .post_interaction import candidate_posts, merged_scope, interaction_window_days
            window = interaction_window_days(task, agent)
            posts = candidate_posts(agent, merged_scope(task.post_collection_ids, agent.post_collection_ids),
                                    merged_scope(task.post_category_ids, agent.post_category_ids), window)
            result['reading'] = {'eligible_posts': posts.count(), 'window_days': window, 'energy_per_activity': 10}
    return result
