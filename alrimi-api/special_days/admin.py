from django.contrib import admin

from .models import MarkStyle, SpecialDay


@admin.register(SpecialDay)
class SpecialDayAdmin(admin.ModelAdmin):
    """
    손으로 급히 한 건 고칠 때를 위한 자리. 평소에 넣고 빼는 것은 n8n 이 부르는
    `POST /special-days/sync` 다 — 여기서 고쳐두어도 다음 동기화가 그 기간의 그
    종류를 통째로 다시 맞추므로, 특일 API 에 없는 날은 도로 지워진다.
    """

    list_display = ["date", "kind", "name", "updated_at"]
    list_filter = ["kind", "date"]
    search_fields = ["name"]
    ordering = ["-date"]


@admin.register(MarkStyle)
class MarkStyleAdmin(admin.ModelAdmin):
    """사람마다의 색 설정. 줄이 없으면 기본값이라, 여기가 비어 있는 것이 정상이다."""

    list_display = ["user", "kind", "color", "updated_at"]
    list_filter = ["kind"]
