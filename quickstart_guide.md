# Quickstart & Setup Guide

Welcome to the Social Media Analytics Framework. This guide will walk you through launching the entire stack locally from the bottom up. 

The architecture consists of three core components that must run concurrently:
1. **The Scraper API** (Python/FastAPI)
2. **The Ingestion Daemon** (Python)
3. **The Analytics Dashboard** (Next.js)

---

## Prerequisites
Ensure you have the following installed on your local machine:
* **Node.js** (v18+) and `npm`
* **Python** (3.9+)
* **Git**

---

## 1. Start the Scraper API
The Scraper API communicates directly with X (Twitter) and Reddit to fetch raw data.

1. Open a new terminal window.
2. Navigate to the `scraper` directory:
   ```bash
   cd scraper
   ```
3. Activate the Python virtual environment:
   ```bash
   source venv/bin/activate
   ```
4. Start the FastAPI server:
   ```bash
   uvicorn main:app --port 8000
   ```
   *(Keep this terminal open and running)*

---

## 2. Start the Background Daemon
The daemon is an infinite loop that automatically polls for trends, triggers the Scraper API, and pushes the parsed data to the database.

1. Open a **second** terminal window.
2. Navigate to the `scraper` directory:
   ```bash
   cd scraper
   ```
3. Activate the virtual environment:
   ```bash
   source venv/bin/activate
   ```
4. Launch the daemon:
   ```bash
   python daemon.py
   ```
   *(Keep this terminal open and running)*

---

## 3. Start the Next.js Frontend
The frontend visualizes the topological and demographic data collected by the daemon.

1. Open a **third** terminal window.
2. Navigate to the `web` directory:
   ```bash
   cd web
   ```
3. Start the Next.js development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to [http://localhost:3000](http://localhost:3000)

---

## Troubleshooting

- **Empty Dashboard?** Ensure both the Scraper API and Daemon are running without errors. It may take up to 2 minutes for the first batch of trends to be fully ingested into the local SQLite database.
- **Port Conflicts?** Ensure port `8000` is free for the Scraper API and port `3000` is free for the Next.js frontend.
- **Missing Dependencies?** If someone is running this for the very first time, they will need to run `npm install` in the `/web` directory and `pip install -r requirements.txt` (if generated) in the `/scraper` directory.
