const FORECAST_CONFIG = {
    horizons: [6, 12, 24],
    weights: {
        velocity: 0.25,
        acceleration: 0.20,
        burst: 0.15,
        engagementMomentum: 0.15,
        influenceMomentum: 0.10,
        rankMomentum: 0.10,
        crossPlatform: 0.05
    },
    thresholds: {
        breakout: 80
    },
    minimumObservations: 2,
    historyRetention: 100 // Number of history snapshots to retain
};

module.exports = FORECAST_CONFIG;
