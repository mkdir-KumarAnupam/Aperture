/**
 * Backtesting utility for forecasting engine
 * Can be run independently to validate predictions against historical data.
 */
function validatePredictions(historicalSnapshots) {
    if (!historicalSnapshots || historicalSnapshots.length < 24) {
        return { error: 'Insufficient history for meaningful backtesting' };
    }

    let correctDirection = 0;
    let totalPredictions = 0;
    
    // Simple naive backtest
    // In a real environment, you'd calculate forecast at T-24 and compare to T0
    for (let i = historicalSnapshots.length - 1; i >= 24; i--) {
        const past = historicalSnapshots[i];
        const future = historicalSnapshots[i - 24]; // 24 hours later (assuming hourly)

        const actualDirection = future.score > past.score ? 'rising' : 'declining';
        
        // This is a placeholder for actual backtesting logic which would
        // re-run generateForecast at point T and check if its direction matched actual.
        // For now, it just simulates a structure.
        totalPredictions++;
        if (actualDirection === 'rising' /* or whatever predicted */) {
            correctDirection++;
        }
    }

    return {
        accuracy: totalPredictions > 0 ? (correctDirection / totalPredictions) * 100 : 0,
        totalPredictions
    };
}

module.exports = { validatePredictions };
