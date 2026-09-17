from django.conf import settings
from django.db import models

from .palette import next_color


class Zone(models.Model):
    """알림을 묶는 단위. 가족·학급처럼 같은 일정을 공유하는 사람들의 공간."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="zones",
    )
    name = models.CharField(max_length=40)
    color = models.CharField(
        max_length=7,
        blank=True,
        help_text="칩·카드 막대에 쓰는 색. 비워두면 팔레트에서 자동 배정된다.",
    )
    shared = models.BooleanField(
        default=False,
        help_text=(
            "함께 보기. 켜면 주인이 정해둔 '함께 보는 사람'(`Sharing`) 모두가 이 공간의 일정을 "
            "보고 알림을 받는다. 사람은 주인마다 한 번 정하고, 공간은 켜고 끄기만 한다."
        ),
    )
    viewers_can_edit = models.BooleanField(
        default=False,
        help_text=(
            "함께 보는 사람도 이 공간의 일정을 추가·수정·완료·삭제할 수 있다. 함께 보기가 켜져 있을 "
            "때만 뜻이 있다. 공간 이름·색·함께 보기 설정은 여전히 주인만 바꾼다."
        ),
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["owner", "name"], name="uniq_zone_name_per_owner"),
        ]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        # 비워두고 만들면 팔레트에서 안 겹치는 색을 고른다.
        # 직접 넣은 색은 그대로 둔다 (admin에서 바꿀 수 있게).
        if not self.color:
            used = list(
                Zone.objects.filter(owner=self.owner)
                .exclude(pk=self.pk)
                .values_list("color", flat=True)
            )
            self.color = next_color(used)
        super().save(*args, **kwargs)


class Sharing(models.Model):
    """
    주인이 자기 공간을 보여주는 사람 한 명. **사람마다 한 번** 정한다.

    어느 공간을 보여줄지는 공간의 `shared` 가 정한다 — 사람과 공간을 한 칸씩 짝지으면
    공간을 새로 만들 때마다 가족을 다시 고르게 된다. 가족은 잘 바뀌지 않고, 바뀌는 것은
    "이 공간을 같이 볼까" 쪽이다.

    **보기와 알림만이다.** 보는 사람은 일정을 목록·달력에서 보고 알림을 함께 받지만, 일정을
    만들거나 고치거나 지우지 못한다. 공간 이름·색·함께 보기도 주인만 바꾼다.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="viewers"
    )
    viewer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sharers"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["owner", "viewer"], name="uniq_sharing"),
            models.CheckConstraint(
                condition=~models.Q(owner=models.F("viewer")), name="sharing_not_self"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.owner} → {self.viewer}"


def visible_zones(user):
    """
    이 사람이 볼 수 있는 공간 — 자기 것과, 자기를 함께 보는 사람으로 둔 주인의 공유 공간.

    조인 대신 id 목록으로 거른다. 조인하면 줄이 불어나서, 뒤에 붙는 개수 세기
    (`with_counts`)가 그만큼 곱해진다.
    """
    sharers = Sharing.objects.filter(viewer=user).values("owner_id")
    return Zone.objects.filter(models.Q(owner=user) | models.Q(shared=True, owner_id__in=sharers))


def editable_zones(user):
    """
    이 사람이 **일정을** 넣고 고칠 수 있는 공간 — 자기 것과, 받은 공간 중 주인이 "함께 보는
    사람도 일정 추가·수정" 을 켜둔 것. 아빠가 만든 아이 공간에 엄마도 일정을 넣는 자리다.

    공간 자체(이름·색·함께 보기)는 여기에 들어도 주인만 바꾼다(`IsZoneOwnerOrReadOnly`).
    """
    sharers = Sharing.objects.filter(viewer=user).values("owner_id")
    return Zone.objects.filter(
        models.Q(owner=user)
        | models.Q(shared=True, viewers_can_edit=True, owner_id__in=sharers)
    )


def recipients(zone) -> list:
    """
    이 공간의 알림을 받을 사람들. 주인이 맨 앞이고, 함께 보기를 켠 공간이면 주인이 정해둔
    사람들이 뒤따른다.

    `owner__viewers__viewer` 를 미리 불러왔으면(prefetch) 그것을 쓴다 — 크론이 예약 수십 개를
    훑을 때 공간마다 쿼리를 다시 내지 않도록.
    """
    if not zone.shared:
        return [zone.owner]
    return [zone.owner, *(sharing.viewer for sharing in zone.owner.viewers.all())]
