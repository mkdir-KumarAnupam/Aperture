"""
In-memory TTL cache for expensive scraper endpoints.
Swap TTLCache for Redis in production.
"""
import asyncio
from cachetools import TTLCache

_trend_cache: TTLCache = TTLCache(maxsize=32, ttl=300)   # 5 min
_author_cache: TTLCache = TTLCache(maxsize=256, ttl=600)  # 10 min
_cache_lock = asyncio.Lock()


async def get_cached(cache: TTLCache, key: str):
    async with _cache_lock:
        return cache.get(key)


async def set_cached(cache: TTLCache, key: str, value) -> None:
    async with _cache_lock:
        cache[key] = value


trend_cache = _trend_cache
author_cache = _author_cache
