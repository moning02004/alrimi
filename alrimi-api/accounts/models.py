import secrets

from django.contrib.auth.models import AbstractUser
from django.db import models


# Create your models here.
class User(AbstractUser):
    first_name = None

    name = models.CharField(max_length=255, null=True, blank=True)
    ntfy_topic = models.CharField(max_length=255, null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.ntfy_topic:
            self.ntfy_topic = f"alrimi-{secrets.token_hex(8)}"
        super().save(*args, **kwargs)
