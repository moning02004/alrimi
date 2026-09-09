"""웹을 붙여보기 위한 로컬 시드 데이터."""

import datetime as dt

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from notices.models import Event, Priority

from zones.models import Zone

User = get_user_model()

# 공간마다 색이 다르게 배정되는 걸 화면에서 확인할 수 있도록 두 개 이상 만든다.
#
# 며칠에 걸치는 것도 섞어둔다 — 달력이 그런 일정을 칸을 가로지르는 띠로 그리는데,
# 하루짜리만 있으면 그 자리가 비어 있어 만들어놓고도 못 본다. 주를 넘기는 것과
# 다른 일정과 겹치는 것을 하나씩 둬야 이어짐과 층 쌓기가 둘 다 눈에 든다.
#
# (시작일 오프셋, 걸치는 날 수, 제목, 내용, 중요도, 알림 코드)
SAMPLES = {
    "우리집": [
        (0, 1, "체육복 챙기기", "흰 티셔츠, 모자", Priority.NORMAL, ["D 07:00"]),
        (2, 1, "가을 운동회", "돗자리, 도시락", Priority.URGENT, ["D-1 20:00", "D 07:00"]),
        (4, 5, "제주 여행", "우비, 멀미약", Priority.NORMAL, ["D-3 20:00", "D-1 20:00"]),
        (20, 1, "현장학습비 납부", "12,000원", Priority.URGENT, ["D-3 20:00", "D-1 20:00"]),
        (-4, 1, "독감 예방접종", "보건실", Priority.NORMAL, ["D 07:00"]),
    ],
    "어린이집": [
        (0, 1, "낮잠 이불 세탁", "금요일마다", Priority.LOW, ["D 07:00"]),
        (3, 1, "학부모 상담", "3층 상담실", Priority.NORMAL, ["D-1 20:00"]),
        (6, 3, "가을 캠프", "침낭, 손전등", Priority.NORMAL, ["D-1 20:00"]),
        (60, 1, "겨울방학식", "", Priority.LOW, ["D-1 20:00"]),
    ],
}


class Command(BaseCommand):
    help = "로컬 개발용 계정·공간·일정을 만든다"

    def add_arguments(self, parser):
        parser.add_argument("--username", default="demo")
        parser.add_argument("--password", default="demo-pw-1234")

    def handle(self, *args, **options):
        from django.conf import settings

        if not settings.DEBUG:
            raise CommandError("DEBUG=False 인 환경에서는 실행하지 않습니다.")

        user, created = User.objects.get_or_create(
            username=options["username"], defaults={"name": "데모"}
        )
        user.set_password(options["password"])
        user.save()

        today = timezone.localdate()
        for zone_name, samples in SAMPLES.items():
            zone, _ = Zone.objects.get_or_create(owner=user, name=zone_name)

            for offset, span, title, content, priority, codes in samples:
                start = today + dt.timedelta(days=offset)
                event, made = Event.objects.get_or_create(
                    zone=zone,
                    title=title,
                    defaults={
                        "event_date": start,
                        "end_date": start + dt.timedelta(days=span - 1),
                        "content": content,
                        "priority": priority,
                    },
                )
                if made:
                    event.sync_alerts(codes)

            # 지난 일정의 알림은 이미 나간 것으로 둔다 (발송 점을 확인하려고)
            for event in zone.events.filter(end_date__lt=today):
                for alert in event.alerts.all():
                    alert.mark_sent()

            self.stdout.write(f"  {zone.name}  {zone.color}")

        self.stdout.write(
            self.style.SUCCESS(
                f"{'만들었습니다' if created else '갱신했습니다'}: "
                f"{user.username} / {options['password']}"
            )
        )
