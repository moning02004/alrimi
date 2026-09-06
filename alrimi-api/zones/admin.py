from django.contrib import admin

from .models import Zone


@admin.register(Zone)
class ZoneAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "color", "owner")
    list_filter = ("owner",)
    search_fields = ("name",)
    readonly_fields = ("created_at",)
