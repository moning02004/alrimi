"""
글자 대비가 4.5:1 에 못 미치던 세 색을 한 단계 어두운 색으로 옮긴다.

팔레트에서 옛 값을 빼면 그 색을 골라둔 줄이 "고를 수 없는 색" 으로 남으므로 함께 옮긴다.
"""

from django.db import migrations

RENAMED = {
    "#EA580C": "#C2410C",  # 주황
    "#16A34A": "#15803D",  # 초록
    "#0D9488": "#0F766E",  # 청록
}


def forward(apps, schema_editor):
    MarkStyle = apps.get_model("special_days", "MarkStyle")
    for old, new in RENAMED.items():
        MarkStyle.objects.filter(color=old).update(color=new)


def backward(apps, schema_editor):
    MarkStyle = apps.get_model("special_days", "MarkStyle")
    for old, new in RENAMED.items():
        MarkStyle.objects.filter(color=new).update(color=old)


class Migration(migrations.Migration):
    dependencies = [
        ("special_days", "0002_remove_markstyle_shown_alter_markstyle_kind_and_more"),
    ]

    operations = [migrations.RunPython(forward, backward)]
