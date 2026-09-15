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

## ⚙️ How it Calculates Predictions

The forecasting process runs in four sequential phases:

### Phase 1: Momentum Calculation (`momentum.js`)
Calculates the physical momentum of the trend by comparing the `currentSnapshot` against the `previousSnapshot`. It computes `velocityDelta`, `accelerationDelta`, and `influenceDelta`. Crucially, it detects **crossPlatformSpread** if the trend has recently expanded to a new platform.

### Phase 2: Scoring & Extrapolation (`scoring.js`)
Using the calculated momentum, the engine extrapolates the baseline score. The algorithm scales the predicted score upwards for trends exhibiting high positive velocity and acceleration, and penalizes trends showing negative velocity.

### Phase 3: Breakout Analysis (`breakout.js`)
Calculates the probability of a "breakout" event. The logic heavily weights cross-platform spread and extreme acceleration. A trend confined to a single platform requires significantly higher velocity to trigger a high breakout probability compared to a trend spreading across multiple platforms simultaneously.

### Phase 4: Statistical Validation (`statistics.js` & `confidence.js`)
Generates Z-Scores based on the trend's historical mean and standard deviation. This statistical smoothing ensures that predictions are anchored in reality and prevents brief anomalous data spikes from causing wildly inaccurate forecasts. Finally, it assigns a `confidence` level based on the size of the historical data pool.

---

## 🧠 Why This Approach?

By strictly utilizing mathematical modeling, algorithmic heuristics, and statistical analysis rather than Generative AI (LLMs), the forecasting engine guarantees:

1. **Deterministic Accuracy**: The same inputs will consistently yield the exact same forecast.
2. **Zero Latency**: Eliminates the HTTP overhead and generation time associated with LLM inference, allowing thousands of trends to be forecasted in milliseconds.
3. **No Rate Limits**: Completely circumvents API quotas and third-party throttling, enabling infinite horizontal scaling alongside BullMQ.
4. **Cost Efficiency**: Reduces cloud infrastructure overhead by processing forecasts locally on CPU.
