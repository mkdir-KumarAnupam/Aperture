const googleTrends = require('google-trends-api');
const countries = require('i18n-iso-countries');
countries.registerLocale(require('i18n-iso-countries/langs/en.json'));

/**
 * Resolve a country name ("India") or an already-valid ISO 3166-1 alpha-2
 * code ("IN") into the geo code Google Trends expects. Pass undefined/null
 * for worldwide trends.
 */
function resolveCountryCode(country) {
  if (!country) return undefined;
  const trimmed = String(country).trim();

  // Already looks like a 2-letter ISO code
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const code = countries.getAlpha2Code(trimmed, 'en');
  if (!code) {
    throw new Error(`Could not resolve country "${country}" to an ISO country code`);
  }
  return code;
}

function round(num) {
  return Math.round(num * 100) / 100;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Google Trends request timed out after ${ms}ms`)), ms)
    ),
  ]);
}

/**
 * Fetch Google Trends "interest over time" for a keyword in a given country
 * and reduce it to a single trend score plus the raw daily/weekly timeline.
 *
 * @param {string} trendLabel - keyword/topic to search for, e.g. "cricket world cup"
 * @param {string} [country] - country name ("India") or ISO alpha-2 code ("IN"). Omit for worldwide.
 * @param {object} [options]
 * @param {string|Date} [options.startTime] - defaults to 12 months before endTime
 * @param {string|Date} [options.endTime] - defaults to now
 * @param {number} [options.category] - Google Trends category id, e.g. 7 = Finance
 * @param {number} [options.timeoutMs] - request timeout in ms, defaults to 15000
 * @returns {Promise<object>} JSON result, see README for shape
 */
async function getGoogleTrendScore(trendLabel, country, options = {}) {
  if (!trendLabel || typeof trendLabel !== 'string') {
    throw new Error('trendLabel is required and must be a string');
  }

  const geo = resolveCountryCode(country);
  const endTime = options.endTime ? new Date(options.endTime) : new Date();
  const startTime = options.startTime
    ? new Date(options.startTime)
    : new Date(new Date(endTime).setMonth(endTime.getMonth() - 12));
  const timeoutMs = options.timeoutMs || 15000;

  let rawResult;
  try {
    rawResult = await withTimeout(
      googleTrends.interestOverTime({
        keyword: trendLabel,
        geo,
        startTime,
        endTime,
        category: options.category,
      }),
      timeoutMs
    );
  } catch (err) {
    throw new Error(`Google Trends request failed for "${trendLabel}" (${geo || 'WORLDWIDE'}): ${err.message}`);
  }

  const parsed = JSON.parse(rawResult);
  const timelineData = parsed && parsed.default ? parsed.default.timelineData || [] : [];

  const values = timelineData.map((point) => Number((point.value && point.value[0]) || 0));

  const timeline = timelineData.map((point) => ({
    date: point.formattedAxisTime,
    timestamp: Number(point.time) * 1000,
    value: Number((point.value && point.value[0]) || 0),
  }));

  const score = values.length
    ? {
        average: round(values.reduce((a, b) => a + b, 0) / values.length),
        latest: values[values.length - 1],
        max: Math.max(...values),
        min: Math.min(...values),
      }
    : { average: 0, latest: 0, max: 0, min: 0 };

  return {
    trendLabel,
    country: {
      input: country || null,
      geo: geo || 'WORLDWIDE',
    },
    range: {
      start: startTime.toISOString().slice(0, 10),
      end: endTime.toISOString().slice(0, 10),
    },
    score,
    timeline,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Fetch Google Trends "interest by region" — the state/city-level breakdown
 * shown as the demographic map on the Trends website (0-100 per region,
 * scaled to the highest-interest region within the result).
 *
 * @param {string} trendLabel - keyword/topic to search for
 * @param {string} [country] - country name or ISO alpha-2 code. Required to get sub-regions.
 * @param {object} [options]
 * @param {string|Date} [options.startTime] - defaults to 12 months before endTime
 * @param {string|Date} [options.endTime] - defaults to now
 * @param {'COUNTRY'|'REGION'|'CITY'|'DMA'} [options.resolution] - granularity, defaults to 'REGION' (states/provinces)
 * @param {number} [options.timeoutMs] - request timeout in ms, defaults to 15000
 * @returns {Promise<object>} JSON result with a `regions` array sorted by interest, highest first
 */
async function getGoogleTrendRegionScore(trendLabel, country, options = {}) {
  if (!trendLabel || typeof trendLabel !== 'string') {
    throw new Error('trendLabel is required and must be a string');
  }

  const geo = resolveCountryCode(country);
  const endTime = options.endTime ? new Date(options.endTime) : new Date();
  const startTime = options.startTime
    ? new Date(options.startTime)
    : new Date(new Date(endTime).setMonth(endTime.getMonth() - 12));
  const resolution = options.resolution || 'REGION';
  const timeoutMs = options.timeoutMs || 15000;

  let rawResult;
  try {
    rawResult = await withTimeout(
      googleTrends.interestByRegion({
        keyword: trendLabel,
        geo,
        startTime,
        endTime,
        resolution,
      }),
      timeoutMs
    );
  } catch (err) {
    throw new Error(`Google Trends region request failed for "${trendLabel}" (${geo || 'WORLDWIDE'}): ${err.message}`);
  }

  const parsed = JSON.parse(rawResult);
  const geoMapData = parsed && parsed.default ? parsed.default.geoMapData || [] : [];

  const regions = geoMapData
    .map((r) => ({
      region: r.geoName,
      geoCode: r.geoCode,
      value: Number((r.value && r.value[0]) || 0),
    }))
    .sort((a, b) => b.value - a.value);

  return {
    trendLabel,
    country: {
      input: country || null,
      geo: geo || 'WORLDWIDE',
    },
    resolution,
    range: {
      start: startTime.toISOString().slice(0, 10),
      end: endTime.toISOString().slice(0, 10),
    },
    regions,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { getGoogleTrendScore, getGoogleTrendRegionScore, resolveCountryCode };