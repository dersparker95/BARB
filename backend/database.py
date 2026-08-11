from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException
from psycopg2.extras import RealDictCursor
from psycopg2.pool import ThreadedConnectionPool
from sqlalchemy import create_engine, text

from config import DATABASE_URL

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=15)

db_pool: ThreadedConnectionPool | None = None


def get_db_connection():
    global db_pool
    if db_pool is None:
        db_pool = ThreadedConnectionPool(1, 10, dsn=DATABASE_URL)
    return db_pool.getconn()


def release_db_connection(conn) -> None:
    global db_pool
    if db_pool is not None:
        db_pool.putconn(conn)
    else:
        conn.close()


def _query_all(sql: str, params: Optional[dict] = None) -> list[dict]:
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(sql, params or {})
            return cursor.fetchall()
    finally:
        release_db_connection(conn)


def _query_one(sql: str, params: Optional[dict] = None) -> dict | None:
    rows = _query_all(sql, params)
    return rows[0] if rows else None


def _execute_write(query: str, params: Optional[dict] = None) -> Any:
    try:
        with engine.connect() as conn:
            result = conn.execute(text(query), params or {})
            conn.commit()
            return result
    except Exception:
        raise HTTPException(status_code=500, detail="Error de escritura en DB")
