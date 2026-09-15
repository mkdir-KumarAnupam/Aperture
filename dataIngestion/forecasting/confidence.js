const { minimumObservations } = require('./config');

function calculateConfidence(historyLength) {
    if (historyLength < minimumObservations) return 'insufficient_data';
    if (historyLength < 5) return 'low';
    if (historyLength < 10) return 'medium';
    return 'high';
}

module.exports = { calculateConfidence };
