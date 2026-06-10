import React, { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useStore } from '../../lib/store';
import {
  Modal,
  Field,
  TextInput,
  Select,
  DatePicker,
  Button,
  PageHeader,
  money,
  type Option,
} from '../../lib/ui';
import {
  type Deal,
  type Stage,
  STAGES,
  STAGE_LABEL,
  STAGE_COLOR,
} from '../../types';

// ── Deals — kanban pipeline ──
// Columns per Stage; each card opens an edit modal. Moving a deal between
// stages is done via the stage Select inside that modal.

const today = () => new Date().toISOString().slice(0, 10);

type Draft = {
  title: string;
  value: number;
  stage: Stage;
  companyId: string;
  contactId: string;
  closeDate: string;
};

const STAGE_OPTIONS: Option[] = STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }));

export default function Deals() {
  const store = useStore();
  const { deals, companies, contacts, companyName, contactName } = store;

  // editing === null  → closed
  // editing === 'new' → create modal
  // editing === Deal  → edit that deal
  const [editing, setEditing] = useState<Deal | 'new' | null>(null);

  // Open pipeline = everything that isn't won/lost.
  const openValue = useMemo(
    () =>
      deals
        .filter((d) => d.stage !== 'won' && d.stage !== 'lost')
        .reduce((sum, d) => sum + (d.value || 0), 0),
    [deals],
  );

  const byStage = useMemo(() => {
    const map = {} as Record<Stage, Deal[]>;
    for (const s of STAGES) map[s] = [];
    for (const d of deals) (map[d.stage] ?? (map[d.stage] = [])).push(d);
    return map;
  }, [deals]);

  return (
    <div>
      <PageHeader
        title="Deals"
        subtitle={`${money(openValue)} open pipeline`}
        action={
          <Button onClick={() => setEditing('new')}>
            <Plus size={16} /> New deal
          </Button>
        }
      />

      <div className="kanban">
        {STAGES.map((stage) => {
          const list = byStage[stage] ?? [];
          const colValue = list.reduce((sum, d) => sum + (d.value || 0), 0);
          return (
            <div className="kanban-col" key={stage}>
              <div className="kanban-col-head">
                <span className="dot" style={{ background: STAGE_COLOR[stage] }} />
                <span>{STAGE_LABEL[stage]}</span>
                <span className="count">{list.length}</span>
                <span className="sum tnum">{money(colValue)}</span>
              </div>
              {list.map((d) => (
                <div
                  className="deal-card"
                  key={d.id}
                  onClick={() => setEditing(d)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setEditing(d);
                    }
                  }}
                >
                  <div className="deal-title">{d.title}</div>
                  <div className="deal-meta">
                    {companyName(d.companyId)} · {contactName(d.contactId)}
                  </div>
                  <div className="deal-value tnum">{money(d.value)}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {editing !== null && (
        <DealModal
          deal={editing === 'new' ? null : editing}
          companies={companies}
          contacts={contacts}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function DealModal({
  deal,
  companies,
  contacts,
  onClose,
}: {
  deal: Deal | null;
  companies: ReturnType<typeof useStore>['companies'];
  contacts: ReturnType<typeof useStore>['contacts'];
  onClose: () => void;
}) {
  const { addDeal, saveDeal, deleteDeal } = useStore();

  const [draft, setDraft] = useState<Draft>(() =>
    deal
      ? {
          title: deal.title,
          value: deal.value,
          stage: deal.stage,
          companyId: deal.companyId,
          contactId: deal.contactId,
          closeDate: deal.closeDate,
        }
      : {
          title: '',
          value: 0,
          stage: 'lead',
          companyId: companies[0]?.id ?? '',
          contactId: contacts[0]?.id ?? '',
          closeDate: today(),
        },
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Draft>(key: K, val: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: val }));

  const companyOptions = useMemo<Option[]>(
    () => companies.map((c) => ({ value: c.id, label: c.name })),
    [companies],
  );
  const contactOptions = useMemo<Option[]>(
    () => contacts.map((c) => ({ value: c.id, label: c.name })),
    [contacts],
  );

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (deal) {
        await saveDeal({ ...deal, ...draft });
      } else {
        await addDeal({ ...draft });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save deal.');
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deal) return;
    setBusy(true);
    setError(null);
    try {
      await deleteDeal(deal.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete deal.');
      setBusy(false);
    }
  };

  return (
    <Modal
      title={deal ? 'Edit deal' : 'New deal'}
      onClose={onClose}
      footer={
        <>
          {deal && (
            <Button variant="danger" onClick={remove} disabled={busy}>
              Delete
            </Button>
          )}
          <Button onClick={save} disabled={busy}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Title">
        <TextInput
          value={draft.title}
          onChange={(e) => set('title', e.target.value)}
          autoFocus
        />
      </Field>

      <Field label="Value (USD)">
        <TextInput
          type="number"
          inputMode="decimal"
          min={0}
          value={draft.value}
          onChange={(e) => set('value', Number(e.target.value))}
        />
      </Field>

      <Field label="Stage">
        <Select
          value={draft.stage}
          onChange={(v) => set('stage', v as Stage)}
          options={STAGE_OPTIONS}
          ariaLabel="Stage"
        />
      </Field>

      <Field label="Company">
        <Select
          value={draft.companyId}
          onChange={(v) => set('companyId', v)}
          options={companyOptions}
          placeholder="—"
          ariaLabel="Company"
        />
      </Field>

      <Field label="Contact">
        <Select
          value={draft.contactId}
          onChange={(v) => set('contactId', v)}
          options={contactOptions}
          placeholder="—"
          ariaLabel="Contact"
        />
      </Field>

      <Field label="Close date">
        <DatePicker
          value={draft.closeDate}
          onChange={(v) => set('closeDate', v)}
          ariaLabel="Close date"
        />
      </Field>

      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}
