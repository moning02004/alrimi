"""기존 공간에 팔레트 색을 채워 넣는다. 색 없는 공간이 하나도 없게."""

from django.db import migrations

from zones.palette import next_color


def fill(apps, schema_editor):
    Zone = apps.get_model("zones", "Zone")
    by_owner: dict[int, list[str]] = {}

    for zone in Zone.objects.filter(color="").order_by("owner_id", "id"):
        used = by_owner.setdefault(zone.owner_id, [])
        zone.color = next_color(used)
        used.append(zone.color)
        zone.save(update_fields=["color"])


class Migration(migrations.Migration):
    dependencies = [("zones", "0002_zone_color")]
    operations = [migrations.RunPython(fill, migrations.RunPython.noop)]
