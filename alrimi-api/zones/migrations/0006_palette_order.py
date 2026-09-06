"""
팔레트 순서를 다시 잡는다 — 앞쪽일수록 서로 멀도록.

공간 두 개만 쓰면 초록과 연두가 배정돼 3px 막대에서 닮아 보였다.
새 순서에서는 초록과 남색이라 ΔE00 이 48.6 이다.

마이그레이션은 스스로 완결되어야 하므로 색 목록을 여기에 박아둔다
(`zones/palette.py` 가 나중에 또 바뀌어도 이 마이그레이션의 뜻은 안 변한다).
"""

from django.db import migrations

# 0005 시점의 팔레트 = 지금까지 자동 배정된 값들
PREVIOUS = ["#007E3F", "#5AA202", "#313BB5", "#5C65BD", "#7786FF", "#90164D", "#BC487D", "#EB6575"]
# 새 순서
ORDERED = ["#007E3F", "#313BB5", "#7786FF", "#BC487D", "#5AA202", "#90164D", "#EB6575", "#5C65BD"]


def reorder(apps, schema_editor):
    Zone = apps.get_model("zones", "Zone")
    by_owner: dict[int, int] = {}

    for zone in Zone.objects.filter(color__in=PREVIOUS).order_by("owner_id", "id"):
        index = by_owner.get(zone.owner_id, 0)
        zone.color = ORDERED[index % len(ORDERED)]
        by_owner[zone.owner_id] = index + 1
        zone.save(update_fields=["color"])


class Migration(migrations.Migration):
    dependencies = [("zones", "0005_cvd_palette")]
    operations = [migrations.RunPython(reorder, migrations.RunPython.noop)]
