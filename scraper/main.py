from fastapi import FastAPI, HTTPException
import os
import re
import httpx
from datetime import datetime
from dotenv import load_dotenv
from twikit import Client
from langdetect import detect, LangDetectException

load_dotenv()

app = FastAPI(title="Social Scraper API")

x_client = Client("en-IN")
auth_token = os.getenv("X_AUTH_TOKEN")
ct0 = os.getenv("X_CT0")

if auth_token and ct0:
    x_client.set_cookies({"auth_token": auth_token, "ct0": ct0})
else:
    print("Warning: X_AUTH_TOKEN or X_CT0 not found in environment.")


REGION_MAP = {
    "india": "India",
    "mumbai": "Maharashtra", "pune": "Maharashtra", "nagpur": "Maharashtra", "maharashtra": "Maharashtra",
    "delhi": "Delhi", "new delhi": "Delhi", "ncr": "Delhi",
    "bangalore": "Karnataka", "bengaluru": "Karnataka", "karnataka": "Karnataka", "mysore": "Karnataka",
    "hyderabad": "Telangana", "telangana": "Telangana",
    "chennai": "Tamil Nadu", "coimbatore": "Tamil Nadu", "tamil nadu": "Tamil Nadu",
    "kolkata": "West Bengal", "west bengal": "West Bengal",
    "ahmedabad": "Gujarat", "surat": "Gujarat", "gujarat": "Gujarat",
    "jaipur": "Rajasthan", "rajasthan": "Rajasthan",
    "lucknow": "Uttar Pradesh", "kanpur": "Uttar Pradesh", "noida": "Uttar Pradesh", "up": "Uttar Pradesh", "uttar pradesh": "Uttar Pradesh",
    "chandigarh": "Punjab/Haryana", "punjab": "Punjab/Haryana", "haryana": "Punjab/Haryana", "gurgaon": "Punjab/Haryana",
    "bhopal": "Madhya Pradesh", "indore": "Madhya Pradesh", "madhya pradesh": "Madhya Pradesh",
    "patna": "Bihar", "bihar": "Bihar",
    "kerala": "Kerala", "kochi": "Kerala", "trivandrum": "Kerala",
    "andhra pradesh": "Andhra Pradesh", "vizag": "Andhra Pradesh"
}

PROFESSION_KEYWORDS = {
    "journalist": ["journalist", "reporter", "editor", "correspondent", "news", "media"],
    "politician": ["politician", "minister", "mp", "mla", "councillor", "senator", "congress", "bjp", "aap"],
    "activist": ["activist", "advocate", "campaigner", "human rights"],
    "developer": ["developer", "engineer", "coder", "programmer", "software", "web dev", "backend", "frontend"],
    "student": ["student", "university", "college", "studying", "undergrad", "phd"],
    "entrepreneur": ["entrepreneur", "founder", "ceo", "startup", "co-founder"],
    "artist": ["artist", "musician", "singer", "actor", "actress", "painter", "filmmaker"],
    "content_creator": ["youtuber", "blogger", "influencer", "content creator", "vlogger"],
    "sports": ["cricketer", "player", "athlete", "coach", "sports", "football"],
    "doctor": ["doctor", "physician", "surgeon", "medical", "mbbs", "md"],
    "lawyer": ["lawyer", "advocate", "attorney", "legal", "supreme court", "high court"],
}

CATEGORY_KEYWORDS = {
    "Politics": ["bjp", "congress", "modi", "rahul", "election", "minister", "parliament", "vote",
                 "mla", "mp", "party", "government", "opposition", "political", "resign",
                 "protest", "rally", "amit shah", "kejriwal", "yogi", "abvp", "nda", "india bloc"],
    "Entertainment": ["movie", "song", "actor", "actress", "film", "drama", "album", "trailer",
                      "bollywood", "tollywood", "kollywood", "ott", "netflix", "release",
                      "music", "dance", "celebrity", "star", "concert"],
    "Sports": ["cricket", "match", "ipl", "goal", "team", "player", "football", "tennis",
               "world cup", "innings", "wicket", "run", "captain", "bcci", "score",
               "stadium", "tournament", "league", "olympic", "hbd"],
    "Tech": ["ai", "app", "launch", "phone", "update", "software", "google", "apple",
             "startup", "tech", "android", "ios", "chatgpt", "robot", "chip",
             "processor", "mediatek", "snapdragon", "samsung", "nvidia"],
}

def detect_language(text: str) -> str:
    try:
        return detect(text)
    except LangDetectException:
        return "unknown"

def extract_hashtags(text: str) -> list:
    return re.findall(r'#(\w+)', text)

def parse_region(location: str) -> str:
    if not location:
        return None
    loc_lower = location.lower().strip()
    for keyword, region in REGION_MAP.items():
        if keyword in loc_lower:
            return region
    return "Other"

def parse_profession(bio: str) -> str:
    if not bio:
        return None
    bio_lower = bio.lower()
    for profession, keywords in PROFESSION_KEYWORDS.items():
        for kw in keywords:
            if kw in bio_lower:
                return profession
    return None

def classify_trend(label: str, tweets_text: list) -> str:
    combined = (label + " " + " ".join(tweets_text)).lower()
    scores = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in combined)
        scores[category] = score
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "Other"



@app.get("/scrape/x/trends")
async def get_x_trends():
    try:
        trends = await x_client.get_trends('trending', count=20)
        formatted_trends = []
        for index, trend in enumerate(trends):
            vol = getattr(trend, 'tweet_volume', None)
            if vol is None:
                vol = getattr(trend, 'tweet_count', None)
            try:
                vol = int(vol) if vol else 0
            except (ValueError, TypeError):
                vol = 0
            formatted_trends.append({
                "platform": "x",
                "label": trend.name,
                "volume": vol,
                "rank": index + 1
            })
        return {"status": "success", "data": formatted_trends}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch X trends: {str(e)}")


@app.get("/scrape/x/tweets")
async def get_x_tweets(keyword: str, count: int = 20):
    try:
        tweets = await x_client.search_tweet(keyword, product='Top', count=count)
        formatted_tweets = []
        for tweet in tweets:
            text = tweet.text or ""
            hashtags = extract_hashtags(text)
            lang = detect_language(text)

            reply_to_author_id = None
            if hasattr(tweet, 'in_reply_to_user_id') and tweet.in_reply_to_user_id:
                reply_to_author_id = str(tweet.in_reply_to_user_id)
            elif hasattr(tweet, 'in_reply_to') and tweet.in_reply_to:
                reply_to_author_id = str(tweet.in_reply_to)

            forward_from_id = None
            if hasattr(tweet, 'retweeted_tweet') and tweet.retweeted_tweet:
                forward_from_id = str(tweet.retweeted_tweet.id) if hasattr(tweet.retweeted_tweet, 'id') else None

            formatted_tweets.append({
                "platform": "x",
                "postId": str(tweet.id),
                "authorId": str(tweet.user.id),
                "authorHandle": tweet.user.screen_name,
                "authorLocation": tweet.user.location,
                "text": text,
                "timestamp": tweet.created_at,
                "language": tweet.lang,
                "detectedLang": lang,
                "hashtags": hashtags,
                "engagement": {
                    "likes": tweet.favorite_count or 0,
                    "retweets": tweet.retweet_count or 0,
                    "replies": tweet.reply_count or 0,
                    "quotes": tweet.quote_count or 0
                },
                "replyToId": str(tweet.in_reply_to) if hasattr(tweet, 'in_reply_to') and tweet.in_reply_to else None,
                "replyToAuthorId": reply_to_author_id,
                "forwardFromId": forward_from_id,
                "sourceLayer": "keyword_search"
            })
        return {"status": "success", "data": formatted_tweets}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch X tweets: {str(e)}")


@app.get("/scrape/x/author")
async def get_x_author(handle: str):
    try:
        user = await x_client.get_user_by_screen_name(handle)
        bio = user.description or ""
        location = user.location or ""
        
        formatted_author = {
            "platform": "x",
            "authorId": str(user.id),
            "handle": user.screen_name,
            "bio": bio,
            "location": location,
            "region": parse_region(location),
            "profession": parse_profession(bio),
            "followerCount": user.followers_count,
            "verified": user.verified,
            "accountAge": user.created_at
        }
        return {"status": "success", "data": formatted_author}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch X author: {str(e)}")


@app.post("/process/classify-trend")
async def classify_trend_endpoint(data: dict):
    label = data.get("label", "")
    tweets_text = data.get("tweets_text", [])
    category = classify_trend(label, tweets_text)
    return {"category": category}


@app.get("/scrape/reddit/search")
async def get_reddit_search(keyword: str, limit: int = 15):
    url = f"https://www.reddit.com/search.json?q={keyword}&limit={limit}&sort=relevance"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SocialAnalyticsApp/1.0"}
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            data = response.json()
            posts = data.get("data", {}).get("children", [])
            formatted_posts = []
            for post in posts:
                pd = post.get("data", {})
                text = (pd.get("title", "") + " " + pd.get("selftext", "")).strip()
                hashtags = extract_hashtags(text)
                lang = detect_language(text)
                formatted_posts.append({
                    "platform": "reddit",
                    "postId": pd.get("id"),
                    "authorId": pd.get("author_fullname") or pd.get("author"),
                    "authorHandle": pd.get("author"),
                    "text": text,
                    "timestamp": datetime.fromtimestamp(pd.get("created_utc", 0)),
                    "language": None,
                    "detectedLang": lang,
                    "hashtags": hashtags,
                    "engagement": {
                        "upvotes": pd.get("ups", 0),
                        "downvotes": pd.get("downs", 0),
                        "score": pd.get("score", 0),
                        "comments": pd.get("num_comments", 0)
                    },
                    "replyToId": None,
                    "replyToAuthorId": None,
                    "forwardFromId": None,
                    "sourceLayer": "keyword_search",
                    "subreddit": pd.get("subreddit")
                })
            return {"status": "success", "data": formatted_posts}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch Reddit search: {str(e)}")


@app.get("/scrape/reddit/author")
async def get_reddit_author(handle: str):
    url = f"https://www.reddit.com/user/{handle}/about.json"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) SocialAnalyticsApp/1.0"}
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            data = response.json()
            ud = data.get("data", {})
            bio = ud.get("subreddit", {}).get("public_description", "")
            formatted_author = {
                "platform": "reddit",
                "authorId": ud.get("id") or ud.get("name"),
                "handle": ud.get("name"),
                "bio": bio,
                "location": None,
                "region": None,
                "profession": parse_profession(bio),
                "followerCount": ud.get("subreddit", {}).get("subscribers", 0),
                "verified": ud.get("verified", False),
                "accountAge": datetime.fromtimestamp(ud.get("created_utc", 0)) if ud.get("created_utc") else None
            }
            return {"status": "success", "data": formatted_author}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch Reddit author: {str(e)}")


@app.get("/health")
def health_check():
    return {"status": "ok"}
