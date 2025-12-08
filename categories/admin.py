from django.contrib import admin
from .models import Category

# 注册Category模型
@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('category_id', 'name', 'description', 'userid', 'is_valid', 'sort', 'created_at', 'updated_at')
    search_fields = ('name', 'description')
    list_filter = ('is_valid', 'created_at')
    ordering = ('sort', '-created_at')
    list_per_page = 10
