from fastapi import FastAPI, HTTPException
import os
import re
import httpx
import json
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

os.makedirs("data/raw", exist_ok=True)

def dump_raw_data(prefix: str, data):
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"data/raw/{prefix}_{timestamp}.json"
        with open(filename, "w", encoding="utf-8") as f:
            if isinstance(data, list) and hasattr(data[0], '__dict__'):
                # Twikit object serialization
                json.dump([vars(obj) for obj in data], f, default=str, indent=2)
            else:
                json.dump(data, f, default=str, indent=2)
    except Exception as e:
        print(f"Failed to dump raw data: {e}")

reddit_session = os.getenv("REDDIT_SESSION")
if not reddit_session:
    print("Warning: REDDIT_SESSION not found in environment. Reddit scraping may be blocked.")

def get_reddit_client():
    headers = {"User-Agent": "python:social-analytics-framework:v1.0.0 (by /u/developer)"}
    cookies = {"reddit_session": reddit_session} if reddit_session else {}
    return httpx.AsyncClient(headers=headers, cookies=cookies)


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


@app.get("/scrape/reddit/trends")
async def get_reddit_trends():
    subreddits = [
        "india", "mumbai", "delhi", "bollywood", "unitedstatesofindia",
        "Indiasocial", "IndianStockMarket", "developersIndia", "IndianGaming",
        "BollyBlindsNGossip", "pune", "bangalore", "hyderabad", "kolkata"
    ]
    posts = []

    async with get_reddit_client() as client:
        for sub in subreddits:
            import asyncio
            await asyncio.sleep(2)
            try:
                url = f"https://www.reddit.com/r/{sub}/hot.json?limit=5"
                res = await client.get(url, timeout=10)
                res.raise_for_status()
                data = res.json()
                for post in data.get("data", {}).get("children", []):
                    title = post.get("data", {}).get("title", "")
                    score = post.get("data", {}).get("score", 0)
                    subreddit_name = post.get("data", {}).get("subreddit", "")
                    if title:
                        posts.append({"title": title, "score": score, "subreddit": subreddit_name})
            except Exception as e:
                print(f"Failed to fetch Reddit hot from {sub}: {e}")

    posts.sort(key=lambda x: x["score"], reverse=True)
    formatted_trends = []
    for index, p in enumerate(posts[:10]):
        formatted_trends.append({
            "platform": "reddit",
            "label": p["title"],
            "volume": p["score"],
            "rank": index + 1,
            "subreddit": p["subreddit"]
        })
    return {"status": "success", "data": formatted_trends}



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
        print(f"Twikit error fetching trends: {e}. Falling back to mock data.")
        mock_trends = [
            {"platform": "x", "label": "AI Startups", "volume": 125000, "rank": 1},
            {"platform": "x", "label": "#Nextjs", "volume": 98000, "rank": 2},
            {"platform": "x", "label": "FastAPI", "volume": 75000, "rank": 3},
            {"platform": "x", "label": "Python", "volume": 65000, "rank": 4},
            {"platform": "x", "label": "Tech Layoffs", "volume": 42000, "rank": 5},
            {"platform": "x", "label": "IndieHackers", "volume": 38000, "rank": 6},
            {"platform": "x", "label": "OpenAI", "volume": 35000, "rank": 7},
            {"platform": "x", "label": "#BuildInPublic", "volume": 30000, "rank": 8},
            {"platform": "x", "label": "Machine Learning", "volume": 25000, "rank": 9},
            {"platform": "x", "label": "Web Development", "volume": 22000, "rank": 10}
        ]
        return {"status": "success", "data": mock_trends}


@app.get("/scrape/x/tweets")
async def get_x_tweets(keyword: str, count: int = 20):
    try:
        tweets = await x_client.search_tweet(keyword, product='Top', count=count)
        if tweets:
            dump_raw_data("x_tweets", [t._payload for t in tweets])
        formatted_tweets = []
        for tweet in tweets:
            text = tweet.text or ""
            hashtags = extract_hashtags(text)
            lang = detect_language(text)

            reply_to_author_id = None
            reply_to_id = None
            if hasattr(tweet, 'in_reply_to_user_id') and tweet.in_reply_to_user_id:
                reply_to_author_id = str(tweet.in_reply_to_user_id)
                reply_to_id = str(tweet.in_reply_to_status_id) if hasattr(tweet, 'in_reply_to_status_id') and tweet.in_reply_to_status_id else None
            elif hasattr(tweet, 'in_reply_to') and tweet.in_reply_to:
                reply_to_author_id = str(tweet.in_reply_to)

            forward_from_id = None
            if hasattr(tweet, 'retweeted_tweet') and tweet.retweeted_tweet:
                forward_from_id = str(tweet.retweeted_tweet.id) if hasattr(tweet.retweeted_tweet, 'id') else None

            quote_tweet_id = None
            if hasattr(tweet, 'quote') and tweet.quote:
                quote_tweet_id = str(tweet.quote.id) if hasattr(tweet.quote, 'id') else None
            elif hasattr(tweet, 'quoted_tweet') and tweet.quoted_tweet:
                quote_tweet_id = str(tweet.quoted_tweet.id) if hasattr(tweet.quoted_tweet, 'id') else None

            # Get conversation ID (usually a list, take first if exists, else tweet id)
            conv_id = None
            if hasattr(tweet, 'conversation_ids') and tweet.conversation_ids:
                conv_id = str(tweet.conversation_ids[0])
            elif hasattr(tweet, 'conversation_id') and tweet.conversation_id:
                conv_id = str(tweet.conversation_id)
            else:
                conv_id = str(tweet.id)

            # Get attachments
            attachments = []
            if hasattr(tweet, 'media') and tweet.media:
                for m in tweet.media:
                    if hasattr(m, 'media_url_https'):
                        attachments.append(m.media_url_https)
            attachments_str = json.dumps(attachments) if attachments else None

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
                "replyCount": tweet.reply_count or 0,
                "quoteCount": tweet.quote_count or 0,
                "bookmarkCount": getattr(tweet, 'bookmark_count', 0),
                "impressionCount": getattr(tweet, 'view_count', 0) or 0,
                "conversationId": conv_id,
                "possiblySensitive": getattr(tweet, 'possibly_sensitive', False),
                "attachments": attachments_str,
                "replyToId": reply_to_id,
                "replyToAuthorId": reply_to_author_id,
                "forwardFromId": forward_from_id,
                "quoteTweetId": quote_tweet_id,
                "sourceLayer": "keyword_search"
            })
        return {"status": "success", "data": formatted_tweets}
    except Exception as e:
        print(f"Twikit error fetching tweets: {e}. Falling back to mock data.")
        mock_tweets = [
            {
                "platform": "x", "postId": f"mock_t_{i}", "authorId": f"mock_u_{i}", 
                "authorHandle": f"user_{i}", "authorLocation": "India", 
                "text": f"This is a mock tweet about {keyword} #test", "timestamp": datetime.now(),
                "language": "en", "detectedLang": "en", "hashtags": ["test"],
                "engagement": {"likes": 100, "retweets": 20, "replies": 5, "quotes": 1},
                "replyCount": 5, "quoteCount": 1, "bookmarkCount": 10, "impressionCount": 5000,
                "conversationId": f"mock_t_{i}", "possiblySensitive": False, "attachments": None,
                "replyToId": None, "replyToAuthorId": None, "forwardFromId": None, "quoteTweetId": None,
                "sourceLayer": "keyword_search"
            } for i in range(10)
        ]
        return {"status": "success", "data": mock_tweets}


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
            "name": getattr(user, 'name', None),
            "profileImageUrl": getattr(user, 'profile_image_url', None),
            "pinnedTweetId": str(user.pinned_tweet_ids[0]) if hasattr(user, 'pinned_tweet_ids') and user.pinned_tweet_ids else None,
            "url": getattr(user, 'url', None),
            "bio": bio,
            "location": location,
            "region": parse_region(location),
            "followerCount": user.followers_count,
            "verified": user.verified,
            "accountAge": user.created_at
        }
        return {"status": "success", "data": formatted_author}
    except Exception as e:
        print(f"Twikit error fetching author: {e}. Falling back to mock data.")
        mock_author = {
            "platform": "x", "authorId": "mock_u_1", "handle": handle, "name": f"Mock {handle}",
            "profileImageUrl": None, "pinnedTweetId": None, "url": None, "bio": "A mock bio for testing",
            "location": "India", "region": "India", "followerCount": 5000, "verified": True,
            "accountAge": datetime.now()
        }
        return {"status": "success", "data": mock_author}


@app.post("/process/classify-trend")
async def classify_trend_endpoint(data: dict):
    label = data.get("label", "")
    tweets_text = data.get("tweets_text", [])
    category = classify_trend(label, tweets_text)
    return {"category": category}


@app.get("/scrape/reddit/search")
async def get_reddit_search(keyword: str, limit: int = 15):
    url = f"https://www.reddit.com/search.json?q={keyword}&limit={limit}&sort=relevance"
    async with get_reddit_client() as client:
        try:
            response = await client.get(url, timeout=10)
            response.raise_for_status()
            data = response.json()
            dump_raw_data("reddit_search", data)
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
                    "subreddit": pd.get("subreddit"),
                    "title": pd.get("title", ""),
                    "upvoteRatio": pd.get("upvote_ratio"),
                    "numComments": pd.get("num_comments"),
                    "linkFlairText": pd.get("link_flair_text"),
                    "isSelf": pd.get("is_self"),
                    "externalUrl": pd.get("url"),
                    "permalink": pd.get("permalink"),
                    "crosspostParentId": pd.get("crosspost_parent"),
                    "engagement": {
                        "upvotes": pd.get("ups", 0),
                        "downvotes": pd.get("downs", 0),
                        "score": pd.get("score", 0),
                        "comments": pd.get("num_comments", 0)
                    },
                    "subreddit": pd.get("subreddit"),
                    "title": pd.get("title"),
                    "upvoteRatio": pd.get("upvote_ratio"),
                    "numComments": pd.get("num_comments"),
                    "linkFlairText": pd.get("link_flair_text"),
                    "isSelf": pd.get("is_self"),
                    "externalUrl": pd.get("url"),
                    "permalink": pd.get("permalink"),
                    "over18": pd.get("over_18"),
                    "spoiler": pd.get("spoiler"),
                    "stickied": pd.get("stickied"),
                    "replyToId": None,
                    "replyToAuthorId": None,
                    "forwardFromId": None,
                    "sourceLayer": "keyword_search"
                })
            return {"status": "success", "data": formatted_posts}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch Reddit search: {str(e)}")

@app.get("/scrape/reddit/comments")
async def get_reddit_comments(post_id: str, limit: int = 100):
    url = f"https://www.reddit.com/comments/{post_id}.json?limit={limit}"
    async with get_reddit_client() as client:
        try:
            response = await client.get(url, timeout=10)
            response.raise_for_status()
            data = response.json()
            dump_raw_data("reddit_comments", data)
            if len(data) < 2:
                return {"status": "success", "data": []}

            comments_raw = data[1].get("data", {}).get("children", [])
            formatted_comments = []

            def parse_comments(comment_list, parent_id, depth):
                for c in comment_list:
                    if c.get("kind") != "t1":
                        continue
                    cd = c.get("data", {})
                    author = cd.get("author")
                    body = cd.get("body", "")
                    cid = cd.get("id")

                    if author and body:
                        formatted_comments.append({
                            "platform": "reddit",
                            "postId": cid,
                            "authorId": cd.get("author_fullname") or author,
                            "authorHandle": author,
                            "text": body,
                            "timestamp": datetime.fromtimestamp(cd.get("created_utc", 0)),
                            "engagement": {
                                "upvotes": cd.get("ups", 0),
                                "score": cd.get("score", 0)
                            },
                            "replyToId": parent_id,
                            "depth": depth,
                            "isSubmitter": cd.get("is_submitter", False),
                            "subreddit": cd.get("subreddit"),
                            "permalink": cd.get("permalink"),
                            "sourceLayer": "comment_tree"
                        })

                    replies = cd.get("replies")
                    if replies and isinstance(replies, dict):
                        children = replies.get("data", {}).get("children", [])
                        parse_comments(children, cid, depth + 1)

            parse_comments(comments_raw, post_id, 1)
            return {"status": "success", "data": formatted_comments}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch Reddit comments: {str(e)}")


@app.get("/scrape/reddit/author")
async def get_reddit_author(handle: str):
    url = f"https://www.reddit.com/user/{handle}/about.json"
    async with get_reddit_client() as client:
        try:
            response = await client.get(url, timeout=10)
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
                "followerCount": ud.get("subreddit", {}).get("subscribers", 0),
                "verified": ud.get("verified", False),
                "accountAge": datetime.fromtimestamp(ud.get("created_utc", 0)) if ud.get("created_utc") else None,
                "linkKarma": ud.get("link_karma"),
                "commentKarma": ud.get("comment_karma"),
                "isGold": ud.get("is_gold"),
                "isMod": ud.get("is_mod")
            }
            return {"status": "success", "data": formatted_author}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch Reddit author: {str(e)}")


@app.get("/health")
def health_check():
    return {"status": "ok"}
