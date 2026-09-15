function calculateBreakout(momentum, currentScore, forecastScore) {
    let breakoutProbability = 0;
    
    breakoutProbability += forecastScore * 0.5;

    if (momentum.accelerationDelta > 0) {
        breakoutProbability += 20;
        if (momentum.accelerationDelta > 2) breakoutProbability += 10;
    }

    if (momentum.velocityDelta > 0) breakoutProbability += 10;
    if (momentum.engagementDelta > 100) breakoutProbability += 10;
    if (momentum.crossPlatformSpread) breakoutProbability += 10;

    breakoutProbability = Math.min(100, Math.max(0, breakoutProbability));

    let direction = 'stable';
    if (breakoutProbability >= 80 && momentum.accelerationDelta > 0) {
        direction = 'breakout';
    } else if (forecastScore >= 70 && momentum.velocityDelta > 0) {
        direction = 'strongly_rising';
    } else if (forecastScore >= 50 && momentum.velocityDelta > 0) {
        direction = 'rising';
    } else if (momentum.velocityDelta < 0 && momentum.accelerationDelta < 0) {
        if (currentScore.score > 70) {
            direction = 'weakening';
        } else {
            direction = 'declining';
        }
    }

    return { breakoutProbability: Math.round(breakoutProbability), direction };
}

module.exports = { calculateBreakout };
