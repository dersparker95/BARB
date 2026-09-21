FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd -m -r appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:9000/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "9000", "--reload"]
