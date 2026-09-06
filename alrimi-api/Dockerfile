# 로컬에서 postgres 와 함께 띄우는 용도. 배포도 이 이미지를 그대로 쓸 수 있다.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# psycopg2-binary·qrcode 모두 휠로 들어오므로 빌드 도구가 필요 없다
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# compose 가 local 용 명령으로 덮어쓴다. 그대로 띄우면 운영 설정으로 돈다.
CMD ["gunicorn", "alrimi_api.wsgi", "-b", "0.0.0.0:8000", "-w", "3"]
