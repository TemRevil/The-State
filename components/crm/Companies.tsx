import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, ExternalLink, Building2 } from 'lucide-react';
import { useStore } from '../../lib/store';
import { Modal, Field, TextInput, Select, Button, EmptyState, PageHeader } from '../../lib/ui';
import type { Option } from '../../lib/ui';
import type { Company } from '../../types';

// ── Companies ──
// A simple table of every company, with create / edit / delete in a modal.

const SIZE_OPTIONS: Option[] = [
  { value: '1-10', label: '1–10' },
  { value: '11-50', label: '11–50' },
  { value: '51-200', label: '51–200' },
  { value: '201-500', label: '201–500' },
  { value: '500+', label: '500+' },
];

type Draft = Omit<Company, 'id' | 'createdAt'>;
const emptyDraft = (): Draft => ({ name: '', industry: '', size: SIZE_OPTIONS[0].value, website: '' });

// Normalise a website into a clickable absolute URL.
function toHref(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

export default function Companies() {
  const store = useStore();
  const { companies, contacts, addCompany, saveCompany, deleteCompany } = store;

  const [editing, setEditing] = useState<Company | null>(null); // null = closed; sentinel below = new
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Count contacts per company once, instead of filtering inside the render loop.
  const contactCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of contacts) counts[c.companyId] = (counts[c.companyId] ?? 0) + 1;
    return counts;
  }, [contacts]);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setError(null);
    setOpen(true);
  };

  const openEdit = (company: Company) => {
    setEditing(company);
    setDraft({ name: company.name, industry: company.industry, size: company.size, website: company.website });
    setError(null);
    setOpen(true);
  };

  const close = () => {
    if (busy) return;
    setOpen(false);
    setEditing(null);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) {
      setError('Name is required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload: Draft = {
        name: draft.name.trim(),
        industry: draft.industry.trim(),
        size: draft.size,
        website: draft.website.trim(),
      };
      if (editing) {
        await saveCompany({ ...editing, ...payload });
      } else {
        await addCompany(payload);
      }
      setOpen(false);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save company.');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (company: Company) => {
    if (!window.confirm(`Delete ${company.name}? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteCompany(company.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete company.');
    }
  };

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const subtitle = `${companies.length} ${companies.length === 1 ? 'company' : 'companies'}`;

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle={subtitle}
        action={<Button onClick={openCreate}><Plus size={16} /> New company</Button>}
      />

      {error && !open && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

      {companies.length === 0 ? (
        <EmptyState icon={<Building2 size={28} strokeWidth={1.75} />}>
          No companies yet. Add your first company to get started.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="crm-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Industry</th>
                <th>Size</th>
                <th>Website</th>
                <th>Contacts</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td className="cell-primary">{company.name}</td>
                  <td>{company.industry || <span className="muted">—</span>}</td>
                  <td>{company.size || <span className="muted">—</span>}</td>
                  <td>
                    {company.website ? (
                      <a href={toHref(company.website)} target="_blank" rel="noopener noreferrer">
                        {company.website} <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td><span className="tnum">{contactCounts[company.id] ?? 0}</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" onClick={() => openEdit(company)} aria-label="Edit company">
                        <Pencil size={16} />
                      </button>
                      <button className="icon-btn" onClick={() => onDelete(company)} aria-label="Delete company">
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
          title={editing ? 'Edit company' : 'New company'}
          onClose={close}
          footer={
            <>
              <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
              <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            </>
          }
        >
          <form onSubmit={submit}>
            <Field label="Name">
              <TextInput
                value={draft.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="Acme Inc."
                autoFocus
              />
            </Field>
            <Field label="Industry">
              <TextInput
                value={draft.industry}
                onChange={(e) => update({ industry: e.target.value })}
                placeholder="Software"
              />
            </Field>
            <Field label="Size">
              <Select
                value={draft.size}
                onChange={(v) => update({ size: v })}
                options={SIZE_OPTIONS}
                ariaLabel="Company size"
              />
            </Field>
            <Field label="Website">
              <TextInput
                value={draft.website}
                onChange={(e) => update({ website: e.target.value })}
                placeholder="acme.com"
              />
            </Field>

            {error && <div className="form-error" style={{ marginTop: 8 }}>{error}</div>}

            {/* Allow Enter-to-submit while keeping the visible buttons in the modal footer. */}
            <button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
          </form>
        </Modal>
      )}
    </div>
  );
}
