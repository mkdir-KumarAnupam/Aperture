const { weights } = require('./config');

function normalize(value, min, max) {
    if (max === min) return 0;
    const val = Math.max(min, Math.min(max, value));
    return (val - min) / (max - min);
}

function calculateForecastScore(momentum, currentScore) {
    const velocitySignal = normalize(momentum.velocityDelta, -10, 10);
    const accelerationSignal = normalize(momentum.accelerationDelta, -5, 5);
    const burstSignal = normalize(currentScore.burstScore || 0, 0, 100);
    
    const engagementSignal = momentum.engagementDelta > 0 ? normalize(momentum.engagementDelta, 0, 1000) : 0;
    const influenceSignal = momentum.influenceDelta > 0 ? normalize(momentum.influenceDelta, 0, 1) : 0;
    const rankSignal = momentum.rankDelta > 0 ? normalize(momentum.rankDelta, 0, 10) : 0;
    const crossPlatformSignal = momentum.crossPlatformSpread ? 1 : 0;

    const rawScore = 
        (velocitySignal * weights.velocity) +
        (accelerationSignal * weights.acceleration) +
        (burstSignal * weights.burst) +
        (engagementSignal * weights.engagementMomentum) +
        (influenceSignal * weights.influenceMomentum) +
        (rankSignal * weights.rankMomentum) +
        (crossPlatformSignal * weights.crossPlatform);

    return Math.round(rawScore * 100);
}

module.exports = { calculateForecastScore };
