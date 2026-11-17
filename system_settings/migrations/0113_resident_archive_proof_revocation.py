"""Revoke owner-wide historical proofs when a cross-day source changes."""
from django.db import migrations


def install(apps, editor):
    if editor.connection.vendor != 'postgresql':
        return

    def table(model):
        return editor.quote_name(apps.get_model('system_settings', model)._meta.db_table)

    # These two corrections are infrequent. A resident can have ledger entries
    # on any day, and a finished party can contribute to several cohorts.
    for model, function, columns, changed, owners in (
        ('AgentActivity', 'odoc_stats_activity_identity', 'metadata, agent_id', """
            (OLD.metadata->>'owner_id', COALESCE(NULLIF(OLD.agent_id,''), OLD.metadata#>>'{agentSnapshot,id}'))
            IS DISTINCT FROM
            (NEW.metadata->>'owner_id', COALESCE(NULLIF(NEW.agent_id,''), NEW.metadata#>>'{agentSnapshot,id}'))
        """, "OLD.metadata->>'owner_id', NEW.metadata->>'owner_id'"),
        ('AdventureParty', 'odoc_stats_completed_party_fingerprint', 'head, digest, frame, frame_version', """
            OLD.status = 'completed' AND (OLD.head, OLD.digest, OLD.frame, OLD.frame_version)
            IS DISTINCT FROM (NEW.head, NEW.digest, NEW.frame, NEW.frame_version)
        """, 'OLD.owner_id, NEW.owner_id'),
    ):
        editor.execute(f"""
            CREATE FUNCTION {function}() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                UPDATE {table('ResidentAnalyticsWork')}
                   SET dirty=TRUE, generation=txid_current(), scope_generation=txid_current(),
                       verified_digest='', error=''
                 WHERE owner_id IN ({owners}) AND scope_generation <> txid_current();
                RETURN NULL;
            END $$""")
        editor.execute(f"""CREATE TRIGGER {function} AFTER UPDATE OF {columns} ON {table(model)}
                           FOR EACH ROW WHEN ({changed}) EXECUTE FUNCTION {function}()""")

    # Existing rows may have missed a source update before this migration.
    editor.execute(f"""UPDATE {table('ResidentAnalyticsWork')}
                          SET dirty=TRUE, verified_digest='', error='', "after"=CURRENT_TIMESTAMP,
                              generation=txid_current(), scope_generation=txid_current()""")


def uninstall(apps, editor):
    if editor.connection.vendor == 'postgresql':
        for model, function in (('AgentActivity', 'odoc_stats_activity_identity'),
                                ('AdventureParty', 'odoc_stats_completed_party_fingerprint')):
            table = editor.quote_name(apps.get_model('system_settings', model)._meta.db_table)
            editor.execute(f'DROP TRIGGER {function} ON {table}')
            editor.execute(f'DROP FUNCTION {function}()')


class Migration(migrations.Migration):
    dependencies = [('system_settings', '0112_combat_party_unarchived_index')]
    operations = [migrations.RunPython(install, uninstall)]
