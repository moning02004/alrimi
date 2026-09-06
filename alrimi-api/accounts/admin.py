from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.utils.html import format_html
from django.utils.safestring import mark_safe

from accounts.models import User

from .subscribe import qr_svg, subscribe_link, web_link


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ("username", "name", "ntfy_topic", "is_staff")
    search_fields = ("username", "name", "ntfy_topic")
    readonly_fields = ("ntfy_subscribe", "last_login", "date_joined")

    # AbstractUser 에서 first_name 을 떼고 name 을 넣었으므로 기본 fieldsets 를 쓸 수 없다
    fieldsets = (
        (None, {"fields": ("username", "password")}),
        ("개인 정보", {"fields": ("name", "email")}),
        ("알림", {"fields": ("ntfy_topic", "ntfy_subscribe")}),
        (
            "권한",
            {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
        ("기록", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("username", "password1", "password2")}),
    )

    @admin.display(description="구독")
    def ntfy_subscribe(self, obj):
        """
        QR 을 스캔하면 앱이 열리면서 구독까지 끝난다. 토픽을 손으로 옮겨 적을
        일이 없도록 두는 것이 목적이다 — 16진수라 타자로는 사실상 불가능하다.
        """
        if not obj.pk or not obj.ntfy_topic:
            return "저장하면 토픽과 QR이 만들어집니다."

        link = subscribe_link(obj.ntfy_topic)
        return format_html(
            '<div style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap">'
            '<div style="background:#fff;padding:8px;border:1px solid #ddd;border-radius:8px">{}</div>'
            '<div style="flex:1 1 260px;min-width:0">'
            '<p style="margin:0 0 6px"><a href="{}">앱에서 구독하기</a>'
            ' <span style="color:#666">— 이 화면을 폰에서 열었다면 눌러도 됩니다</span></p>'
            '<p style="margin:0 0 6px;color:#666">스캔하면 ntfy 앱이 열리면서 구독까지 끝납니다.'
            ' 안드로이드 기준이고, iOS 앱은 이 링크를 지원하지 않을 수 있습니다.</p>'
            '<p style="margin:0 0 4px"><code style="user-select:all">{}</code></p>'
            '<p style="margin:0;color:#666">웹에서 확인: <a href="{}" target="_blank" '
            'rel="noopener">{}</a></p>'
            "</div></div>",
            mark_safe(qr_svg(link)),  # noqa: S308 - 위에서 만든 SVG 라 외부 입력이 아니다
            link,
            obj.ntfy_topic,
            web_link(obj.ntfy_topic),
            web_link(obj.ntfy_topic),
        )
