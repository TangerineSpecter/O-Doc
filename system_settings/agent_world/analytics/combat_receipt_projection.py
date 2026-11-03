"""Select only the parts of a shared combat receipt needed by analytics."""

from django.db.models import Func, JSONField


class CombatReceiptProjection(Func):
    """Keep event order, identity and monster data without returning rewards.

    The non-object branch deliberately preserves malformed historical events:
    analytics must not silently turn an invalid event into a valid one.
    This expression is used only on PostgreSQL after the kill-receipt filter.
    """

    output_field = JSONField()

    def as_postgresql(self, compiler, connection, **extra_context):
        source, params = compiler.compile(self.source_expressions[0])
        sql = f"""
            jsonb_build_object(
                'shared_event_id', {source}->'shared_event_id',
                'events', (
                    SELECT COALESCE(jsonb_agg(
                        CASE WHEN jsonb_typeof(event.value) = 'object'
                            THEN jsonb_build_object(
                                'kind', event.value->'kind',
                                'monster', event.value->'monster'
                            )
                            ELSE event.value
                        END ORDER BY event.ordinality
                    ), '[]'::jsonb)
                    FROM jsonb_array_elements(
                        CASE WHEN jsonb_typeof({source}->'events') = 'array'
                            THEN {source}->'events' ELSE '[]'::jsonb END
                    ) WITH ORDINALITY AS event(value, ordinality)
                )
            )
        """
        return sql, tuple(params) * 3
