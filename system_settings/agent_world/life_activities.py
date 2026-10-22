"""Activity ownership and versioned schedule origin; legacy items remain executable."""
MAIN_ACTIVITIES = ('travel', 'farm', 'investment', 'post_publish', 'post_interaction', 'lottery')
INTERLEAVED_ACTIVITIES = ('cooking', 'alchemy', 'blacksmith', 'fishing', 'exploration')
INTERLEAVING_VERSION = 1


def is_interleaved(item):
    return isinstance(item.context, dict) and item.context.get('interleaving', {}).get('version') == INTERLEAVING_VERSION


def source(item):
    return 'interleaved' if is_interleaved(item) else 'manual' if item.context.get('manual') else 'schedule'


def main_items(query):
    # JSON missing keys must not be treated as SQL NULL exclusions.
    from django.db.models import Q
    return query.filter(Q(context__interleaving__isnull=True) | ~Q(context__interleaving__version=1))
