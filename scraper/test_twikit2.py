import os
import asyncio
from dotenv import load_dotenv
from twikit import Client

load_dotenv()
async def test():
    x_client = Client("en-IN")
    x_client.set_cookies({"auth_token": os.getenv("X_AUTH_TOKEN"), "ct0": os.getenv("X_CT0")})
    try:
        tweets = await x_client.search_tweet("test", "Top")
        print(f"Success! Found {len(tweets)} tweets.")
    except Exception as e:
        print(f"Failed: {type(e).__name__} - {str(e)}")

asyncio.run(test())
