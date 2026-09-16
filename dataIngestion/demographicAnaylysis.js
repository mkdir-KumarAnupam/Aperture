const { getGoogleTrendScore, getGoogleTrendRegionScore } = require('./googleTrendsScraper');

async function googleTrendTimeLine(trendLabel = "Ganesh Chaturthi", country = "India", options = {}) {
  const { startTime, endTime, category } = options;

  try {
    const result = await getGoogleTrendScore(trendLabel, country, {
      startTime,
      endTime,
      category: category ? Number(category) : undefined,
    });
    return result;
  } catch (err) {
    console.error(err.message);
    return null;
  }
}

async function googleTrendRegions(trendLabel = "Ganesh Chaturthi", country = "India", options = {}) {
  const { startTime, endTime } = options;

  try {
    const result = await getGoogleTrendRegionScore(trendLabel, country, { startTime, endTime });

    return result;
  } catch (err) {
    console.error(err.message);
    return null;
  }
}

module.exports = {googleTrendRegions, googleTrendTimeLine};