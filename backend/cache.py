from __future__ import annotations

import json
from typing import Any

from config import REDIS_URL

try:
    from redis import Redis
except ImportError:
    Redis = None

redis_client: Redis | None = None
redis_ready = False


def get_redis_client() -> Redis | None:
    global redis_client, redis_ready
    if Redis is None:
        return None
    if redis_client is not None and redis_ready:
        return redis_client
    try:
        redis_client = Redis.from_url(REDIS_URL, decode_responses=True)
        redis_client.ping()
        redis_ready = True
        return redis_client
    except Exception:
        redis_client = None
        redis_ready = False
        return None


def cache_get(key: str) -> Any | None:
    client = get_redis_client()
    if not client:
        return None
    try:
        raw = client.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


def cache_set(key: str, value: Any, ttl_seconds: int = 300) -> None:
    client = get_redis_client()
    if not client:
        return
    try:
        client.setex(key, ttl_seconds, json.dumps(value, default=str))
    except Exception:
        return
