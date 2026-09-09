from django.contrib import admin

from .models import Event, EventAlert


class EventAlertInline(admin.TabularInline):
    model = EventAlert
    extra = 0
    fields = ("code", "due_at", "status", "sent_at")


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    # 시작일만으로는 여행이 하루짜리처럼 보인다. 마지막 날을 같이 세운다.
    list_display = ("id", "event_date", "end_date", "title", "zone", "priority", "completed_at")
    list_filter = ("zone", "priority", "completed_at")
    search_fields = ("title", "content")
    date_hierarchy = "event_date"
    inlines = [EventAlertInline]


@admin.register(EventAlert)
class EventAlertAdmin(admin.ModelAdmin):
    list_display = ("id", "event", "code", "due_at", "status", "sent_at")
    list_filter = ("status",)
