from . import sync


class SyncBatchMiddleware:
    """
    요청 하나를 `sync.batch()` 로 감싼다. 일정을 여럿 지우거나 반복을 채우는 요청에서
    구글 연결 여부를 공간마다 한 번만 묻게 하려는 것이다 — 일정마다 물으면 300건 지우기에
    쿼리가 300개 더 붙는다.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        with sync.batch():
            return self.get_response(request)
