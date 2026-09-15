import asyncio
from telethon import TelegramClient
from telethon.tl.functions.channels import SearchPostsRequest
from telethon.tl.types import InputPeerEmpty
import os
from dotenv import load_dotenv

load_dotenv()
API_ID = int(os.getenv("TELEGRAM_API_ID"))
API_HASH = os.getenv("TELEGRAM_API_HASH")

async def main():
    client = TelegramClient('data/telegram_session', API_ID, API_HASH)
    await client.connect()
    result = await client(SearchPostsRequest(
        hashtag='news',
        query=None,
        offset_rate=0,
        offset_peer=InputPeerEmpty(),
        offset_id=0,
        limit=5
    ))
    
    for msg in result.messages:
        print(f"Message ID: {msg.id}")
        if hasattr(msg, 'reactions') and msg.reactions:
            print("  Raw reactions object:", msg.reactions)
            if hasattr(msg.reactions, 'results'):
                total = sum(r.count for r in msg.reactions.results)
                print(f"  Total Reactions: {total}")
        else:
            print("  No reactions.")
            
    await client.disconnect()

asyncio.run(main())
