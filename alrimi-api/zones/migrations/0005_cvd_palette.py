"""
색약에서도 구분되는 팔레트로 갈아탄다.

이전 팔레트는 제2색맹에서 빨강과 올리브가 ΔE00 2.0 — 사실상 같은 색이었다.
자동 배정 값만 옮기고 사용자가 고른 색은 두다.
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
    dependencies = [("zones", "0004_repalette")]
    operations = [migrations.RunPython(repalette, migrations.RunPython.noop)]
