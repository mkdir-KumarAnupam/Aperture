function predictScores(history, forecastScore, currentScore) {
    if (history.length < 2) {
        return {
            predictedScore6h: null,
            predictedScore12h: null,
            predictedScore24h: null,
            timeToPeakHours: null
        };
    }

    let alpha = 0.3;
    let smoothedValue = history[history.length - 1].score;
    
    for (let i = history.length - 2; i >= 0; i--) {
        smoothedValue = alpha * history[i].score + (1 - alpha) * smoothedValue;
    }
    
    const recent = history.slice(0, 3);
    const scoreDiff = recent.length > 1 ? recent[0].score - recent[recent.length - 1].score : 0;
    const hoursDiff = recent.length > 1 ? (recent[0].timestamp - recent[recent.length - 1].timestamp) / 3600000 : 1;
    const hourlyRate = hoursDiff > 0 ? scoreDiff / hoursDiff : 0;

    const predict = (hours) => {
        const adjustedRate = hourlyRate * (forecastScore / 50);
        let predicted = currentScore.score + (adjustedRate * hours);
        return Math.round(Math.min(100, Math.max(0, predicted)));
    };

    let timeToPeakHours = null;
    if (hourlyRate > 0) {
        timeToPeakHours = Math.round((100 - currentScore.score) / hourlyRate);
        if (timeToPeakHours > 72) timeToPeakHours = null;
    }

    return {
        predictedScore6h: predict(6),
        predictedScore12h: predict(12),
        predictedScore24h: predict(24),
        timeToPeakHours
    };
}

module.exports = { predictScores };
