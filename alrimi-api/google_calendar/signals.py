from django.db.models.signals import post_save, pre_delete, pre_save
from django.dispatch import receiver

from notices.models import Event
from zones.models import Zone

from . import sync


@receiver(post_save, sender=Event)
def event_saved(sender, instance, raw=False, **kwargs):
    # raw 는 loaddata 다. 픽스처를 넣을 때 구글까지 가지 않는다.
    if raw:
        return
    owner_id = instance.zone.owner_id
    if sync.linked(owner_id):
        sync.schedule(sync.push_event, owner_id, instance.pk)


@receiver(pre_delete, sender=Event)
def event_deleting(sender, instance, **kwargs):
    """
    지운 **뒤**(post_delete)가 아니라 앞에서 잡는다. 공간을 지워 딸려 지워질 때는
    그때쯤 공간이 이미 없어 누구 일정이었는지를 물을 곳이 없다.
    """
    owner_id = instance.zone.owner_id
    if sync.linked(owner_id):
        sync.schedule(sync.push_event, owner_id, instance.pk)


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
        sync.schedule(sync.push_zone, instance.owner_id, instance.pk)
