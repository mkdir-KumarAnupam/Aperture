from datetime import datetime
print(datetime.strptime("Mon Sep 14 18:04:29 +0000 2026", "%a %b %d %H:%M:%S %z %Y").isoformat())
