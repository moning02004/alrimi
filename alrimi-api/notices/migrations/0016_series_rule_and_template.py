import datetime as dt

import django.db.models.deletion
from django.db import migrations, models


def backfill(apps, schema_editor):
    """
    예전 반복은 끝나는 날까지 일정을 전부 만들어 두었다. 그 규칙들은 **마지막으로 남은
    일정에서 닫는다** — "이후 모두 지우기" 가 일정만 지우고 규칙의 끝은 그대로 두었으므로,
    규칙의 끝을 믿고 펼치면 지운 날이 되살아난다. 남은 일정이 없는 규칙은 지운다.

    일정에는 규칙이 낸 날(`series_date`)을 적는다. 따로 옮긴 날은 알 길이 없어 지금 날짜를
    쓰고, 그래서 같은 날이 둘이면 뒤엣것은 비워 둔다(같은 날 둘은 제약이 막는다).
    """
    EventSeries = apps.get_model("notices", "EventSeries")
    Event = apps.get_model("notices", "Event")

    for series in EventSeries.objects.all():
        events = list(Event.objects.filter(series=series).order_by("event_date", "id"))
        if not events:
            series.delete()
            continue
        latest = max(events, key=lambda event: (event.updated_at, event.id))
        series.start = events[0].event_date
        last = events[-1].event_date
        series.until = min(series.until, last) if series.until else last
        series.filled_until = last
        series.zone_id = latest.zone_id
        series.title = latest.title
        series.content = latest.content
        series.event_hour = latest.event_hour
        series.span_days = (latest.end_date - latest.event_date).days + 1
        series.alert_codes = sorted(set(latest.alerts.values_list("code", flat=True)))
        series.save()

        seen = set()
        for event in events:
            if event.event_date in seen:
                continue
            seen.add(event.event_date)
            event.series_date = event.event_date
            event.save(update_fields=["series_date"])


class Migration(migrations.Migration):

    dependencies = [
        ("notices", "0015_event_series_lunar"),
        ("zones", "__latest__"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="series_date",
            field=models.DateField(
                blank=True,
                null=True,
                help_text="반복의 몇 번째 날인가 — 규칙이 이 일정을 낸 날. 날짜를 옮기거나 보류해도 그대로다. 규칙으로 펼칠 때 이 날이 이미 일정으로 있으면 다시 내지 않는다.",
            ),
        ),
        migrations.AlterField(
            model_name="eventseries",
            name="until",
            field=models.DateField(blank=True, null=True, help_text="마지막으로 반복할 수 있는 날 (포함). 비우면 끝이 없다."),
        ),
        migrations.AddField(model_name="eventseries", name="start", field=models.DateField(null=True)),
        migrations.AddField(model_name="eventseries", name="filled_until", field=models.DateField(null=True)),
        migrations.AddField(
            model_name="eventseries",
            name="zone",
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name="series", to="zones.zone"),
        ),
        migrations.AddField(model_name="eventseries", name="title", field=models.CharField(default="", max_length=80)),
        migrations.AddField(model_name="eventseries", name="content", field=models.CharField(blank=True, default="", max_length=200)),
        migrations.AddField(model_name="eventseries", name="event_hour", field=models.PositiveSmallIntegerField(blank=True, null=True)),
        migrations.AddField(
            model_name="eventseries",
            name="span_days",
            field=models.PositiveSmallIntegerField(default=1, help_text="며칠짜리인가. 하루짜리는 1."),
        ),
        migrations.AddField(
            model_name="eventseries",
            name="alert_codes",
            field=models.JSONField(blank=True, default=list, help_text='알림 시점 코드들. ["D-1 20:00"]'),
        ),
        migrations.AddField(
            model_name="eventseries",
            name="skipped",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text="지운 날들(YYYY-MM-DD). 규칙으로 펼칠 때 건너뛴다 — 안 그러면 '이 일정만 지우기' 한 먼 날이 다음 조회에 되살아난다.",
            ),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
