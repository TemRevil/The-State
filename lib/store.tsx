import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as crm from './crm';
import type { Company, Contact, Deal, Activity } from '../types';

// ── In-memory CRM store ──
// Loads each collection ONCE on mount (one getDocs each = 4 reads per session) and
// keeps everything in React state. Mutations write through to Firestore and then
// update local state optimistically — so normal browsing/editing costs almost no
// extra reads, keeping the demo comfortably inside the free tier.

type WithId<T> = T & { id: string };
const stripId = <T extends { id: string }>(e: T) => { const { id, ...rest } = e; void id; return rest; };

interface Store {
  companies: Company[];
  contacts: Contact[];
  deals: Deal[];
  activities: Activity[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;

  addCompany: (d: Omit<Company, 'id' | 'createdAt'>) => Promise<void>;
  saveCompany: (c: Company) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;

  addContact: (d: Omit<Contact, 'id' | 'createdAt'>) => Promise<void>;
  saveContact: (c: Contact) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;

  addDeal: (d: Omit<Deal, 'id' | 'createdAt'>) => Promise<void>;
  saveDeal: (d: Deal) => Promise<void>;
  deleteDeal: (id: string) => Promise<void>;

  addActivity: (d: Omit<Activity, 'id' | 'createdAt'>) => Promise<void>;
  saveActivity: (a: Activity) => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;

  companyName: (id: string) => string;
  contactName: (id: string) => string;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [co, ct, dl, ac] = await Promise.all([
        crm.load.companies(), crm.load.contacts(), crm.load.deals(), crm.load.activities(),
      ]);
      setCompanies(co); setContacts(ct); setDeals(dl); setActivities(ac);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Generic optimistic helpers.
  function makeAdd<T extends { id: string; createdAt: number }>(name: string, setList: React.Dispatch<React.SetStateAction<T[]>>) {
    return async (d: Record<string, unknown>) => {
      const id = await crm.create(name as Parameters<typeof crm.create>[0], d);
      setList((prev) => [{ id, ...d, createdAt: Date.now() } as unknown as T, ...prev]);
    };
  }
  function makeSave<T extends { id: string }>(name: string, setList: React.Dispatch<React.SetStateAction<T[]>>) {
    return async (e: T) => {
      await crm.update(name as Parameters<typeof crm.update>[0], e.id, stripId(e));
      setList((prev) => prev.map((x) => (x.id === e.id ? e : x)));
    };
  }
  function makeDelete<T extends { id: string }>(name: string, setList: React.Dispatch<React.SetStateAction<T[]>>) {
    return async (id: string) => {
      await crm.remove(name as Parameters<typeof crm.remove>[0], id);
      setList((prev) => prev.filter((x) => x.id !== id));
    };
  }

  const value: Store = {
    companies, contacts, deals, activities, loading, error, refresh,

    addCompany: makeAdd('companies', setCompanies) as Store['addCompany'],
    saveCompany: makeSave<Company>('companies', setCompanies),
    deleteCompany: makeDelete<Company>('companies', setCompanies),

    addContact: makeAdd('contacts', setContacts) as Store['addContact'],
    saveContact: makeSave<Contact>('contacts', setContacts),
    deleteContact: makeDelete<Contact>('contacts', setContacts),

    addDeal: makeAdd('deals', setDeals) as Store['addDeal'],
    saveDeal: makeSave<Deal>('deals', setDeals),
    deleteDeal: makeDelete<Deal>('deals', setDeals),

    addActivity: makeAdd('activities', setActivities) as Store['addActivity'],
    saveActivity: makeSave<Activity>('activities', setActivities),
    deleteActivity: makeDelete<Activity>('activities', setActivities),

    companyName: (id) => companies.find((c) => c.id === id)?.name ?? '—',
    contactName: (id) => contacts.find((c) => c.id === id)?.name ?? '—',
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within <StoreProvider>');
  return v;
}

export type { WithId };
