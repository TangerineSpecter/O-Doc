from django.contrib import admin
from .models import Tag

# 注册Tag模型
@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ('tag_id', 'name', 'userid', 'is_valid', 'sort', 'created_at', 'updated_at')
    search_fields = ('name',)
    list_filter = ('is_valid', 'created_at')
    ordering = ('sort', '-created_at')
    list_per_page = 10
