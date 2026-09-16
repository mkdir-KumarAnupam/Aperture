# Aperture Trend Forecasting Engine

The Forecasting Engine is a deterministic, high-performance module designed to predict the future trajectory of social media trends. By analyzing momentum, historical velocity, and statistical deviations, it provides predictive scoring and breakout probabilities without relying on external LLMs.

---

## 🎯 What it Predicts (Outputs)

The engine produces a structured forecast object saved to Redis (`trend:forecast:<id>`), which contains the following predictive metrics:

### 1. Forecast Metrics
- **`forecastScore`**: The predicted stabilized score for the trend in the immediate future (0-100).
- **`direction`**: The categorical trajectory of the trend (`"rapid_growth"`, `"stable"`, `"decline"`, etc.).
- **`breakoutProbability`**: A percentage (0-100%) indicating the likelihood of the trend experiencing exponential viral growth.
- **`confidence`**: The statistical confidence in the prediction (`"high"`, `"medium"`, `"low"`), largely dependent on the volume of historical data available.

### 2. Time-Horizon Predictions
- **`predictedScore6h` / `12h` / `24h`**: Extrapolated trend scores at specific future time horizons.
- **`growthProbability6h` / `24h`**: The probability that the trend will grow over the respective timeframes.
- **`declineProbability6h` / `24h`**: The probability that the trend will decay or lose relevance over the respective timeframes.

### 3. Spread Analytics
- **`nextLikelyPlatform`**: The most statistically probable platform the trend will cross over into (e.g., from X to Reddit), based on historical migration patterns.
- **`estimatedSpreadMinutes`**: Time estimate for cross-platform virality to manifest.

---

## 📥 What Fields it Takes (Inputs)

The forecasting engine consumes a normalized `currentSnapshot` and an array of `historicalSnapshots`. These are derived directly from the canonical trend pipeline:

- **`score`**: The current aggregated trend score.
- **`velocity`**: The rate of change of the trend's score over the last 24 hours.
- **`acceleration`**: The derivative of velocity (comparing 24h velocity against 7d baseline velocity).
- **`burstScore`**: Measurement of sudden, anomalous spikes in engagement.
- **`totalEngagement`**: Total raw interactions across all tracked posts.
- **`viralityScore`**: The network influence metric derived from cross-platform spread.
- **`rank`**: The trend's current global leaderboard position.
- **`platformCount`**: The number of distinct social platforms currently tracking the trend.

---

## ⚙️ How it Calculates Predictions & File Architecture

The forecasting process is highly modular and runs in a sequential pipeline orchestrated by `index.js`. Here is a breakdown of what each file does:

- **`index.js` (The Orchestrator)**
  Acts as the main entry point. It gathers the trend's current metrics and historical snapshots, structures the data, and passes it through the various physics and statistical modules below in a strict sequence to generate the final forecast object.

- **`momentum.js` (The Physics Engine)**
  Calculates the "physical momentum" of the trend by comparing the current snapshot against the previous snapshot. It computes `velocityDelta` (how fast is it moving?), `accelerationDelta` (is it speeding up or slowing down?), and `influenceDelta`. Crucially, it detects **crossPlatformSpread** if the trend has recently migrated to a new platform.

- **`scoring.js` (The Extrapolator)**
  Takes the raw momentum and uses our core heuristic algorithm to extrapolate a baseline predicted score. It scales the score upwards for trends exhibiting high positive velocity/acceleration, and aggressively penalizes trends showing negative velocity (burnout).

- **`breakout.js` (The Viral Detector)**
  Calculates the exact probability (0-100%) of a "breakout" event. The logic heavily weights cross-platform spread and extreme acceleration. A trend confined to a single platform requires significantly higher velocity to trigger a high breakout probability compared to a trend spreading across multiple platforms simultaneously. It also categorizes the trajectory direction (e.g., `"rapid_growth"`, `"stable"`, `"decline"`).

- **`statistics.js` (The Smoother & Time-Horizon Predictor)**
  Prevents brief anomalous data spikes from causing wildly inaccurate forecasts. It generates Z-Scores based on the trend's historical mean and standard deviation. It uses this statistical smoothing to predict exact scores at future time horizons (6h, 12h, 24h).

- **`confidence.js` (The Validator)**
  Evaluates the statistical confidence of the forecast (`"high"`, `"medium"`, `"low"`). A forecast based on 7 days of rich historical data gets a high confidence rating, whereas a trend discovered 10 minutes ago gets a low confidence rating due to a lack of baseline data.

- **`config.js` & `backtesting.js` (The Tuning & Validation Utilities)**
  `config.js` holds the weights, thresholds, and mathematical constants used by the engine. `backtesting.js` provides utility functions to compare the engine's past predictions against what actually happened, allowing continuous mathematical tuning of the model.

---

## 🏆 How to Pitch This to SIH Judges (The "Wow" Factor)

When presenting this engine to the Smart India Hackathon (SIH) judges, you want to emphasize **Efficiency, Scalability, and Mathematical Rigor**. Do not just call it an "AI Predictor"—frame it as a **Deterministic Physics Engine for Social Data**. 

Here are the key talking points to impress them:

### 1. "We didn't just wrap an LLM API; we built a Math-driven Engine."
> *"Judges, while it’s easy to send data to an LLM and ask for a prediction, doing so is slow, expensive, and non-deterministic. We built a custom forecasting engine from scratch using physics concepts—velocity, acceleration, and momentum. Our engine predicts virality using pure mathematics and Z-score statistics."*

### 2. "Zero-Latency and Infinite Scalability"
> *"Because this engine runs locally on pure CPU logic and doesn't wait on third-party AI APIs, our latency is effectively zero. We can forecast the trajectory of 10,000 active trends in milliseconds. This is crucial for a real-time OSINT/Threat-intelligence platform where every second counts."*

### 3. "Cross-Platform Infection Modeling"
> *"Our breakout algorithm is uniquely designed for the modern internet. It doesn't just look at how fast a trend is growing; it specifically detects 'cross-platform spread'. Our engine knows that a trend spreading from X (Twitter) to Reddit is significantly more dangerous and viral than a trend isolated to just one platform, and it weights the breakout probability accordingly."*

### 4. "Self-Aware Confidence Scoring"
> *"Most predictive models suffer from hallucinations or overconfidence on new data. Our model is self-aware. By calculating standard deviation over a historical timeline, it explicitly tells the user its 'Confidence Level'. If a trend just started 10 minutes ago, the engine tells the user 'Low Confidence', preventing the system from overreacting to anomalies."*
