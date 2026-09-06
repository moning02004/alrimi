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
