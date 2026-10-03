import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """앞 마이그레이션이 채운 칸을 필수로. 같은 트랜잭션에서 데이터를 고친 뒤 ALTER 하면
    PostgreSQL 이 "pending trigger events" 로 거절해서 따로 둔다."""

    dependencies = [
        ("notices", "0016_series_rule_and_template"),
    ]

    operations = [
        migrations.AlterField(
            model_name="eventseries",
            name="start",
            field=models.DateField(help_text="첫날. 매월·매년은 이 날의 일(음력이면 음력 월·일)을 되풀이한다."),
        ),
        migrations.AlterField(
            model_name="eventseries",
            name="filled_until",
            field=models.DateField(help_text="여기까지는 실제 일정으로 만들었다. 이 뒤만 규칙으로 펼친다."),
        ),
        migrations.AlterField(
            model_name="eventseries",
            name="zone",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="series", to="zones.zone"),
        ),
        migrations.AlterField(model_name="eventseries", name="title", field=models.CharField(max_length=80)),
        migrations.AddConstraint(
            model_name="event",
            constraint=models.UniqueConstraint(
                condition=models.Q(("series__isnull", False), ("series_date__isnull", False)),
                fields=("series", "series_date"),
                name="uniq_event_per_series_date",
            ),
        ),
    ]
