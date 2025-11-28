const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { MetricServiceClient } = require('@google-cloud/monitoring');

admin.initializeApp();

const monitoringClient = new MetricServiceClient();

async function getMetricTimeSeries(metricType, days = 30) {
  const projectName = monitoringClient.projectPath('state-a1');
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - days * 24 * 3600;

  const request = {
    name: projectName,
    filter: `metric.type = "${metricType}"`,
    interval: {
      startTime: { seconds: startTime },
      endTime: { seconds: now },
    },
    aggregation: {
      alignmentPeriod: { seconds: 86400 },
      perSeriesAligner: 'ALIGN_SUM',
      crossSeriesReducer: 'REDUCE_SUM',
    },
  };

  try {
    const [timeSeries] = await monitoringClient.listTimeSeries(request);
    const data = [];
    if (timeSeries.length > 0) {
      for (const point of timeSeries[0].points) {
        const date = new Date(point.interval.startTime.seconds * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        let value = point.value.int64Value ? parseInt(point.value.int64Value) : point.value.doubleValue || 0;
        // Convert bytes to MB for storage metrics
        if (metricType.includes('bytes')) {
          value = value / (1024 * 1024);
        }
        data.push({ date, value });
      }
    }
    // Sort by date ascending (oldest first)
    data.sort((a, b) => new Date(a.date) - new Date(b.date));
    return data;
  } catch (error) {
    console.error(`Error fetching ${metricType}:`, error);
    return [];
  }
}

async function checkLimits() {
  // Get current usage
  const [firestoreReads, firestoreWrites] = await Promise.all([
    getMetricTimeSeries('firestore.googleapis.com/document/read_count'),
    getMetricTimeSeries('firestore.googleapis.com/document/write_count'),
  ]);

  const reads = firestoreReads.reduce((sum, p) => sum + p.value, 0);
  const writes = firestoreWrites.reduce((sum, p) => sum + p.value, 0);

  const FIRESTORE_MONTHLY_READS_LIMIT = 1500000; // 1.5M
  const FIRESTORE_MONTHLY_WRITES_LIMIT = 600000; // 600K

  if (reads > FIRESTORE_MONTHLY_READS_LIMIT || writes > FIRESTORE_MONTHLY_WRITES_LIMIT) {
    throw new functions.https.HttpsError('resource-exhausted', 'Firebase free tier limits exceeded. Please upgrade your plan.');
  }
}

exports.getFirebaseUsage = functions.https.onCall(async (data, context) => {
  // Check if user is authenticated and is admin
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    // Get time series data from Cloud Monitoring
    const [firestoreReads, firestoreWrites, firestoreDeletes, storageBytes, storageBandwidth, storageRequests] = await Promise.all([
      getMetricTimeSeries('firestore.googleapis.com/document/read_count'),
      getMetricTimeSeries('firestore.googleapis.com/document/write_count'),
      getMetricTimeSeries('firestore.googleapis.com/document/delete_count'),
      getMetricTimeSeries('storage.googleapis.com/storage/total_bytes'),
      getMetricTimeSeries('storage.googleapis.com/network/sent_bytes_count'),
      getMetricTimeSeries('storage.googleapis.com/api/request_count'),
    ]);

    // Get current storage object count and size
    const bucket = admin.storage().bucket();
    const [files] = await bucket.getFiles();
    let totalSize = 0;
    for (const file of files) {
      totalSize += parseInt(file.metadata.size || '0');
    }

    return {
      firestore: {
        reads: firestoreReads,
        writes: firestoreWrites,
        deletes: firestoreDeletes,
      },
      storage: {
        bytesStored: [{ date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), value: totalSize / (1024 * 1024) }],
        objectCount: files.length,
        bandwidthSent: storageBandwidth,
        requests: storageRequests,
      }
    };
  } catch (error) {
    console.error('Error fetching Firebase usage:', error);
    throw new functions.https.HttpsError('internal', 'Failed to fetch usage data');
  }
});

// API-level limit enforcement functions
exports.createUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  await checkLimits();

  const { number, name, pdfDown } = data;
  try {
    await admin.firestore().collection('Numbers').doc(number).set({
      "Name": name,
      "PDF-Down": pdfDown,
      "Quiz-Enabled": true,
      "Quizi-Times": 0,
      "Devices": {"Devices Allowed": 1},
      "Screened": 0
    });
    return { success: true };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to create user');
  }
});

exports.updateUserQuiz = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  await checkLimits();

  const { number, enabled } = data;
  try {
    await admin.firestore().collection('Numbers').doc(number).update({ "Quiz-Enabled": enabled });
    return { success: true };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to update user');
  }
});

exports.updateUserPdf = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  await checkLimits();

  const { number, enabled } = data;
  try {
    await admin.firestore().collection('Numbers').doc(number).update({ "PDF-Down": enabled });
    return { success: true };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to update user');
  }
});

exports.deleteUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  await checkLimits();

  const { number } = data;
  try {
    await admin.firestore().collection('Numbers').doc(number).delete();
    return { success: true };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to delete user');
  }
});

exports.blockUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  await checkLimits();

  const { number, name, reason } = data;
  const now = new Date();
  try {
    await admin.firestore().collection('Blocked').doc(number).set({
      "Blocked Date": now.toLocaleDateString("en-GB"),
      "Blocked Time": now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }),
      "Reason": reason,
      "Name": name
    });
    return { success: true };
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to block user');
  }
});