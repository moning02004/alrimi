"""
새 일정 알림이 실제로 누구에게, 어느 길로 가는지 서버에서 밟아보는 명령.

알림이 "안 온다" 는 말은 여러 가지다 — 공간이 함께 보기가 아니거나, 받는 사람이 꺼뒀거나,
기기 구독이 없거나, ntfy 가 거절했거나. 운영에는 이 길을 보여주는 화면이 없어서, 서버에서
한 번에 확인할 자리를 둔다.

    python manage.py notice_check --zone 3            # 누구에게 갈지만 본다
    python manage.py notice_check --zone 3 --send     # 실제로 한 통 보내본다
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from zones.models import Sharing, Zone, ZoneMute, recipients

from notices.models import Priority
from notices.ntfy import NtfyError, publish
from notices.webpush import configured as webpush_configured, send_to_user


class Command(BaseCommand):
    help = "새 일정 알림이 누구에게 어느 길로 가는지 확인한다"

    def add_arguments(self, parser):
        parser.add_argument("--zone", type=int, required=True, help="확인할 공간 id")
        parser.add_argument("--actor", help="일정을 넣는 사람의 아이디 (기본: 공간 주인)")
        parser.add_argument("--send", action="store_true", help="확인용 알림을 실제로 보낸다")

    def handle(self, *args, **options):
        zone = Zone.objects.filter(pk=options["zone"]).select_related("owner").first()
        if zone is None:
            raise CommandError(f"{options['zone']} 번 공간이 없습니다.")

        actor = zone.owner
        if options["actor"]:
            actor = get_user_model().objects.filter(username=options["actor"]).first()
            if actor is None:
                raise CommandError(f"{options['actor']} 사용자가 없습니다.")

        self.stdout.write(f"공간   {zone.name} (주인 {zone.owner.username})")
        self.stdout.write(f"함께 보기  {'켜짐' if zone.shared else '꺼짐 — 알림이 주인에게만 간다'}")

        viewers = list(Sharing.objects.filter(owner=zone.owner).select_related("viewer"))
        self.stdout.write(
            "함께 보는 사람  " + (", ".join(s.viewer.username for s in viewers) or "없음")
        )
        muted = list(ZoneMute.objects.filter(zone=zone).select_related("user"))
        self.stdout.write("알림 꺼둔 사람  " + (", ".join(m.user.username for m in muted) or "없음"))
        self.stdout.write(f"웹 푸시 키  {'있음' if webpush_configured() else '없음 — ntfy 로만 간다'}")

        people = recipients(zone, exclude=actor)
        self.stdout.write(
            f"\n{actor.username} 이(가) 일정을 넣으면 받을 사람: "
            + (", ".join(person.username for person in people) or "없음")
        )
        if not people:
            self.stdout.write(self.style.WARNING("→ 받을 사람이 없어 알림이 나가지 않는다."))
            return

        for person in people:
            devices = person.push_subscriptions.count()
            self.stdout.write(f"  - {person.username}: 기기 {devices}대 · 토픽 {person.ntfy_topic}")

        if not options["send"]:
            self.stdout.write("\n실제로 보내보려면 --send 를 붙인다.")
            return

        title = f"[{zone.name}] 알림 확인"
        message = f"{actor.name or actor.username}님이 보낸 확인용 알림이에요"
        for person in people:
            try:
                reached = send_to_user(
                    person, title=title, message=message, priority=Priority.NORMAL, tag="notice-check"
                )
                if reached:
                    self.stdout.write(self.style.SUCCESS(f"  {person.username}: 웹 푸시 {reached}대"))
                    continue
                publish(person.ntfy_topic, title=title, message=message, priority=Priority.NORMAL)
                self.stdout.write(self.style.SUCCESS(f"  {person.username}: ntfy 로 보냄"))
            except NtfyError as exc:
                self.stdout.write(self.style.ERROR(f"  {person.username}: ntfy 실패 — {exc}"))
            except Exception as exc:  # noqa: BLE001 — 까닭을 그대로 보여주는 자리다
                self.stdout.write(self.style.ERROR(f"  {person.username}: 실패 — {exc!r}"))
