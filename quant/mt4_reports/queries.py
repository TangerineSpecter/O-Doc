"""Small report projections without transferring event histories to Python."""
from django.db.models import F, Func, JSONField


class WithoutEvents(Func):
    output_field = JSONField()
    arity = 1

    def as_sqlite(self, compiler, connection, **extra_context):
        expression, params = compiler.compile(self.source_expressions[0])
        return f'JSON_REMOVE({expression}, %s)', (*params, '$.events')

    def as_postgresql(self, compiler, connection, **extra_context):
        expression, params = compiler.compile(self.source_expressions[0])
        return f'({expression} - CAST(%s AS text))', (*params, 'events')


def with_summary(query):
    return query.defer('data').annotate(_summary_data=WithoutEvents(F('data')))
