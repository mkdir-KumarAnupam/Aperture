import asyncio, os
from twikit import Client
from dotenv import load_dotenv

load_dotenv()

async def main():
    c = Client('en-IN')
    c.set_cookies({'auth_token': os.getenv('X_AUTH_TOKEN'), 'ct0': os.getenv('X_CT0')})
    trends = await c.get_trends('trending', count=20)
    for t in trends:
        print(f'{t.name} - {t.domain_context}')

asyncio.run(main())
