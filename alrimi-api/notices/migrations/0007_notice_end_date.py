"""
여러 날에 걸치는 일정(여행·행사)을 위해 마지막 날을 더한다.

세 걸음으로 나눈 것은 이미 들어 있는 일정 때문이다. 비어 있을 수 없는 칸을
한 번에 세우면 기존 행이 채울 값을 못 찾는다. 비워둔 채로 만들고, 시작일을
복사해 넣고, 그 다음에 비어 있을 수 없게 잠근다.
"""

from django.db import migrations, models
from django.db.models import F


def fill_end_date(apps, schema_editor):
    """있던 일정은 모두 하루짜리다 — 마지막 날이 곧 시작일이다."""
    Notice = apps.get_model("notices", "Notice")
    Notice.objects.filter(end_date__isnull=True).update(end_date=F("event_date"))


class Migration(migrations.Migration):
    dependencies = [("notices", "0006_alter_notice_event_hour")]

    operations = [
        migrations.AddField(
            model_name="notice",
            name="end_date",
            field=models.DateField(null=True),
        ),
        migrations.RunPython(fill_end_date, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="notice",
            name="end_date",
            field=models.DateField(
                blank=True,
                help_text=(
                    "마지막 날. 하루짜리는 event_date 와 같은 값이 들어간다 — 비워두면 save() 가 채운다. "
                    "비워둘 수 있게(null) 두지 않는 것은 '이 날에 걸치는가'를 묻는 조회가 목록·달력·"
                    "필터·주간 정리까지 예닐곱 군데라, 매번 COALESCE 를 씌우면 언젠가 한 곳을 빠뜨리기 때문이다."
                ),
            ),
        ),
        migrations.AlterField(
            model_name="notice",
            name="event_date",
            field=models.DateField(help_text="시작하는 날. 알림 시점(D-1 …)도 이 날을 기준으로 잰다."),
        ),
        migrations.AddIndex(
            model_name="notice",
            index=models.Index(fields=["end_date"], name="notices_not_end_dat_bcfb6b_idx"),
        ),
        migrations.AddConstraint(
            model_name="notice",
            constraint=models.CheckConstraint(
                condition=models.Q(end_date__gte=F("event_date")),
                name="notice_end_not_before_start",
            ),
        ),
    ]
