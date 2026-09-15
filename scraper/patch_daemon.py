with open('daemon.py', 'r') as f:
    content = f.read()

import re

old_payload = """                # Construct Payload as separate fields
                payload = {
                    "trend": target_label,
                    "trend_rank": trend_rank if trend_rank is not None else 0,
                    "trend_volume": trend_volume if trend_volume is not None else 0,
                    "trend_discovered_at": trend_observed_at or "",
                    "x_payload": json.dumps(tweets),
                    "reddit_payload": json.dumps(reddit_posts),
                    "telegram_payload": json.dumps(telegram_messages),
                    "people_payload": json.dumps(x_authors + reddit_authors),
                    "community_payload": json.dumps(subreddits),
                    "status_payload": json.dumps(health_status)
                }"""

new_payload = """                # Construct unified hierarchical payload
                from app.processing.validator import validate_collection
                import uuid
                
                hierarchical_payload = {
                    "schemaVersion": "1.0",
                    "collection": {
                        "collectionId": str(uuid.uuid4()),
                        "trend": target_label,
                        "startedAt": health_status["timing"]["collectionStartedAt"],
                        "completedAt": health_status["timing"]["collectionCompletedAt"],
                        "durationSeconds": health_status["timing"]["durationSeconds"]
                    },
                    "trend": {
                        "trend": target_label,
                        "rank": trend_rank,
                        "volume": trend_volume,
                        "discoveredAt": trend_observed_at,
                        "retrieval": {
                            "query": target_label
                        }
                    },
                    "platforms": {
                        "x": {
                            "status": health_status["x"]["status"],
                            "pagination": health_status["x"]["pagination"],
                            "records": tweets
                        },
                        "reddit": {
                            "status": health_status["reddit"]["status"],
                            "pagination": health_status["reddit"]["pagination"],
                            "records": reddit_posts
                        },
                        "telegram": {
                            "status": health_status["telegram"]["status"],
                            "pagination": health_status["telegram"]["pagination"],
                            "records": telegram_messages
                        }
                    },
                    "authors": x_authors + reddit_authors,
                    "communities": subreddits,
                    "quality": {
                        "warnings": [],
                        "errors": [],
                        "recordsCollected": 0
                    }
                }
                
                # Run validation
                hierarchical_payload = validate_collection(hierarchical_payload)
                
                payload = {
                    "payload": json.dumps(hierarchical_payload)
                }"""

content = content.replace(old_payload, new_payload)
with open('daemon.py', 'w') as f:
    f.write(content)
print("patched daemon.py")
