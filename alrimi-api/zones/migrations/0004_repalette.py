"""
구분이 잘 되는 팔레트로 갈아탄다.

옛 팔레트 값만 옮긴다. 사용자가 직접 고른 색은 건드리지 않는다
(색 변경 기능이 생기기 전이라 지금은 전부 자동 배정 값이지만,
 이 마이그레이션이 나중에 다시 돌더라도 안전하도록).
"""

from django.db import migrations

from zones.palette import LEGACY_PALETTE, next_color


def repalette(apps, schema_editor):
    Zone = apps.get_model("zones", "Zone")
    by_owner: dict[int, list[str]] = {}

    for zone in Zone.objects.filter(color__in=LEGACY_PALETTE).order_by("owner_id", "id"):
        used = by_owner.setdefault(zone.owner_id, [])
        zone.color = next_color(used)
        used.append(zone.color)
        zone.save(update_fields=["color"])


class Migration(migrations.Migration):
    dependencies = [("zones", "0003_backfill_color")]
    operations = [migrations.RunPython(repalette, migrations.RunPython.noop)]
