import json

with open("daemon.py", "r") as f:
    content = f.read()

# Replace the payload construction part
import re

old_payload_start = """                    "platforms": {
                        "x": {
                            "status": health_status["x"]["status"],
                            "pagination": health_status["x"]["pagination"],
                            "error": health_status["x"]["error"],
                            "records": tweets
                        },
                        "reddit": {
                            "status": health_status["reddit"]["status"],
                            "pagination": health_status["reddit"]["pagination"],
                            "error": health_status["reddit"]["error"],
                            "records": reddit_posts
                        },
                        "telegram": {
                            "status": health_status["telegram"]["status"],
                            "pagination": health_status["telegram"]["pagination"],
                            "error": health_status["telegram"]["error"],
                            "records": telegram_messages
                        }
                    },
                    "authorProfiles": x_authors + reddit_authors,
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
                    "data": json.dumps(hierarchical_payload)
                }

                logging.info(f"Pushing payload (Tweets: {len(tweets)}, Reddit: {len(reddit_posts)}, Telegram: {len(telegram_messages)}) to Upstash Redis stream '{STREAM_KEY}'...")
                redis_client.xadd(STREAM_KEY, payload)"""

new_payload = """                    "platforms": {
                        "x": {
                            "status": health_status["x"]["status"],
                            "pagination": health_status["x"]["pagination"],
                            "error": health_status["x"]["error"]
                        },
                        "reddit": {
                            "status": health_status["reddit"]["status"],
                            "pagination": health_status["reddit"]["pagination"],
                            "error": health_status["reddit"]["error"]
                        },
                        "telegram": {
                            "status": health_status["telegram"]["status"],
                            "pagination": health_status["telegram"]["pagination"],
                            "error": health_status["telegram"]["error"]
                        }
                    },
                    "events": tweets + reddit_posts + telegram_messages,
                    "authorProfiles": x_authors + reddit_authors,
                    "communities": subreddits,
                    "quality": {
                        "warnings": [],
                        "errors": [],
                        "recordsCollected": 0
                    }
                }
                
                # Run validation
                hierarchical_payload = validate_collection(hierarchical_payload)
                
                # Serialize the canonical top-level fields directly as Redis Stream fields
                payload = {}
                for k, v in hierarchical_payload.items():
                    if isinstance(v, str):
                        payload[k] = v
                    else:
                        payload[k] = json.dumps(v)

                logging.info(f"Pushing payload (Tweets: {len(tweets)}, Reddit: {len(reddit_posts)}, Telegram: {len(telegram_messages)}) to Upstash Redis stream '{STREAM_KEY}'...")
                redis_client.xadd(STREAM_KEY, payload)"""

if old_payload_start in content:
    content = content.replace(old_payload_start, new_payload)
    with open("daemon.py", "w") as f:
        f.write(content)
    print("Daemon patched successfully.")
else:
    print("Could not find payload start block in daemon.py")
