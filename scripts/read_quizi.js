// Node.js script to read the `quizi` collection from Firestore.
// Usage:
// 1. Create a Firebase service account JSON and save it as `serviceAccountKey.json` in the project root,
//    or set the environment variable GOOGLE_APPLICATION_CREDENTIALS to the path of the JSON file.
// 2. Run: `npm run read-quizi` or `node scripts/read_quizi.js`.

const fs = require('fs');
const path = require('path');

try {
  const admin = require('firebase-admin');
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '..', 'serviceAccountKey.json');

  if (!fs.existsSync(serviceAccountPath)) {
    console.error('Service account JSON not found at', serviceAccountPath);
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS or place serviceAccountKey.json in the project root.');
    process.exit(1);
  }

  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const db = admin.firestore();

  async function readQuizi() {
    console.log('Reading collection: quizi');
    const snapshot = await db.collection('quizi').get();
    console.log(`Found ${snapshot.size} documents in 'quizi'`);
    snapshot.forEach(doc => {
      console.log('--- DOCUMENT:', doc.id);
      console.dir(doc.data(), { depth: null });
    });
  }

  readQuizi().catch(err => {
    console.error('Error reading quizi collection:', err);
    process.exit(1);
  });
} catch (err) {
  console.error('Please install firebase-admin: npm install firebase-admin --save');
  console.error(err);
  process.exit(1);
}
