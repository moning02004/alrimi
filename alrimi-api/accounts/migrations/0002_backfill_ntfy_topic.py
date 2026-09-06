"""
필드가 생기기 전에 만들어진 계정에 토픽을 채운다.

`User.save()` 가 채우지만 기존 행은 다시 저장되기 전까지 비어 있다.
토픽이 없으면 구독할 수단 자체가 없어서 알림을 못 받는다.

토픽은 곧 비밀번호라 추측 가능하면 안 된다 — 모델과 같은 방식으로 만든다.
마이그레이션은 스스로 완결되어야 하므로 생성 규칙을 여기에 다시 적는다.
"""

import secrets

from django.db import migrations


def fill(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    for user in User.objects.filter(ntfy_topic__isnull=True) | User.objects.filter(ntfy_topic=""):
        user.ntfy_topic = f"alrimi-{secrets.token_hex(8)}"
        user.save(update_fields=["ntfy_topic"])


class Migration(migrations.Migration):
    dependencies = [("accounts", "0001_initial")]
    operations = [migrations.RunPython(fill, migrations.RunPython.noop)]
