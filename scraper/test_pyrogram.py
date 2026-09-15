import asyncio
import os
from dotenv import load_dotenv
from pyrogram import Client

load_dotenv()
API_ID = os.getenv("TELEGRAM_API_ID", "").strip('"\'')
API_HASH = os.getenv("TELEGRAM_API_HASH", "").strip('"\'')

app = Client("test_pyro", api_id=int(API_ID), api_hash=API_HASH, in_memory=True)

async def main():
    print("Testing Pyrogram...")
    await app.start()
    print("Pyrogram connected!")
    await app.stop()

asyncio.run(main())
