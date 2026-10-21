from django.db.models.signals import post_delete, post_save, pre_delete, pre_save
from django.dispatch import receiver

from notices.models import Event
from zones.models import Zone

from . import sync
from .models import GoogleCalendarLink


@receiver(post_save, sender=Event)
def event_saved(sender, instance, raw=False, **kwargs):
    # raw 는 loaddata 다. 픽스처를 넣을 때 구글까지 가지 않는다.
    if raw:
        return
    schedule_event(instance)


@receiver(pre_delete, sender=Event)
def event_deleting(sender, instance, **kwargs):
    """
    지운 **뒤**(post_delete)가 아니라 앞에서 잡는다. 공간을 지워 딸려 지워질 때는
    그때쯤 공간이 이미 없어 누구 일정이었는지를 물을 곳이 없다.
    """
    schedule_event(instance)


def schedule_event(event) -> None:
    """
    이 일정을 구글로 보낼 줄에 넣는다. 신호 말고도 `bulk_create` 처럼 신호가 안 울리는
    자리(`notices.series`)가 직접 부른다.
    """
    owner_id = sync.linked_owner(event.zone_id)
    if owner_id is not None:
        sync.schedule(sync.SyncJob.Kind.EVENT, owner_id, event.pk)


@receiver(pre_save, sender=Zone)
def zone_saving(sender, instance, **kwargs):
    instance._previous_name = (
        Zone.objects.filter(pk=instance.pk).values_list("name", flat=True).first()
        if instance.pk
        else None
    )


@receiver(post_save, sender=Zone)
def zone_saved(sender, instance, created=False, raw=False, **kwargs):
    # 색만 바꾼 것은 구글에 보낼 것이 없다. 이름이 제목에 붙으므로 이름만 본다.
    if created or raw or getattr(instance, "_previous_name", None) == instance.name:
        return
    if sync.linked(instance.owner_id):
        sync.schedule(sync.SyncJob.Kind.ZONE, instance.owner_id, instance.pk)


@receiver(post_save, sender=GoogleCalendarLink)
@receiver(post_delete, sender=GoogleCalendarLink)
def link_changed(sender, **kwargs):
    # 같은 요청 안에서 이어 두고 일정을 고칠 수 있다. 담아둔 연결 목록을 다시 읽게 한다
    sync.forget()
