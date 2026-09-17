from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import SAFE_METHODS, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Sharing, visible_zones
from .palette import PALETTE
from .serializers import AddSharingSerializer, PersonSerializer, ZoneSerializer

OWNER_ONLY = "공간 주인만 바꿀 수 있어요."


def with_counts(queryset, today=None):
    """
    upcoming_count 는 'later'까지 포함한 앞으로의 전체 개수다.
    웹이 '이후 일정 N개'를 이 값에서 목록 길이를 빼서 구한다.
    """
    today = today or timezone.localdate()
    # 보류한 일정은 양쪽 다 세지 않는다. 목록 어디에도 안 나오는 것이 개수에만
    # 잡히면, 칩의 숫자를 눌러 들어간 사람이 그만큼을 찾지 못한다.
    scheduled = Q(events__held_at__isnull=True)
    return queryset.select_related("owner").annotate(
        # 앞으로 남은 할 일. 완료한 것은 세지 않는다.
        upcoming_count=Count(
            "events",
            filter=scheduled & Q(events__event_date__gte=today, events__completed_at__isnull=True),
            distinct=True,
        ),
        past_count=Count(
            "events", filter=scheduled & Q(events__event_date__lt=today), distinct=True
        ),
    )


class IsZoneOwnerOrReadOnly(BasePermission):
    """구성원은 보기만 한다. 이름·색을 바꾸거나 공간을 지우는 것은 주인이다."""

    message = OWNER_ONLY

    def has_object_permission(self, request, view, zone):
        return request.method in SAFE_METHODS or zone.owner_id == request.user.id


class PaletteView(APIView):
    """GET /zones/palette — 고를 수 있는 색. 웹이 이 목록으로 견본을 그린다."""

    permission_classes = [IsAuthenticated]

    def get(self, _request):
        return Response({"colors": PALETTE})


class ZoneListCreateView(generics.ListCreateAPIView):
    """
    GET/POST /zones

    목록에는 **공유받은 공간도 함께** 나온다(`role: "member"`). 일정 목록과 달력이
    공간 칩으로 거르고 머리글자 딱지를 찾으므로, 칩에 없는 공간의 일정이 섞이면
    딱지를 그릴 수 없다.
    """

    serializer_class = ZoneSerializer
    pagination_class = None

    def get_queryset(self):
        return with_counts(visible_zones(self.request.user))

    def create(self, request, *args, **kwargs):
        """
        만든 공간을 목록과 같은 모양으로 돌려준다. 저장한 객체에는 개수(구성원 수 등)가
        안 붙어 있어서 그대로 내보내면 그 칸들이 빠진다 — 개수를 붙여 다시 읽는다.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        zone = serializer.save(owner=request.user)
        fresh = self.get_queryset().get(pk=zone.pk)
        return Response(self.get_serializer(fresh).data, status=status.HTTP_201_CREATED)


class ZoneDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /zones/{id} — 바꾸고 지우는 것은 주인만"""

    serializer_class = ZoneSerializer
    permission_classes = [IsAuthenticated, IsZoneOwnerOrReadOnly]
    lookup_url_kwarg = "zone_id"
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return with_counts(visible_zones(self.request.user))


def person(user) -> dict:
    return {"id": user.pk, "username": user.username, "name": user.name}


class SharingListView(APIView):
    """
    GET  /sharing             → 내 공간을 함께 보는 사람들 [{id, username, name}, ...]
    POST /sharing {"user_id"} → 더한 뒤의 전체 목록

    사람은 **한 번만** 정한다. 어느 공간을 보여줄지는 공간마다 `shared` 로 켜고 끈다.
    더한 뒤 전체를 돌려주는 것은 웹이 들고 있는 것이 목록이라서다.
    """

    permission_classes = [IsAuthenticated]

    def rows(self, request):
        viewers = Sharing.objects.filter(owner=request.user).select_related("viewer")
        return PersonSerializer([person(s.viewer) for s in viewers], many=True).data

    def get(self, request):
        return Response(self.rows(request))

    def post(self, request):
        serializer = AddSharingSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        Sharing.objects.create(owner=request.user, viewer=serializer.validated_data["user_id"])
        return Response(self.rows(request), status=status.HTTP_201_CREATED)


class SharingDetailView(APIView):
    """DELETE /sharing/{user_id} → 204. 그 사람에게 더는 내 공간을 보여주지 않는다"""

    permission_classes = [IsAuthenticated]

    def delete(self, request, user_id):
        deleted, _ = Sharing.objects.filter(owner=request.user, viewer_id=user_id).delete()
        if not deleted:
            raise ValidationError({"detail": "함께 보고 있는 사람이 아니에요."})
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReceivedSharingListView(APIView):
    """
    GET /sharing/received → 나에게 공간을 보여주는 사람들 [{id, username, name}, ...]

    받는 쪽도 목록을 볼 수 있어야 "왜 아빠 일정이 보이지" 에 답할 수 있고, 그만 받을 수도 있다.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        sharers = Sharing.objects.filter(viewer=request.user).select_related("owner")
        return Response(PersonSerializer([person(s.owner) for s in sharers], many=True).data)


class ReceivedSharingDetailView(APIView):
    """DELETE /sharing/received/{owner_id} → 204. 그 사람의 공간을 그만 본다(알림도 끊긴다)"""

    permission_classes = [IsAuthenticated]

    def delete(self, request, owner_id):
        deleted, _ = Sharing.objects.filter(owner_id=owner_id, viewer=request.user).delete()
        if not deleted:
            raise ValidationError({"detail": "함께 보고 있는 사람이 아니에요."})
        return Response(status=status.HTTP_204_NO_CONTENT)
