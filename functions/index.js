const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { MetricServiceClient } = require('@google-cloud/monitoring');

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const monitoringClient = new MetricServiceClient();

/**
 * Helper: Fill time gaps with 0
 */
function fillTimeGaps(rawPoints, startTime, endTime, stepSeconds) {
  const filledData = [];
  const rawMap = new Map();

  if (rawPoints) {
    rawPoints.forEach(point => {
      const seconds = Number(point.interval.startTime.seconds);
      let val = 0;
      if (point.value.int64Value) val = Number(point.value.int64Value);
      else if (point.value.doubleValue) val = Number(point.value.doubleValue);
      rawMap.set(seconds, val);
    });
  }

  for (let t = startTime; t <= endTime; t += stepSeconds) {
    let value = 0;
    if (rawMap.has(t)) {
        value = rawMap.get(t);
    } else {
        for (const [key, val] of rawMap.entries()) {
            if (Math.abs(key - t) < stepSeconds / 2) {
                value = val;
                rawMap.delete(key);
                break;
            }
        }
    }
    filledData.push({ timestamp: t * 1000, value: value });
  }
  return filledData;
}

/**
 * Get metric time series
 */
async function getMetricTimeSeries(metricType, startTime, endTime, alignmentSeconds) {
  // REPLACE WITH YOUR PROJECT ID
  const projectId = 'state-a1'; 
  const projectName = monitoringClient.projectPath(projectId);

  const request = {
    name: projectName,
    filter: `metric.type = "${metricType}"`,
    interval: {
      startTime: { seconds: startTime },
      endTime: { seconds: endTime },
    },
    aggregation: {
      alignmentPeriod: { seconds: alignmentSeconds },
      perSeriesAligner: 'ALIGN_SUM',
      crossSeriesReducer: 'REDUCE_SUM',
    },
  };

  try {
    const [timeSeries] = await monitoringClient.listTimeSeries(request);
    let rawPoints = [];
    if (timeSeries.length > 0 && timeSeries[0].points) {
      rawPoints = timeSeries[0].points;
    }
    const processedData = fillTimeGaps(rawPoints, startTime, endTime, alignmentSeconds);
    const totalValue = processedData.reduce((acc, curr) => acc + curr.value, 0);

    return { timeSeries: processedData, total: totalValue };
  } catch (error) {
    console.error(`Error fetching ${metricType}:`, error);
    return { timeSeries: [], total: 0 };
  }
}

/**
 * Helper to gather a specific set of metrics for a time range
 */
async function fetchMetricsForRange(startTime, endTime, alignment) {
  const [reads, writes, deletes, bwSent, bwRecv, requests] = await Promise.all([
    getMetricTimeSeries('firestore.googleapis.com/document/read_count', startTime, endTime, alignment),
    getMetricTimeSeries('firestore.googleapis.com/document/write_count', startTime, endTime, alignment),
    getMetricTimeSeries('firestore.googleapis.com/document/delete_count', startTime, endTime, alignment),
    getMetricTimeSeries('storage.googleapis.com/network/sent_bytes_count', startTime, endTime, alignment),
    getMetricTimeSeries('storage.googleapis.com/network/received_bytes_count', startTime, endTime, alignment),
    getMetricTimeSeries('storage.googleapis.com/api/request_count', startTime, endTime, alignment),
  ]);

  return {
    firestore: {
      reads: reads.total,
      writes: writes.total,
      deletes: deletes.total,
    },
    storage: {
      bandwidth: bwSent.total + bwRecv.total,
      requests: requests.total,
    }
  };
}

exports.getFirebaseUsage = functions.https.onCall(async (data, context) => {
  const { mode = '24h' } = data || {};
  const now = new Date();
  const endTimeSeconds = Math.floor(now.getTime() / 1000);

  // Get Static Storage Size (Always needed)
  let totalBytesStored = 0;
  let fileCount = 0;
  try {
    const bucket = admin.storage().bucket();
    const [files] = await bucket.getFiles(); 
    fileCount = files.length;
    files.forEach(file => {
      totalBytesStored += parseInt(file.metadata.size || '0');
    });
  } catch (e) {
    console.error("Storage bucket check failed", e);
  }

  // --- SPECIAL MODE: LIMIT CHECK ---
  // Returns both Daily (Pacific time) and Monthly (30d) totals
  if (mode === 'limits') {
    // 1. Calculate Monthly (30d) Start
    const startMonthly = endTimeSeconds - (30 * 24 * 3600);
    
    // 2. Calculate Daily (Pacific Midnight) Start
    // Firebase resets quotas at midnight Pacific Time (PT).
    // We calculate the offset (PST is -8, PDT is -7)
    // Simple approach: formatting date to string in specific time zone
    const pacificDateStr = now.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
    const pacificMidnight = new Date(pacificDateStr).getTime(); 
    // Note: new Date("MM/DD/YYYY") assumes local, but we just need the timestamp relative to now roughly, 
    // actually safer to parse the string explicitly or use a library, but for basic node:
    
    // Better vanilla JS Pacific Midnight calculation:
    const getPacificStart = () => {
        const d = new Date();
        const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
        const pacificOffset = -7; // Approximate (DST issues exist, but acceptable for rough quota check) 
        // Or strictly use America/Los_Angeles locale logic:
        const pStr = new Date().toLocaleString("en-US", {timeZone: "America/Los_Angeles"});
        const pDate = new Date(pStr);
        pDate.setHours(0,0,0,0);
        return Math.floor(pDate.getTime() / 1000); // This gives us midnight Pacific in seconds relative to server
    };
    
    const startDaily = getPacificStart();

    const [dailyUsage, monthlyUsage] = await Promise.all([
      fetchMetricsForRange(startDaily, endTimeSeconds, 3600),
      fetchMetricsForRange(startMonthly, endTimeSeconds, 86400)
    ]);

    return {
      mode: 'limits',
      daily: dailyUsage,
      monthly: monthlyUsage,
      storage: {
        bytesStored: totalBytesStored,
        objectCount: fileCount
      }
    };
  }

  // --- STANDARD GRAPHING MODES ---
  let startTimeSeconds;
  let alignmentSeconds;

  if (mode === '24h') {
    startTimeSeconds = endTimeSeconds - (24 * 3600);
    startTimeSeconds -= (startTimeSeconds % 3600); 
    alignmentSeconds = 3600;
  } else if (mode === '7d' || mode === '30d') {
    const days = mode === '7d' ? 7 : 30;
    startTimeSeconds = endTimeSeconds - (days * 24 * 3600);
    startTimeSeconds -= (startTimeSeconds % 86400);
    alignmentSeconds = 86400;
  } else {
    // Default 24h
    startTimeSeconds = endTimeSeconds - (24 * 3600);
    alignmentSeconds = 3600;
  }

  // Re-use the graphing fetch logic
  try {
    const [reads, writes, deletes, bwSent, bwRecv, requests] = await Promise.all([
      getMetricTimeSeries('firestore.googleapis.com/document/read_count', startTimeSeconds, endTimeSeconds, alignmentSeconds),
      getMetricTimeSeries('firestore.googleapis.com/document/write_count', startTimeSeconds, endTimeSeconds, alignmentSeconds),
      getMetricTimeSeries('firestore.googleapis.com/document/delete_count', startTimeSeconds, endTimeSeconds, alignmentSeconds),
      getMetricTimeSeries('storage.googleapis.com/network/sent_bytes_count', startTimeSeconds, endTimeSeconds, alignmentSeconds),
      getMetricTimeSeries('storage.googleapis.com/network/received_bytes_count', startTimeSeconds, endTimeSeconds, alignmentSeconds),
      getMetricTimeSeries('storage.googleapis.com/api/request_count', startTimeSeconds, endTimeSeconds, alignmentSeconds),
    ]);

    return {
      mode,
      firestore: {
        reads: { total: reads.total, data: reads.timeSeries },
        writes: { total: writes.total, data: writes.timeSeries },
        deletes: { total: deletes.total, data: deletes.timeSeries },
      },
      storage: {
        bandwidth: { total: bwSent.total + bwRecv.total, data: bwSent.timeSeries },
        requests: { total: requests.total, data: requests.timeSeries },
        bytesStored: totalBytesStored,
        objectCount: fileCount,
      }
    };
  } catch (error) {
    console.error('Error in getFirebaseUsage:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});