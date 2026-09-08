"""
"보통" 을 3 에서 4 로 옮긴다.

우선순위 값은 ntfy 의 1~5 를 그대로 쓴다. 3 으로 저장된 일정은 새 선택지
(2·4·5)에 없는 값이라, 그대로 두면 수정 폼이 그 값을 못 찾고 저장도 400 으로
막힌다. 그래서 칸의 선택지만 바꾸지 않고 이미 저장된 값도 함께 옮긴다.
"""

from django.db import migrations, models


def normal_becomes_4(apps, schema_editor):
    Notice = apps.get_model("notices", "Notice")
    Notice.objects.filter(priority=3).update(priority=4)


def normal_becomes_3(apps, schema_editor):
    """
    되돌리기. 옛 표에서 4 는 아무 뜻도 없는 값이라 전부 "보통"(3)으로 돌린다
    — 새 표에서 4 는 "일반" 하나뿐이므로 잃는 것이 없다.
    """
    Notice = apps.get_model("notices", "Notice")
    Notice.objects.filter(priority=4).update(priority=3)


class Migration(migrations.Migration):
    dependencies = [("notices", "0007_notice_end_date")]

    operations = [
        migrations.RunPython(normal_becomes_4, normal_becomes_3),
        migrations.AlterField(
            model_name="notice",
            name="priority",
            field=models.IntegerField(choices=[(2, "조용히"), (4, "일반"), (5, "긴급")], default=4),
        ),
    ]
