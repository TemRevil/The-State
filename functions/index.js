const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { MetricServiceClient } = require('@google-cloud/monitoring');

admin.initializeApp();

const monitoringClient = new MetricServiceClient();

// Free tier limits
const LIMITS = {
  firestore: {
    daily: {
      reads: 50000,
      writes: 20000,
      deletes: 20000
    }
  },
  storage: {
    daily: {
      bandwidth: 1024 * 1024 * 1024, // 1 GB in bytes
      operations: 20000
    },
    total: {
      stored: 5 * 1024 * 1024 * 1024 // 5 GB in bytes
    }
  },
  functions: {
    monthly: {
      invocations: 2000000,
      gbSeconds: 400000,
      cpuSeconds: 200000,
      network: 5 * 1024 * 1024 * 1024 // 5 GB in bytes
    }
  }
};

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

async function getCurrentUsage() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Get daily usage (last 24 hours)
  const [firestoreReadsDaily, firestoreWritesDaily, firestoreDeletesDaily, storageBandwidthDaily, storageRequestsDaily] = await Promise.all([
    getMetricTimeSeries('firestore.googleapis.com/document/read_count', 1),
    getMetricTimeSeries('firestore.googleapis.com/document/write_count', 1),
    getMetricTimeSeries('firestore.googleapis.com/document/delete_count', 1),
    getMetricTimeSeries('storage.googleapis.com/network/sent_bytes_count', 1),
    getMetricTimeSeries('storage.googleapis.com/api/request_count', 1),
  ]);

  // Get monthly usage (last 30 days)
  const [functionsInvocationsMonthly, functionsGbSecondsMonthly, functionsCpuSecondsMonthly, functionsNetworkMonthly] = await Promise.all([
    getMetricTimeSeries('cloudfunctions.googleapis.com/function/execution_count', 30),
    getMetricTimeSeries('cloudfunctions.googleapis.com/function/execution_time', 30), // in seconds, need to convert to GB-seconds
    getMetricTimeSeries('cloudfunctions.googleapis.com/function/cpu_time', 30), // in seconds
    getMetricTimeSeries('cloudfunctions.googleapis.com/function/network_egress', 30), // in bytes
  ]);

  // Sum daily usage
  const sumArray = (arr) => arr.reduce((sum, item) => sum + item.value, 0);
  const dailyUsage = {
    firestore: {
      reads: sumArray(firestoreReadsDaily),
      writes: sumArray(firestoreWritesDaily),
      deletes: sumArray(firestoreDeletesDaily)
    },
    storage: {
      bandwidth: sumArray(storageBandwidthDaily),
      operations: sumArray(storageRequestsDaily)
    }
  };

  // Sum monthly usage
  const monthlyUsage = {
    functions: {
      invocations: sumArray(functionsInvocationsMonthly),
      gbSeconds: sumArray(functionsGbSecondsMonthly), // execution_time in seconds, treat as GB-seconds for approximation
      cpuSeconds: sumArray(functionsCpuSecondsMonthly),
      network: sumArray(functionsNetworkMonthly)
    }
  };

  // Get current storage stored
  const bucket = admin.storage().bucket();
  const [files] = await bucket.getFiles();
  let totalStored = 0;
  for (const file of files) {
    totalStored += parseInt(file.metadata.size || '0');
  }


  return {
    daily: dailyUsage,
    monthly: monthlyUsage,
    storageStored: totalStored
  };
}

async function checkLimits(operation) {
  const usage = await getCurrentUsage();

  let limitExceeded = false;
  let reason = '';

  // Check daily limits
  if (operation.firestore) {
    if (usage.daily.firestore.reads + (operation.firestore.reads || 0) > LIMITS.firestore.daily.reads) {
      limitExceeded = true;
      reason = 'Firestore daily read limit exceeded.';
    }
    if (usage.daily.firestore.writes + (operation.firestore.writes || 0) > LIMITS.firestore.daily.writes) {
      limitExceeded = true;
      reason = 'Firestore daily write limit exceeded.';
    }
    if (usage.daily.firestore.deletes + (operation.firestore.deletes || 0) > LIMITS.firestore.daily.deletes) {
      limitExceeded = true;
      reason = 'Firestore daily delete limit exceeded.';
    }
  }

  if (operation.storage) {
    if (usage.daily.storage.bandwidth + (operation.storage.bandwidth || 0) > LIMITS.storage.daily.bandwidth) {
      limitExceeded = true;
      reason = 'Storage daily bandwidth limit exceeded.';
    }
    if (usage.daily.storage.operations + (operation.storage.operations || 0) > LIMITS.storage.daily.operations) {
      limitExceeded = true;
      reason = 'Storage daily operations limit exceeded.';
    }
    if (usage.storageStored + (operation.storage.stored || 0) > LIMITS.storage.total.stored) {
      limitExceeded = true;
      reason = 'Storage total stored limit exceeded.';
    }
  }

  if (operation.functions) {
    if (usage.monthly.functions.invocations + (operation.functions.invocations || 0) > LIMITS.functions.monthly.invocations) {
      limitExceeded = true;
      reason = 'Functions monthly invocations limit exceeded.';
    }
    if (usage.monthly.functions.gbSeconds + (operation.functions.gbSeconds || 0) > LIMITS.functions.monthly.gbSeconds) {
      limitExceeded = true;
      reason = 'Functions monthly GB-seconds limit exceeded.';
    }
    if (usage.monthly.functions.cpuSeconds + (operation.functions.cpuSeconds || 0) > LIMITS.functions.monthly.cpuSeconds) {
      limitExceeded = true;
      reason = 'Functions monthly CPU-seconds limit exceeded.';
    }
    if (usage.monthly.functions.network + (operation.functions.network || 0) > LIMITS.functions.monthly.network) {
      limitExceeded = true;
      reason = 'Functions monthly network limit exceeded.';
    }
  }

  if (limitExceeded) {
    // Set shutdown flag in Firestore
    try {
      await admin.firestore().collection('config').doc('shutdown').set({
        shutdown: true,
        reason: reason,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Failed to set shutdown flag:', error);
    }
    throw new Error(reason + ' Project shutdown initiated.');
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

exports.createUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { number, name, pdfDown } = data;
  try {
    await admin.firestore().collection('Numbers').doc(number).set({
      "Name": name,
      "PDF-Down": pdfDown,
      "Quiz-Enabled": true,
      "Quizi-Times": 0,
      "Devices": {},
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