import asyncio
import os
from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.network.connection.tcpintermediate import ConnectionTcpIntermediate
from telethon.network.connection.tcpabridged import ConnectionTcpAbridged

load_dotenv()

API_ID = os.getenv("TELEGRAM_API_ID", "").strip('"\'')
API_HASH = os.getenv("TELEGRAM_API_HASH", "").strip('"\'')

async def main():
    print("Testing Intermediate...")
    client1 = TelegramClient("test_intermediate", int(API_ID), API_HASH, connection=ConnectionTcpIntermediate)
    try:
        await client1.connect()
        print("Intermediate connected!")
        await client1.disconnect()
        return
    except Exception as e:
        print(f"Intermediate failed: {e}")
        
    print("Testing Abridged...")
    client2 = TelegramClient("test_abridged", int(API_ID), API_HASH, connection=ConnectionTcpAbridged)
    try:
        await client2.connect()
        print("Abridged connected!")
        await client2.disconnect()
        return
    except Exception as e:
        print(f"Abridged failed: {e}")

asyncio.run(main())
