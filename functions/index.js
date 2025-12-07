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
    // Look for data point within half a step
    for (const [key, val] of rawMap.entries()) {
      if (Math.abs(key - t) < stepSeconds / 2) {
        value = val;
        rawMap.delete(key);
        break;
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
  const projectId = 'state-a1'; // Ensure this is your correct Project ID
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

exports.getFirebaseUsage = functions.https.onCall(async (data, context) => {
  const { mode = '24h' } = data || {};
  const now = new Date();
  const endTimeSeconds = Math.floor(now.getTime() / 1000);

  // --- PACIFIC TIME HELPER ---
  // Returns the timestamp (seconds) for Midnight Pacific Time today
  const getPacificMidnight = () => {
    // 1. Get current time in Pacific as a string
    const pacificDateStr = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
    // 2. Create a Date object from that string 
    const pDate = new Date(pacificDateStr);
    // 3. Set to midnight
    pDate.setHours(0, 0, 0, 0);
    // 4. Return timestamp
    return Math.floor(pDate.getTime() / 1000);
  };

  // Returns the timestamp (seconds) for the 1st of the month Pacific Time
  const getPacificMonthStart = () => {
    const pacificDateStr = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
    const pDate = new Date(pacificDateStr);
    pDate.setDate(1);
    pDate.setHours(0, 0, 0, 0);
    return Math.floor(pDate.getTime() / 1000);
  }

  let startTimeSeconds;
  let alignmentSeconds;

  // --- MODE LOGIC ---
  switch (mode) {
    case 'quota':
      // Start exactly at Pacific Midnight today
      startTimeSeconds = getPacificMidnight();
      alignmentSeconds = 3600; // Hourly data points
      break;

    case 'billing':
      // Start at 1st of the month (Pacific)
      startTimeSeconds = getPacificMonthStart();
      alignmentSeconds = 86400; // Daily data points
      break;

    case '7d':
      startTimeSeconds = endTimeSeconds - (7 * 24 * 3600);
      alignmentSeconds = 86400; // Daily
      break;

    case '30d':
      startTimeSeconds = endTimeSeconds - (30 * 24 * 3600);
      alignmentSeconds = 86400; // Daily
      break;

    case '24h':
    default:
      startTimeSeconds = endTimeSeconds - (24 * 3600);
      alignmentSeconds = 3600; // Hourly
      break;
  }

  // Safety: Ensure start is not in future
  if (startTimeSeconds >= endTimeSeconds) {
    startTimeSeconds = endTimeSeconds - 3600;
  }

  // Get Storage Snapshot (Static)
  let totalBytesStored = 0;
  let fileCount = 0;
  try {
    const bucket = admin.storage().bucket();
    // Note: getFiles() can be slow if you have thousands of files.
    const [files] = await bucket.getFiles();
    fileCount = files.length;
    files.forEach(file => {
      totalBytesStored += parseInt(file.metadata.size || '0');
    });
  } catch (e) {
    console.error("Storage check failed", e);
  }

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
      meta: {
        startTime: startTimeSeconds,
        endTime: endTimeSeconds,
        alignment: alignmentSeconds
      },
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error in getFirebaseUsage:', errorMessage, error);
    throw new functions.https.HttpsError('internal', errorMessage || 'Unknown error occurred');
  }
});