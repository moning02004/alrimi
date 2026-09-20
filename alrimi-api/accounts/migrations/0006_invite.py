"""
임시 비밀번호를 초대 링크로 바꾼다.

**아직 안 들어온 사람의 비밀번호를 막는 것이 이 마이그레이션의 핵심이다.** 지금까지
`must_change_password` 가 켜진 계정은 남이 아는 값(`0000` 또는 전해준 임시 비밀번호)으로
열려 있었고, 그것을 막아주던 것이 "먼저 바꿔라" 장치였다. 장치를 걷어내면서 값을 그대로 두면
그 계정들이 도리어 활짝 열린다. 그래서 쓸 수 없는 비밀번호로 덮는다 — 그 사람들은 최고
관리자가 새 초대 링크를 보내주면 들어온다(설정 › 사용자 관리).
"""

import accounts.models
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models
from django.utils.crypto import get_random_string


def block_unclaimed(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    for user in User.objects.filter(must_change_password=True):
        # `set_unusable_password()` 와 같은 모양이다. 어떤 입력으로도 이 해시에 닿지 못한다.
        user.password = "!" + get_random_string(40)
        user.save(update_fields=["password"])


class Migration(migrations.Migration):
    dependencies = [("accounts", "0005_login_throttle")]

    operations = [
        # 칸을 없애기 전에 읽어야 한다
        migrations.RunPython(block_unclaimed, migrations.RunPython.noop),
        migrations.RemoveField(model_name="user", name="must_change_password"),
        migrations.CreateModel(
            name="Invite",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("token", models.CharField(default=accounts.models.invite_token, max_length=64, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField()),
                (
                    "user",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="invite",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"indexes": [models.Index(fields=["expires_at"], name="accounts_in_expires_a0e2d6_idx")]},
        ),
    ]
