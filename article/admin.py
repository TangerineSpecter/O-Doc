from django.contrib import admin
from article.models import Image

@admin.register(Image)
class ImageAdmin(admin.ModelAdmin):
    list_display = ['image_id', 'title', 'coll_id', 'country', 'city', 'place_name', 'focal_length', 'latitude', 'longitude', 'author', 'created_at']
    search_fields = ['title', 'description', 'country', 'city', 'place_name', 'focal_length']
    list_filter = ['created_at', 'is_valid']
    readonly_fields = ['image_id', 'created_at', 'updated_at']
