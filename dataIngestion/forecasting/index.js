const { calculateMomentum } = require('./momentum');
const { calculateForecastScore } = require('./scoring');
const { calculateBreakout } = require('./breakout');
const { predictScores } = require('./statistics');
const { calculateConfidence } = require('./confidence');

/**
 * Main forecasting orchestrator
 * @param {Object} trendResult - The enriched trend result from trendGlobalStats
 * @param {Array} history - Array of historical snapshots for this trend { score, timestamp, tier }
 */
function generateForecast(trendResult, history) {
    // Determine current snapshot based on trendResult
    const currentSnapshot = {
        score: trendResult.trendScore || 0,
        velocity: trendResult._windows && trendResult._windows["24h"] ? trendResult._windows["24h"].velocity : 0,
        acceleration: trendResult._windows && trendResult._windows["24h"] ? (trendResult._windows["24h"].velocity - (trendResult._windows["7d"] ? trendResult._windows["7d"].velocity : 0)) : 0,
        burstScore: trendResult._overall ? trendResult._overall.burstScore : 0,
        totalEngagement: trendResult.posts ? trendResult.posts.reduce((sum, p) => sum + (p.interactions || 0), 0) : 0,
        viralityScore: trendResult.influence ? trendResult.influence.viralityScore : 0,
        rank: trendResult.globalRanking ? trendResult.globalRanking.leaderboardPosition : null,
        platformCount: trendResult.platformActivity ? Object.keys(trendResult.platformActivity).length : 1,
        timestamp: Date.now()
    };

    // history is ordered newest first. history[0] is the newly pushed current, history[1] is the previous one.
    // Wait, the history from trendGlobalStats is usually passed after it is retrieved, or we can just pass the scoreHistory from globalRanking
    const previousSnapshot = history && history.length > 1 ? history[1] : null;

    // Calculate signals
    const momentum = calculateMomentum(currentSnapshot, previousSnapshot);
    const forecastScore = calculateForecastScore(momentum, currentSnapshot);
    const { breakoutProbability, direction } = calculateBreakout(momentum, currentSnapshot, forecastScore);
    const predictions = predictScores(history, forecastScore, currentSnapshot);
    const confidence = calculateConfidence(history ? history.length : 0);

    let nextLikelyPlatform = null;
    let estimatedSpreadMinutes = null;
    if (momentum.crossPlatformSpread && currentSnapshot.platformCount > 1) {
        nextLikelyPlatform = trendResult.fastestPlatform === 'x' ? 'instagram' : 'reddit';
        estimatedSpreadMinutes = 45; // Heuristic
    }

    const forecast = {
        forecastScore,
        direction,
        breakoutProbability,
        growthProbability6h: Math.round(breakoutProbability * 0.9), // Simplified proxy
        growthProbability24h: Math.round(breakoutProbability * 0.8),
        declineProbability6h: 100 - Math.round(breakoutProbability * 0.9),
        declineProbability24h: 100 - Math.round(breakoutProbability * 0.8),
        ...predictions,
        nextLikelyPlatform,
        estimatedSpreadMinutes,
        confidence,
        timestamp: Date.now()
    };

    const signals = {
        velocity: momentum.velocityDelta,
        acceleration: momentum.accelerationDelta,
        engagementDelta: momentum.engagementDelta,
        influenceDelta: momentum.influenceDelta,
        rankDelta: momentum.rankDelta,
        crossPlatformSpread: momentum.crossPlatformSpread
    };

    return { forecast, signals, currentSnapshot };
}

module.exports = { generateForecast };
