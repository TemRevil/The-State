import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Check, Phone, Mail, Calendar, CheckSquare } from 'lucide-react';
import { useStore } from '../../lib/store';
import { Modal, Field, TextInput, Select, Button, EmptyState, PageHeader } from '../../lib/ui';
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
    case 'call': return <Phone size={16} />;
    case 'email': return <Mail size={16} />;
    case 'meeting': return <Calendar size={16} />;
    case 'task': return <CheckSquare size={16} />;
  }
}

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
            <Plus size={16} /> New activity
          </Button>
        }
      />

      {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

      {sorted.length === 0 ? (
        <EmptyState>No activities yet. Create one to start tracking your follow-ups.</EmptyState>
      ) : (
        <div className="card">
          {sorted.map((a) => (
            <div key={a.id} className="list-row">
              <button
                type="button"
                className={`checkbox${a.done ? ' on' : ''}`}
                onClick={() => toggleDone(a)}
                aria-label={a.done ? 'Mark as not done' : 'Mark as done'}
                aria-pressed={a.done}
              >
                {a.done && <Check size={14} />}
              </button>

              <span className="tag" title={TYPE_LABEL[a.type]} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <TypeIcon type={a.type} /> {TYPE_LABEL[a.type]}
              </span>

              <span
                style={{
                  flex: 1,
                  textDecoration: a.done ? 'line-through' : 'none',
                  opacity: a.done ? 0.6 : 1,
                }}
              >
                {a.subject || '—'}
              </span>

              <span className="muted">{contactName(a.contactId)}</span>
              <span className="muted">{a.due}</span>

              <div className="row-actions">
                <button className="icon-btn" onClick={() => openEdit(a)} aria-label="Edit activity">
                  <Pencil size={16} />
                </button>
                <button className="icon-btn" onClick={() => remove(a.id)} aria-label="Delete activity">
                  <Trash2 size={16} />
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
            {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

            <Field label="Type">
              <Select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as ActivityType })}
              >
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </Select>
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
              <TextInput
                type="date"
                value={draft.due}
                onChange={(e) => setDraft({ ...draft, due: e.target.value })}
              />
            </Field>

            <Field label="Related deal">
              <Select
                value={draft.dealId}
                onChange={(e) => setDraft({ ...draft, dealId: e.target.value })}
              >
                <option value="">— None —</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </Select>
            </Field>

            <Field label="Related contact">
              <Select
                value={draft.contactId}
                onChange={(e) => setDraft({ ...draft, contactId: e.target.value })}
              >
                <option value="">— None —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>

            {/* allow Enter-to-submit inside the form */}
            <button type="submit" hidden aria-hidden="true" />
          </form>
        </Modal>
      )}
    </div>
  );
}
