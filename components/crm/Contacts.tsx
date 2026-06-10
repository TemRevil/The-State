import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { useStore } from '../../lib/store';
import { Modal, Field, TextInput, Select, Button, EmptyState, PageHeader } from '../../lib/ui';
import type { Contact } from '../../types';

// ── Contacts ──
// A searchable table of the people we sell to, with a create/edit modal.

type Draft = {
  name: string;
  email: string;
  phone: string;
  title: string;
  companyId: string;
  tags: string; // comma-separated in the form; split into string[] on save
};

const EMPTY_DRAFT: Draft = { name: '', email: '', phone: '', title: '', companyId: '', tags: '' };

export default function Contacts() {
  const store = useStore();
  const { contacts, companies, companyName, addContact, saveContact, deleteContact } = store;

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      companyName(c.companyId).toLowerCase().includes(q),
    );
  }, [contacts, query, companyName]);

  // Company options for the custom Select; first entry clears the company.
  const companyOptions = useMemo(
    () => [
      { value: '', label: '— No company —' },
      ...companies.map((co) => ({ value: co.id, label: co.name })),
    ],
    [companies],
  );

  const openCreate = () => {
    setEditing(null);
    setDraft({ ...EMPTY_DRAFT, companyId: companies[0]?.id ?? '' });
    setError(null);
    setOpen(true);
  };

  const openEdit = (c: Contact) => {
    setEditing(c);
    setDraft({
      name: c.name,
      email: c.email,
      phone: c.phone,
      title: c.title,
      companyId: c.companyId,
      tags: c.tags.join(', '),
    });
    setError(null);
    setOpen(true);
  };

  const close = () => {
    if (busy) return;
    setOpen(false);
    setEditing(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const tags = draft.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);
    try {
      if (editing) {
        await saveContact({
          ...editing,
          name: draft.name.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          title: draft.title.trim(),
          companyId: draft.companyId,
          tags,
        });
      } else {
        await addContact({
          name: draft.name.trim(),
          email: draft.email.trim(),
          phone: draft.phone.trim(),
          title: draft.title.trim(),
          companyId: draft.companyId,
          tags,
        });
      }
      setOpen(false);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save contact.');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (c: Contact) => {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    try {
      await deleteContact(c.id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not delete contact.');
    }
  };

  const set = <K extends keyof Draft>(key: K, val: Draft[K]) => setDraft((d) => ({ ...d, [key]: val }));

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle={`${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacts'}`}
        action={<Button onClick={openCreate}><Plus size={16} /> New contact</Button>}
      />

      <div style={{ marginBottom: 16 }}>
        <TextInput
          placeholder="Search by name, email, or company…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Users size={28} strokeWidth={1.75} />}>
          {contacts.length === 0
            ? 'No contacts yet. Add your first one to get started.'
            : 'No contacts match your search.'}
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Title</th>
                <th>Company</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Tags</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="cell-primary">{c.name}</td>
                  <td>{c.title || '—'}</td>
                  <td>{companyName(c.companyId)}</td>
                  <td>{c.email || '—'}</td>
                  <td>{c.phone || '—'}</td>
                  <td>
                    {c.tags.length === 0
                      ? '—'
                      : c.tags.map((t) => <span key={t} className="tag">{t}</span>)}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`}>
                        <Pencil size={16} />
                      </button>
                      <button className="icon-btn" onClick={() => onDelete(c)} aria-label={`Delete ${c.name}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <Modal
          title={editing ? 'Edit contact' : 'New contact'}
          onClose={close}
          footer={
            <>
              <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
              <Button onClick={onSubmit} disabled={busy || !draft.name.trim()}>
                {busy ? 'Saving…' : editing ? 'Save changes' : 'Create contact'}
              </Button>
            </>
          }
        >
          <form onSubmit={onSubmit}>
            <Field label="Name">
              <TextInput
                value={draft.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Jane Doe"
                autoFocus
              />
            </Field>
            <Field label="Title">
              <TextInput
                value={draft.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="VP of Sales"
              />
            </Field>
            <Field label="Company">
              <Select
                value={draft.companyId}
                onChange={(v) => set('companyId', v)}
                options={companyOptions}
                placeholder="— No company —"
                ariaLabel="Company"
              />
            </Field>
            <Field label="Email">
              <TextInput
                type="email"
                value={draft.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="jane@example.com"
              />
            </Field>
            <Field label="Phone">
              <TextInput
                value={draft.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+1 555 123 4567"
              />
            </Field>
            <Field label="Tags">
              <TextInput
                value={draft.tags}
                onChange={(e) => set('tags', e.target.value)}
                placeholder="decision-maker, warm, west-coast"
              />
            </Field>
            {error && <div className="form-error" style={{ marginTop: 8 }}>{error}</div>}
            <button type="submit" hidden />
          </form>
        </Modal>
      )}
    </div>
  );
}
