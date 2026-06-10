// ── CRM domain model ──
// A small but real-world sales CRM: companies, the people at them (contacts),
// deals moving through a pipeline, and follow-up activities.

export type Stage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

export const STAGES: Stage[] = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

export const STAGE_LABEL: Record<Stage, string> = {
  lead: 'Lead',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

export const STAGE_COLOR: Record<Stage, string> = {
  lead: '#64748b',
  qualified: '#3b82f6',
  proposal: '#8b5cf6',
  negotiation: '#f59e0b',
  won: '#22c55e',
  lost: '#ef4444',
};

export type ActivityType = 'call' | 'email' | 'meeting' | 'task';
export const ACTIVITY_TYPES: ActivityType[] = ['call', 'email', 'meeting', 'task'];

export interface Company {
  id: string;
  name: string;
  industry: string;
  size: string;        // e.g. "11-50"
  website: string;
  createdAt: number;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  title: string;
  companyId: string;
  tags: string[];
  createdAt: number;
}

export interface Deal {
  id: string;
  title: string;
  value: number;       // USD
  stage: Stage;
  contactId: string;
  companyId: string;
  closeDate: string;   // YYYY-MM-DD
  createdAt: number;
}

export interface Activity {
  id: string;
  type: ActivityType;
  subject: string;
  due: string;         // YYYY-MM-DD
  done: boolean;
  dealId: string;
  contactId: string;
  createdAt: number;
}

// Field allowlists — kept in sync with firestore.rules validators and the seed
// script so the client never tries to write a field the rules will reject.
export const COMPANY_FIELDS = ['name', 'industry', 'size', 'website', 'createdAt'] as const;
export const CONTACT_FIELDS = ['name', 'email', 'phone', 'title', 'companyId', 'tags', 'createdAt'] as const;
export const DEAL_FIELDS = ['title', 'value', 'stage', 'contactId', 'companyId', 'closeDate', 'createdAt'] as const;
export const ACTIVITY_FIELDS = ['type', 'subject', 'due', 'done', 'dealId', 'contactId', 'createdAt'] as const;
