function calculateMomentum(currentSnapshot, previousSnapshot) {
    if (!previousSnapshot) {
        return {
            velocityDelta: 0,
            accelerationDelta: 0,
            engagementDelta: 0,
            influenceDelta: 0,
            rankDelta: 0,
            crossPlatformSpread: false
        };
    }

    const velocityDelta = (currentSnapshot.velocity || 0) - (previousSnapshot.velocity || 0);
    const accelerationDelta = (currentSnapshot.acceleration || 0) - (previousSnapshot.acceleration || 0);
    
    const currentEng = currentSnapshot.totalEngagement || 0;
    const prevEng = previousSnapshot.totalEngagement || 0;
    const engagementDelta = currentEng - prevEng;

    const currentInf = currentSnapshot.viralityScore || 0;
    const prevInf = previousSnapshot.viralityScore || 0;
    const influenceDelta = currentInf - prevInf;

    let rankDelta = 0;
    if (currentSnapshot.rank && previousSnapshot.rank) {
        rankDelta = previousSnapshot.rank - currentSnapshot.rank; 
    }

    const currentPlatforms = currentSnapshot.platformCount || 1;
    const prevPlatforms = previousSnapshot.platformCount || 1;
    const crossPlatformSpread = currentPlatforms > prevPlatforms;

    return {
        velocityDelta,
        accelerationDelta,
        engagementDelta,
        influenceDelta,
        rankDelta,
        crossPlatformSpread
    };
}

module.exports = { calculateMomentum };
