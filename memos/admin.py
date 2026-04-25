from django.contrib import admin

from .models import Memo


@admin.register(Memo)
class MemoAdmin(admin.ModelAdmin):
    list_display = ('memo_id', 'content', 'tag', 'is_pinned', 'created_at')
    list_filter = ('is_pinned', 'is_valid')
    search_fields = ('content', 'tag')
