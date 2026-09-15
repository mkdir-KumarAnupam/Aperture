import os
import asyncio
from dotenv import load_dotenv
from twikit import Client

load_dotenv()
async def test():
    x_client = Client("en-IN")
    x_client.set_cookies({"auth_token": os.getenv("X_AUTH_TOKEN"), "ct0": os.getenv("X_CT0")})
    try:
        trends = await x_client.get_trends('trending')
        print(f"Success! Found {len(trends)} trends.")
    except Exception as e:
        print(f"Failed: {type(e).__name__} - {str(e)}")

asyncio.run(test())
