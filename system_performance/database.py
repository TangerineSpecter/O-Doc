"""Read-only pg_stat_statements snapshots. Never install extensions or restart PostgreSQL."""
from django.db import connection
from django.utils import timezone
from .models import DatabaseStatSnapshot


def snapshot_delta(before: dict | None, after: dict) -> dict:
    result = {**after, 'interval_rows': [], 'gap': None}
    if before is None or before.get('status') != 'enabled' or after.get('status') != 'enabled':
        result['gap'] = '需要连续两次可用采样'
        return result
    if after['sampled_at'] - before['sampled_at'] > 120 or after.get('epoch') != before.get('epoch'):
        result['gap'] = '采样中断、统计重置、淘汰或数据库重启，已重新建立基线'
        return result
    previous = {row['identity']: row for row in before['rows']}
    for row in after['rows']:
        old = previous.get(row['identity'])
        if not old or row['calls'] < old['calls'] or row['total_ms'] < old['total_ms']:
            continue
        count, total = row['calls'] - old['calls'], row['total_ms'] - old['total_ms']
        if count:
            result['interval_rows'].append({**row, 'calls': count, 'total_ms': total, 'mean_ms': total / count, 'max_ms': None})
    return result


def read_database():
    if connection.vendor != 'postgresql':
        return {'status': 'unsupported', 'rows': [], 'reason': '仅支持 PostgreSQL'}
    with connection.cursor() as cursor:
        cursor.execute("SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON e.extnamespace=n.oid WHERE e.extname='pg_stat_statements'")
        row = cursor.fetchone()
        if not row:
            return {'status': 'disabled', 'rows': [], 'reason': 'pg_stat_statements 未启用，应用侧 SQL 采集仍可使用'}
        schema = connection.ops.quote_name(row[0])
        cursor.execute(f'SELECT stats_reset::text, dealloc FROM {schema}.pg_stat_statements_info')
        reset, dealloc = cursor.fetchone()
        cursor.execute('SELECT pg_postmaster_start_time()::text, current_setting(\'server_version\')')
        restart, version = cursor.fetchone()
        # Do not even read raw query text: normalized PostgreSQL query text can retain secrets.
        cursor.execute(f'''SELECT dbid, userid, queryid, toplevel, calls, total_exec_time, mean_exec_time, max_exec_time, rows
            FROM {schema}.pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())
            ORDER BY total_exec_time DESC LIMIT 1001''')
        data = cursor.fetchall()
    rows = [dict(identity=':'.join(map(str, item[:4])), calls=int(item[4]), total_ms=float(item[5]),
                 mean_ms=float(item[6]), max_ms=float(item[7]), rows=int(item[8])) for item in data[:1000]]
    return dict(status='enabled', sampled_at=timezone.now().timestamp(), epoch=[restart, reset, dealloc],
                postgres_version=version, rows=rows, truncated=len(data) > 1000,
                selection='累计执行耗时前 1000；含数据库所见的监控语句，无法可靠识别的语句不擅自排除')


def sample_database():
    try:
        state = read_database()
    except Exception:
        state = {'status': 'unavailable', 'rows': [], 'reason': '扩展查询失败或读取权限不足，未修改数据库配置'}
    from .storage import save_database_snapshot
    save_database_snapshot(state)


def database_state():
    snapshots = list(DatabaseStatSnapshot.objects.order_by('-created')[:2])
    if not snapshots:
        return {'status': 'pending', 'rows': [], 'interval_rows': [], 'reason': '尚未采样；开启采集后每分钟更新'}
    return snapshot_delta(snapshots[1].state if len(snapshots) > 1 else None, snapshots[0].state)
