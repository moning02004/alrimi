"""
Notice → Event, Alert → EventAlert.

처음에는 하루짜리 알림만 있어서 "알려야 할 것 하나" 라는 뜻으로 Notice 라 불렀다.
지금은 며칠에 걸치는 일정이 한 건으로 담기므로, 이름도 그것이 **사건 하나**임을
말해야 한다. 날마다 하나씩 생기는 것이 아니라는 뜻이 이름에 들어가야 한다.

테이블 이름만 바뀐다(notices_notice → notices_event). 앱 라벨(notices)은 그대로다
— 라벨은 마이그레이션 이력과 테이블 접두사에 박혀 있어서, 바꾸려면 이 파일이 아니라
별도의 이행이 필요하다.

**제약을 먼저 떼고 이름을 바꾼다.** 제약은 칸 이름을 물고 있는데, sqlite 는 칸
이름을 바꿀 때 테이블을 통째로 다시 만든다 — 그때 아직 붙어 있는 옛 제약이
사라진 `notice` 칸을 찾다가 멈춘다.
"""

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("notices", "0008_priority_normal_becomes_4")]

    operations = [
        migrations.RemoveConstraint(model_name="alert", name="uniq_alert_code_per_notice"),
        migrations.RemoveConstraint(model_name="notice", name="notice_end_not_before_start"),
        migrations.RenameModel(old_name="Notice", new_name="Event"),
        migrations.RenameModel(old_name="Alert", new_name="EventAlert"),
        # 딸린 예약이 가리키는 칸도 같은 이름으로
        migrations.RenameField(model_name="eventalert", old_name="notice", new_name="event"),
        # 공간에서 거슬러 올라가는 이름도 zone.notices → zone.events
        migrations.AlterField(
            model_name="event",
            name="zone",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="events",
                to="zones.zone",
            ),
        ),
        migrations.AlterField(
            model_name="eventalert",
            name="event",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="alerts",
                to="notices.event",
            ),
        ),
        migrations.AddConstraint(
            model_name="eventalert",
            constraint=models.UniqueConstraint(
                fields=("event", "code"), name="uniq_alert_code_per_event"
            ),
        ),
        migrations.AddConstraint(
            model_name="event",
            constraint=models.CheckConstraint(
                condition=models.Q(end_date__gte=models.F("event_date")),
                name="event_end_not_before_start",
            ),
        ),
        # 이름을 적지 않은 인덱스는 Django 가 테이블 이름으로 지어둔다. 모델 이름을
        # 바꾸면 그 이름도 따라 바뀌어야 다음 makemigrations 가 조용하다.
        migrations.RenameIndex(
            model_name="event",
            old_name="notices_not_zone_id_6ab8c1_idx",
            new_name="notices_eve_zone_id_4359f9_idx",
        ),
        migrations.RenameIndex(
            model_name="event",
            old_name="notices_not_end_dat_bcfb6b_idx",
            new_name="notices_eve_end_dat_5d4754_idx",
        ),
        migrations.RenameIndex(
            model_name="eventalert",
            old_name="notices_ale_sent_at_1867fa_idx",
            new_name="notices_eve_sent_at_e82b9e_idx",
        ),
        # 도움말만 바뀐다(DB 는 그대로). 상태를 맞춰두지 않으면 마이그레이션이
        # 하나 밀린 채로 남는다.
        migrations.AlterField(
            model_name="event",
            name="completed_at",
            field=models.DateTimeField(
                blank=True,
                help_text="완료 표시한 시각. 완료하면 목록·달력에서 빠지고 남은 알림도 나가지 않는다.",
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name="eventalert",
            name="code",
            field=models.CharField(
                help_text=(
                    '알림 시점 코드. "D-1 20:00"(하루 전) · "D 07:00"(당일) · '
                    '"D+3 20:00"(사흘 뒤) 처럼 일 오프셋과 정각 시각으로 적는다.'
                ),
                max_length=16,
            ),
        ),
    ]
