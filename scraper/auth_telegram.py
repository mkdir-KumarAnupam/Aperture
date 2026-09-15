import asyncio
import os
from dotenv import load_dotenv
from telethon import TelegramClient

load_dotenv()

API_ID = os.getenv("TELEGRAM_API_ID")
API_HASH = os.getenv("TELEGRAM_API_HASH")

async def main():
    if not API_ID or not API_HASH:
        print("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env first.")
        return
        
    client = TelegramClient("data/telegram_session", int(API_ID), API_HASH)
    await client.start()
    print("Authenticated successfully!")
    me = await client.get_me()
    print(me.stringify())
    
if __name__ == "__main__":
    asyncio.run(main())
