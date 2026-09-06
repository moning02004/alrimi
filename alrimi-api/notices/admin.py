from django.contrib import admin

from .models import Alert, Notice


class AlertInline(admin.TabularInline):
    model = Alert
    extra = 0
    fields = ("code", "due_at", "status", "sent_at")


@admin.register(Notice)
class NoticeAdmin(admin.ModelAdmin):
    list_display = ("id", "event_date", "title", "zone", "priority", "completed_at")
    list_filter = ("zone", "priority", "completed_at")
    search_fields = ("title", "content")
    date_hierarchy = "event_date"
    inlines = [AlertInline]


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display = ("id", "notice", "code", "due_at", "status", "sent_at")
    list_filter = ("status",)
