import {
  collection, doc, getDocs, writeBatch, serverTimestamp, increment, query, orderBy,
} from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import type { Company, Contact, Deal, Activity } from '../types';

// ── Free-tier guardrails ──
// Firestore Spark (free) plan: ~20k writes/day, ~50k reads/day. Two protections
// keep us safely under that:
//   1. SERVER (rules): every mutation is committed in a batch alongside a write to
//      usage/{uid} that stamps lastWrite = serverTimestamp(). The security rules
//      reject the mutation unless >= COOLDOWN_MS elapsed since the previous write
//      → a tight write loop is structurally impossible.
//   2. CLIENT (here): a per-day write budget in localStorage hard-stops the UI well
//      before the daily quota, with a friendly message.
// Reads are kept low by loading each collection ONCE via getDocs and mutating local
// React state optimistically afterwards (no always-on snapshot listeners).

const DAILY_WRITE_BUDGET = 300;

const todayKey = () => new Date().toISOString().slice(0, 10);

function checkClientBudget() {
  const key = `crm_writes_${todayKey()}`;
  const used = Number(localStorage.getItem(key) || '0');
  if (used >= DAILY_WRITE_BUDGET) {
    throw new Error('Daily demo write budget reached — try again tomorrow (keeps this demo inside Firebase’s free tier).');
  }
  return key;
}
function bumpClientBudget(key: string) {
  localStorage.setItem(key, String(Number(localStorage.getItem(key) || '0') + 1));
}

export function writesUsedToday() {
  return Number(localStorage.getItem(`crm_writes_${todayKey()}`) || '0');
}
export const DAILY_BUDGET = DAILY_WRITE_BUDGET;

type Coll = 'companies' | 'contacts' | 'deals' | 'activities';

// All mutations funnel through here so the usage ledger is always part of the batch
// (the rules require it). `apply` receives the batch + the usage ref to write to.
async function mutate(apply: (batch: ReturnType<typeof writeBatch>) => void) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in.');
  const budgetKey = checkClientBudget();
  const batch = writeBatch(db);
  apply(batch);
  batch.set(
    doc(db, 'usage', uid),
    { day: todayKey(), count: increment(1), lastWrite: serverTimestamp() },
    { merge: true },
  );
  await batch.commit();
  bumpClientBudget(budgetKey);
}

// ── Reads (one-time) ──
async function loadAll<T>(name: Coll): Promise<T[]> {
  const snap = await getDocs(query(collection(db, name), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as T[];
}

export const load = {
  companies: () => loadAll<Company>('companies'),
  contacts: () => loadAll<Contact>('contacts'),
  deals: () => loadAll<Deal>('deals'),
  activities: () => loadAll<Activity>('activities'),
};

// ── Writes ──
// create() returns the new id so callers can update local state without a re-read.
export async function create(name: Coll, data: Record<string, unknown>): Promise<string> {
  const ref = doc(collection(db, name));
  await mutate((b) => b.set(ref, { ...data, createdAt: Date.now() }));
  return ref.id;
}

export async function update(name: Coll, id: string, data: Record<string, unknown>): Promise<void> {
  // We send the full document (createdAt preserved by the caller) because the rules
  // validate the complete field set via hasOnly(...).
  await mutate((b) => b.set(doc(db, name, id), data));
}

export async function remove(name: Coll, id: string): Promise<void> {
  await mutate((b) => b.delete(doc(db, name, id)));
}
