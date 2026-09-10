import time
import requests
import sys
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

SCRAPER_API_URL = "http://localhost:8000"
NEXT_API_URL = "http://localhost:3000/api/ingest"
SLEEP_INTERVAL = 60

def run_daemon():
    logging.info("Starting Continuous Scraper Daemon...")
    index = 0

    while True:
        try:
            logging.info("Fetching top 10 trends from X...")
            res = requests.get(f"{SCRAPER_API_URL}/scrape/x/trends", timeout=30)
            res.raise_for_status()
            data = res.json().get('data', [])
            
            if not data:
                logging.warning("No trends returned. Retrying in 60s.")
                time.sleep(SLEEP_INTERVAL)
                continue

            top_10 = data[:10]
            labels = [t['label'] for t in top_10]
            
            target_label = labels[index % len(labels)]
            logging.info(f"Targeting Trend [{index % len(labels)}/10]: {target_label}")

            ingest_payload = {"targetTrendLabel": target_label}
            ingest_res = requests.post(NEXT_API_URL, json=ingest_payload, timeout=300) # Deep scrape can take time
            
            if ingest_res.status_code == 200:
                logging.info(f"Successfully ingested data for {target_label}.")
            else:
                logging.error(f"Ingestion failed with status {ingest_res.status_code}: {ingest_res.text}")

        except Exception as e:
            logging.error(f"Daemon encountered an error: {e}")

        index += 1
        logging.info(f"Sleeping for {SLEEP_INTERVAL} seconds...\n")
        time.sleep(SLEEP_INTERVAL)

if __name__ == "__main__":
    run_daemon()
