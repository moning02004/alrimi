from django.contrib import admin

from .models import GoogleCalendarLink


@admin.register(GoogleCalendarLink)
class GoogleCalendarLinkAdmin(admin.ModelAdmin):
    """
    "캘린더에 안 들어와요" 를 확인하는 자리. 토큰은 열쇠라 화면에 싣지 않는다.
    """

    list_display = ("user", "email", "broken_at", "last_synced_at", "last_error")
    search_fields = ("user__username", "user__name", "email")
    fields = ("user", "email", "calendar_id", "broken_at", "last_synced_at", "last_error", "created_at")
    readonly_fields = fields

    def has_add_permission(self, request):
        # 연결은 사람이 구글 동의 화면을 거쳐야 생긴다
        return False
