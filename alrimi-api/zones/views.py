from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Zone
from .palette import PALETTE
from .serializers import ZoneSerializer


def with_counts(queryset, today=None):
    """
    upcoming_count 는 'later'까지 포함한 앞으로의 전체 개수다.
    웹이 '이후 일정 N개'를 이 값에서 목록 길이를 빼서 구한다.
    """
    today = today or timezone.localdate()
    return queryset.annotate(
        # 앞으로 남은 할 일. 완료한 것은 세지 않는다.
        upcoming_count=Count(
            "notices",
            filter=Q(notices__event_date__gte=today, notices__completed_at__isnull=True),
            distinct=True,
        ),
        past_count=Count("notices", filter=Q(notices__event_date__lt=today), distinct=True),
    )


class PaletteView(APIView):
    """GET /zones/palette — 고를 수 있는 색. 웹이 이 목록으로 견본을 그린다."""

    permission_classes = [IsAuthenticated]

    def get(self, _request):
        return Response({"colors": PALETTE})


class ZoneListCreateView(generics.ListCreateAPIView):
    """GET/POST /zones"""

    serializer_class = ZoneSerializer
    pagination_class = None

    def get_queryset(self):
        return with_counts(Zone.objects.filter(owner=self.request.user))

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class ZoneDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PATCH/DELETE /zones/{id}"""

    serializer_class = ZoneSerializer
    lookup_url_kwarg = "zone_id"
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return with_counts(Zone.objects.filter(owner=self.request.user))
