import os
import logging
from dotenv import load_dotenv

load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("scraper")

# ── Feature flags ──────────────────────────────────────────────────────────────
MOCK_MODE: bool = os.getenv("ALLOW_MOCK_FALLBACK", "false").lower() == "true"

# ── X / Twitter ───────────────────────────────────────────────────────────────
X_AUTH_TOKEN: str | None = os.getenv("X_AUTH_TOKEN")
X_CT0: str | None = os.getenv("X_CT0")

# ── Telegram ──────────────────────────────────────────────────────────────────
TELEGRAM_API_ID: str | None = os.getenv("TELEGRAM_API_ID")
TELEGRAM_API_HASH: str | None = os.getenv("TELEGRAM_API_HASH")

# ── Reddit ────────────────────────────────────────────────────────────────────
REDDIT_SESSION: str | None = os.getenv("REDDIT_SESSION")

# ── Classification maps ───────────────────────────────────────────────────────
REGION_MAP: dict[str, str] = {
    "india": "India",
    "mumbai": "Maharashtra", "pune": "Maharashtra", "nagpur": "Maharashtra", "maharashtra": "Maharashtra",
    "delhi": "Delhi", "new delhi": "Delhi", "ncr": "Delhi",
    "bangalore": "Karnataka", "bengaluru": "Karnataka", "karnataka": "Karnataka", "mysore": "Karnataka",
    "hyderabad": "Telangana", "telangana": "Telangana",
    "chennai": "Tamil Nadu", "coimbatore": "Tamil Nadu", "tamil nadu": "Tamil Nadu",
    "kolkata": "West Bengal", "west bengal": "West Bengal",
    "ahmedabad": "Gujarat", "surat": "Gujarat", "gujarat": "Gujarat",
    "jaipur": "Rajasthan", "rajasthan": "Rajasthan",
    "lucknow": "Uttar Pradesh", "kanpur": "Uttar Pradesh", "noida": "Uttar Pradesh",
    "uttar pradesh": "Uttar Pradesh",
    "chandigarh": "Punjab/Haryana", "punjab": "Punjab/Haryana",
    "haryana": "Punjab/Haryana", "gurgaon": "Punjab/Haryana",
    "bhopal": "Madhya Pradesh", "indore": "Madhya Pradesh", "madhya pradesh": "Madhya Pradesh",
    "patna": "Bihar", "bihar": "Bihar",
    "kerala": "Kerala", "kochi": "Kerala", "trivandrum": "Kerala",
    "andhra pradesh": "Andhra Pradesh", "vizag": "Andhra Pradesh",
}

PROFESSION_KEYWORDS: dict[str, list[str]] = {
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

CATEGORY_KEYWORDS: dict[str, list[str]] = {
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

REDDIT_SUBREDDITS: list[str] = [
    "india", "mumbai", "delhi", "bollywood", "unitedstatesofindia",
    "Indiasocial", "IndianStockMarket", "developersIndia", "IndianGaming",
    "BollyBlindsNGossip", "pune", "bangalore", "hyderabad", "kolkata",
]
