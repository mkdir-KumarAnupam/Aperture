import asyncio
from dotenv import load_dotenv
import asyncpraw

load_dotenv()
async def test():
    try:
        reddit = asyncpraw.Reddit(
            client_id="dummy", client_secret="dummy", user_agent="social-scraper/1.0"
        )
        print("AsyncPraw Initialized. Mocking search...")
        await reddit.close()
    except Exception as e:
        print(f"Failed: {type(e).__name__} - {str(e)}")

asyncio.run(test())
