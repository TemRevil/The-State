import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Phone, Mail, Calendar, CheckSquare } from 'lucide-react';
import { useStore } from '../../lib/store';
import {
  Modal,
  Field,
  TextInput,
  Select,
  SegmentedControl,
  DatePicker,
  Checkbox,
  Button,
  EmptyState,
  PageHeader,
} from '../../lib/ui';
import type { Option } from '../../lib/ui';
import { ACTIVITY_TYPES } from '../../types';
import type { Activity, ActivityType } from '../../types';

// ── Activities ──
// A follow-up task list: calls, emails, meetings and generic tasks. Open items
// float to the top (sorted by due date); checking one off writes through the
// store so it persists. Create/edit happens in a modal.

const TYPE_LABEL: Record<ActivityType, string> = {
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
  task: 'Task',
};

function TypeIcon({ type }: { type: ActivityType }) {
  switch (type) {
    case 'call': return <Phone size={16} strokeWidth={1.75} />;
    case 'email': return <Mail size={16} strokeWidth={1.75} />;
    case 'meeting': return <Calendar size={16} strokeWidth={1.75} />;
    case 'task': return <CheckSquare size={16} strokeWidth={1.75} />;
  }
}

// Segmented control options for the activity type, each with its lucide icon.
const TYPE_OPTIONS = ACTIVITY_TYPES.map((t) => ({
  value: t,
  label: TYPE_LABEL[t],
  icon: <TypeIcon type={t} />,
}));

const fmtDue = (s: string) => {
  if (!s) return 'No due date';
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return s;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const today = () => new Date().toISOString().slice(0, 10);

type Draft = Omit<Activity, 'id' | 'createdAt'>;

const emptyDraft = (): Draft => ({
  type: 'task',
  subject: '',
  due: today(),
  done: false,
  dealId: '',
  contactId: '',
});

export default function Activities() {
  const store = useStore();
  const { activities, deals, contacts, contactName, addActivity, saveActivity, deleteActivity } = store;

  const [editing, setEditing] = useState<Activity | null>(null); // the activity being edited (null = none)
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...activities].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1; // open first
        return a.due.localeCompare(b.due);             // then due ascending
      }),
    [activities],
  );

  const openCount = useMemo(() => activities.filter((a) => !a.done).length, [activities]);

  // Empty option ('' → None) prepended to the related-entity selects.
  const dealOptions: Option[] = useMemo(
    () => [{ value: '', label: 'None' }, ...deals.map((d) => ({ value: d.id, label: d.title }))],
    [deals],
  );
  const contactOptions: Option[] = useMemo(
    () => [{ value: '', label: 'None' }, ...contacts.map((c) => ({ value: c.id, label: c.name }))],
    [contacts],
  );

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setError(null);
    setOpen(true);
  };

  const openEdit = (a: Activity) => {
    setEditing(a);
    setDraft({ type: a.type, subject: a.subject, due: a.due, done: a.done, dealId: a.dealId, contactId: a.contactId });
    setError(null);
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setEditing(null);
    setError(null);
  };

  const toggleDone = async (a: Activity) => {
    setError(null);
    try {
      await saveActivity({ ...a, done: !a.done });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update activity.');
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteActivity(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete activity.');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        await saveActivity({ ...editing, ...draft });
      } else {
        await addActivity(draft);
      }
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save activity.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Activities"
        subtitle={`${openCount} open`}
        action={
          <Button onClick={openCreate}>
            <Plus size={16} strokeWidth={1.75} /> New activity
          </Button>
        }
      />

      {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

      {sorted.length === 0 ? (
        <EmptyState icon={<CheckSquare size={28} strokeWidth={1.75} />}>
          No activities yet. Create one to start tracking your follow-ups.
        </EmptyState>
      ) : (
        <div className="list">
          {sorted.map((a) => (
            <div key={a.id} className="list-row">
              <Checkbox
                checked={a.done}
                onChange={() => toggleDone(a)}
                ariaLabel={a.done ? 'Mark as not done' : 'Mark as done'}
              />

              <span className="tag" title={TYPE_LABEL[a.type]} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <TypeIcon type={a.type} /> {TYPE_LABEL[a.type]}
              </span>

              <div className="list-main">
                <div className={`list-title${a.done ? ' done' : ''}`}>{a.subject || '—'}</div>
                <div className="list-sub">
                  {contactName(a.contactId) || 'No contact'} · {fmtDue(a.due)}
                </div>
              </div>

              <div className="row-actions">
                <button className="icon-btn" onClick={() => openEdit(a)} aria-label="Edit activity">
                  <Pencil size={16} strokeWidth={1.75} />
                </button>
                <button className="icon-btn" onClick={() => remove(a.id)} aria-label="Delete activity">
                  <Trash2 size={16} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <Modal
          title={editing ? 'Edit activity' : 'New activity'}
          onClose={closeModal}
          footer={
            <>
              <Button variant="ghost" onClick={closeModal}>Cancel</Button>
              <Button onClick={submit}>{editing ? 'Save' : 'Create'}</Button>
            </>
          }
        >
          <form onSubmit={submit}>
            {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

            <Field label="Type">
              <SegmentedControl
                value={draft.type}
                onChange={(v) => setDraft({ ...draft, type: v as ActivityType })}
                options={TYPE_OPTIONS}
              />
            </Field>

            <Field label="Subject">
              <TextInput
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                placeholder="e.g. Follow up on proposal"
                autoFocus
              />
            </Field>

            <Field label="Due">
              <DatePicker
                value={draft.due}
                onChange={(v) => setDraft({ ...draft, due: v })}
                ariaLabel="Due date"
              />
            </Field>

            <Field label="Related deal">
              <Select
                value={draft.dealId}
                onChange={(v) => setDraft({ ...draft, dealId: v })}
                options={dealOptions}
                ariaLabel="Related deal"
              />
            </Field>

            <Field label="Related contact">
              <Select
                value={draft.contactId}
                onChange={(v) => setDraft({ ...draft, contactId: v })}
                options={contactOptions}
                ariaLabel="Related contact"
              />
            </Field>

            {/* allow Enter-to-submit inside the form */}
            <button type="submit" hidden aria-hidden="true" />
          </form>
        </Modal>
      )}
    </div>
  );
}
