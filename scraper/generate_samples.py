import requests
import json
import logging

logging.basicConfig(level=logging.INFO)

SCRAPER_API_URL = "http://localhost:8000"
TREND = "नेहा बोरा"

def fetch_and_save():
    try:
        x_res = requests.get(f"{SCRAPER_API_URL}/scrape/x/tweets", params={"keyword": TREND, "count": 10}).json()
        with open("sample_x_record.json", "w") as f:
            if x_res.get("data"):
                json.dump(x_res["data"][0], f, indent=2, ensure_ascii=False)
            
        r_res = requests.get(f"{SCRAPER_API_URL}/scrape/reddit/search", params={"keyword": TREND, "limit": 10}).json()
        with open("sample_reddit_record.json", "w") as f:
            if r_res.get("data"):
                json.dump(r_res["data"][0], f, indent=2, ensure_ascii=False)
                
        t_res = requests.get(f"{SCRAPER_API_URL}/scrape/telegram/search", params={"keyword": TREND, "limit": 10}).json()
        with open("sample_telegram_record.json", "w") as f:
            if t_res.get("data"):
                json.dump(t_res["data"][0], f, indent=2, ensure_ascii=False)

        a_res = requests.get(f"{SCRAPER_API_URL}/scrape/x/author", params={"handle": "elonmusk"}).json()
        with open("sample_author_record.json", "w") as f:
            if a_res.get("data"):
                json.dump(a_res["data"], f, indent=2, ensure_ascii=False)
                
        c_res = requests.get(f"{SCRAPER_API_URL}/scrape/reddit/subreddit", params={"name": "programming"}).json()
        with open("sample_community_record.json", "w") as f:
            if c_res.get("data"):
                json.dump(c_res["data"], f, indent=2, ensure_ascii=False)
                
        print("Generated samples.")
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    fetch_and_save()
