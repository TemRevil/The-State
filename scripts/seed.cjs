/* Seeds the `state-a1` project with a demo user + realistic fake CRM data.
 * Runs with the Admin SDK (bypasses security rules). Idempotent: clears the four
 * CRM collections first, then reseeds.
 *
 *   node scripts/seed.cjs
 *
 * Requires the gitignored service-account key in the repo root.
 */
const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', 'state-a1-firebase-adminsdk-fbsvc-7b61553f35.json'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: 'state-a1' });

const db = admin.firestore();
const auth = admin.auth();

const DEMO = { email: 'demo@thestate.app', password: 'demo12345' };

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pickN = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n);
const daysFromNow = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

const COMPANIES = [
  { name: 'Northwind Logistics', industry: 'Logistics', size: '201-500', website: 'northwind.example.com' },
  { name: 'Aperture Analytics', industry: 'Software', size: '51-200', website: 'aperture.example.com' },
  { name: 'Bluewave Energy', industry: 'Energy', size: '500+', website: 'bluewave.example.com' },
  { name: 'Meridian Health', industry: 'Healthcare', size: '500+', website: 'meridianhealth.example.com' },
  { name: 'Cobalt Retail Group', industry: 'Retail', size: '201-500', website: 'cobaltretail.example.com' },
  { name: 'Solstice Media', industry: 'Media', size: '11-50', website: 'solstice.example.com' },
  { name: 'Ironclad Security', industry: 'Cybersecurity', size: '51-200', website: 'ironclad.example.com' },
  { name: 'Verdant Foods', industry: 'Food & Bev', size: '201-500', website: 'verdant.example.com' },
  { name: 'Quanta Finance', industry: 'Finance', size: '500+', website: 'quanta.example.com' },
  { name: 'Lumen Education', industry: 'Education', size: '11-50', website: 'lumen.example.com' },
];

const FIRST = ['James', 'Mariam', 'Omar', 'Sofia', 'David', 'Aisha', 'Noah', 'Lina', 'Yusuf', 'Elena', 'Karim', 'Hana', 'Liam', 'Nadia', 'Tariq', 'Clara'];
const LAST = ['Hassan', 'Chen', 'Okafor', 'Rossi', 'Khan', 'Mbeki', 'Larsson', 'Saleh', 'Garcia', 'Novak', 'Farah', 'Ito', 'Brooks', 'Haddad'];
const TITLES = ['Procurement Lead', 'CTO', 'Operations Manager', 'Head of Sales', 'Finance Director', 'IT Manager', 'Founder', 'VP Marketing', 'Account Director'];
const TAGS = ['decision-maker', 'champion', 'inbound', 'referral', 'enterprise', 'smb', 'cold', 'warm', 'technical', 'budget-holder'];
const STAGES = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const DEAL_NOUNS = ['Platform Rollout', 'Annual Licence', 'Pilot Program', 'Infrastructure Upgrade', 'Support Contract', 'Expansion Deal', 'Onboarding Package', 'Migration Project'];
const ACT_TYPES = ['call', 'email', 'meeting', 'task'];
const ACT_SUBJECTS = {
  call: ['Discovery call', 'Follow-up call', 'Check-in call', 'Pricing discussion'],
  email: ['Send proposal', 'Share case study', 'Reply to RFP', 'Intro email'],
  meeting: ['Demo meeting', 'Kickoff meeting', 'Quarterly review', 'Stakeholder sync'],
  task: ['Prepare quote', 'Update CRM notes', 'Draft contract', 'Send invoice'],
};

async function clearCollection(name) {
  const snap = await db.collection(name).get();
  let batch = db.batch();
  let n = 0;
  for (const d of snap.docs) {
    batch.delete(d.ref);
    if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  return snap.size;
}

async function ensureDemoUser() {
  try {
    const u = await auth.getUserByEmail(DEMO.email);
    await auth.updateUser(u.uid, { password: DEMO.password });
    return `updated ${DEMO.email}`;
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      await auth.createUser({ email: DEMO.email, password: DEMO.password, displayName: 'Demo User' });
      return `created ${DEMO.email}`;
    }
    throw e;
  }
}

async function main() {
  console.log('Demo user:', await ensureDemoUser());

  for (const c of ['activities', 'deals', 'contacts', 'companies']) {
    console.log(`cleared ${await clearCollection(c)} from ${c}`);
  }

  const now = Date.now();
  // Companies
  const companyIds = [];
  for (const c of COMPANIES) {
    const ref = db.collection('companies').doc();
    await ref.set({ ...c, createdAt: now - Math.floor(Math.random() * 60) * 86400000 });
    companyIds.push(ref.id);
  }

  // Contacts (2-3 per company)
  const contacts = [];
  for (const companyId of companyIds) {
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      const ref = db.collection('contacts').doc();
      const data = {
        name,
        email: `${name.toLowerCase().replace(/[^a-z]/g, '.')}@example.com`,
        phone: `+1 (555) ${100 + Math.floor(Math.random() * 900)}-${1000 + Math.floor(Math.random() * 9000)}`,
        title: pick(TITLES),
        companyId,
        tags: pickN(TAGS, 1 + Math.floor(Math.random() * 2)),
        createdAt: now - Math.floor(Math.random() * 45) * 86400000,
      };
      await ref.set(data);
      contacts.push({ id: ref.id, companyId });
    }
  }

  // Deals (one per ~contact, spread across stages)
  const deals = [];
  for (let i = 0; i < 18; i++) {
    const contact = pick(contacts);
    const ref = db.collection('deals').doc();
    const data = {
      title: `${pick(COMPANIES).name.split(' ')[0]} — ${pick(DEAL_NOUNS)}`,
      value: (5 + Math.floor(Math.random() * 120)) * 1000,
      stage: pick(STAGES),
      contactId: contact.id,
      companyId: contact.companyId,
      closeDate: daysFromNow(Math.floor(Math.random() * 60) - 10),
      createdAt: now - Math.floor(Math.random() * 30) * 86400000,
    };
    await ref.set(data);
    deals.push({ id: ref.id, contactId: contact.id });
  }

  // Activities
  for (let i = 0; i < 24; i++) {
    const deal = pick(deals);
    const type = pick(ACT_TYPES);
    await db.collection('activities').doc().set({
      type,
      subject: pick(ACT_SUBJECTS[type]),
      due: daysFromNow(Math.floor(Math.random() * 21) - 7),
      done: Math.random() < 0.4,
      dealId: deal.id,
      contactId: deal.contactId,
      createdAt: now - Math.floor(Math.random() * 14) * 86400000,
    });
  }

  console.log(`Seeded ${companyIds.length} companies, ${contacts.length} contacts, ${deals.length} deals, 24 activities.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
