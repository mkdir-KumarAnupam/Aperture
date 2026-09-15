import asyncio
import json
import uuid
import os
import redis
import httpx
from datetime import datetime, timezone

redis_url = os.getenv("UPSTASH_REDIS_URL", "rediss://default:gQAAAAAAAYZ-AAIgcDIyYzlmMzY4OGFhODU0MjRmYmRkZDVhOWZhMDRjMmNiNQ@darling-airedale-99966.upstash.io:6379")
redis_client = redis.from_url(redis_url)
STREAM_KEY = "scrape:events"

async def trace():
    run_id = str(uuid.uuid4())
    print("========================================")
    
    async with httpx.AsyncClient() as client:
        res = await client.get("http://localhost:8000/scrape/x/tweets", params={"keyword": "#GaneshChaturthi", "count": 2})
        api_data = res.json()
        
    print(f"[A] Platform POST ID A: {api_data['data'][0]['platformPostId']}")
    
    from app.processing.validator import validate_collection
    hierarchical_payload = {
        "schemaVersion": "1.0.0",
        "collection": {
            "collectionId": run_id,
            "trend": "#GaneshChaturthi",
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "completedAt": datetime.now(timezone.utc).isoformat(),
            "durationSeconds": 1
        },
        "metadata": {
            "collectorVersion": "2.0.0",
            "contractPurpose": "raw_public_social_evidence"
        },
        "trend": {
            "trend": "#GaneshChaturthi",
            "rank": 1,
            "volume": 100,
            "discoveredAt": datetime.now(timezone.utc).isoformat(),
            "retrieval": {"query": "#GaneshChaturthi"}
        },
        "platforms": {
            "x": {
                "status": "success",
                "pagination": api_data.get("pagination", {}),
                "error": None
            },
            "reddit": {
                "status": "success_empty",
                "pagination": {"requestedLimit": 0, "primaryResultsReturned": 0, "relationshipResolutionReturned": 0, "recordsCollected": 0, "stoppedBecause": "no_more_results"},
                "error": None
            },
            "telegram": {
                "status": "success_empty",
                "pagination": {"requestedLimit": 0, "primaryResultsReturned": 0, "relationshipResolutionReturned": 0, "recordsCollected": 0, "stoppedBecause": "no_more_results"},
                "error": None
            }
        },
        "events": api_data.get("data", []) + api_data.get("referenced_posts", []),
        "authorProfiles": [],
        "communities": [],
        "quality": {"warnings": [], "errors": [], "recordsCollected": len(api_data.get("data", []))}
    }
    
    print(f"[B] Normalized Object ID B: {hierarchical_payload['events'][0]['platformPostId']}")
    
    hierarchical_payload = validate_collection(hierarchical_payload)
    
    print(f"[C] Validated Object ID C: {hierarchical_payload['events'][0]['platformPostId']}")
    
    payload = {}
    for k, v in hierarchical_payload.items():
        if isinstance(v, str):
            payload[k] = v
        else:
            payload[k] = json.dumps(v)
            
    msg_id = redis_client.xadd(STREAM_KEY, payload)
    
    print(f"Redis XADD Msg ID: {msg_id}")
    
    read_back = redis_client.xrange(STREAM_KEY, min=msg_id, max=msg_id)
    read_fields = read_back[0][1]
    
    read_data = {}
    for k, v in read_fields.items():
        key_str = k.decode('utf-8')
        val_str = v.decode('utf-8')
        if key_str == 'schemaVersion':
            read_data[key_str] = val_str
        else:
            read_data[key_str] = json.loads(val_str)
    
    print(f"[D] Read-Back Object ID D: {read_data['events'][0]['platformPostId']}")
    print(f"Read-Back Fingerprint: {read_data['events'][0]['content']['contentFingerprint']}")
    print(f"Pagination: {read_data['platforms']['x']['pagination']}")
    print("========================================")

asyncio.run(trace())
