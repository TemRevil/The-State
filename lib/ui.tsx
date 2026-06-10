import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

// ── Shared UI kit (Apple HIG) ──
// Every interactive control here is CUSTOM — no native <select> or
// <input type="date">. Popovers portal to <body> and position against their
// anchor so they never clip inside a scrollable modal.

// ── Modal / sheet ──
export function Modal({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={19} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ── Basic inputs ──
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}</label>;
}
export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="input" {...props} />;
}
export function Button({ variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  return <button className={`btn btn-${variant}`} {...props} />;
}
export function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="badge" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>{children}</span>;
}
export function EmptyState({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return <div className="empty-state">{icon && <div className="es-icon">{icon}</div>}{children}</div>;
}
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>
      {action}
    </div>
  );
}
export const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

// ── Anchored, portaled popover ──
function useAnchoredPopover(open: boolean, onClose: () => void, anchorRef: React.RefObject<HTMLElement | null>, popRef: React.RefObject<HTMLElement | null>, width?: number) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const place = useCallback(() => {
    const a = anchorRef.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    const w = width ?? r.width;
    const popH = popRef.current?.offsetHeight ?? 300;
    const below = r.bottom + 6;
    const flip = below + popH > window.innerHeight - 8 && r.top - popH - 6 > 8;
    let left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    setPos({ top: flip ? r.top - popH - 6 : below, left, width: w });
  }, [anchorRef, popRef, width]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!anchorRef.current?.contains(e.target as Node) && !popRef.current?.contains(e.target as Node)) onClose();
    };
    // Capture-phase so Escape closes THIS popover first (and stops the event before
    // a surrounding Modal's document listener would also close the modal).
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const reflow = () => place();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', reflow);
      window.removeEventListener('scroll', reflow, true);
    };
  }, [open, anchorRef, popRef, onClose, place]);

  return pos;
}

export interface Option { value: string; label: string }

// ── Custom Select ──
export function Select({ value, onChange, options, placeholder = 'Select…', ariaLabel }: {
  value: string; onChange: (v: string) => void; options: Option[]; placeholder?: string; ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const pos = useAnchoredPopover(open, () => setOpen(false), anchorRef, popRef);
  const selected = options.find((o) => o.value === value);

  const openMenu = () => { setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen(true); };
  const choose = (v: string) => { onChange(v); setOpen(false); anchorRef.current?.focus(); };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) { e.preventDefault(); openMenu(); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (options[active]) choose(options[active].value); }
  };

  return (
    <div className="cselect">
      <button
        type="button" ref={anchorRef} className={`cselect-trigger ${open ? 'open' : ''}`}
        onClick={() => (open ? setOpen(false) : openMenu())} onKeyDown={onKey}
        aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel}
      >
        <span className={`cselect-value ${selected ? '' : 'placeholder'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className="chev" size={17} />
      </button>
      {open && pos && createPortal(
        <div className="popover" ref={popRef} role="listbox" style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}>
          <div className="popover-menu">
            {options.map((o, i) => (
              <button
                key={o.value} type="button" role="option" aria-selected={o.value === value}
                className={`popover-item ${o.value === value ? 'selected' : ''} ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)} onClick={() => choose(o.value)}
              >
                <span>{o.label}</span>
                {o.value === value && <Check className="tick" size={16} />}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Segmented control ──
export function SegmentedControl({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value} type="button" role="tab" aria-selected={o.value === value}
          className={`segmented-opt ${o.value === value ? 'on' : ''}`} onClick={() => onChange(o.value)}
        >
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

// ── Switch ──
export function Switch({ checked, onChange, ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; ariaLabel?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={ariaLabel}
      className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span className="knob" />
    </button>
  );
}

// ── Round checkbox ──
export function Checkbox({ checked, onChange, ariaLabel }: { checked: boolean; onChange: (v: boolean) => void; ariaLabel?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={ariaLabel}
      className={`check ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      {checked && <Check size={15} strokeWidth={3} />}
    </button>
  );
}

// ── Date picker ──
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s: string) => { const [y, m, d] = (s || '').split('-').map(Number); return (y && m && d) ? new Date(y, m - 1, d) : null; };
const fmtNice = (s: string) => { const d = parseISO(s); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };

export function DatePicker({ value, onChange, placeholder = 'Pick a date', ariaLabel }: {
  value: string; onChange: (v: string) => void; placeholder?: string; ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const pos = useAnchoredPopover(open, () => setOpen(false), anchorRef, popRef, 288);
  const selected = parseISO(value);
  const [view, setView] = useState(() => selected ?? new Date());

  useEffect(() => { if (open) setView(selected ?? new Date()); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const y = view.getFullYear(); const m = view.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const todayISO = toISO(new Date());

  const pick = (day: number) => { onChange(toISO(new Date(y, m, day))); setOpen(false); anchorRef.current?.focus(); };

  return (
    <div className="cselect">
      <button type="button" ref={anchorRef} className={`cselect-trigger ${open ? 'open' : ''}`} onClick={() => setOpen((o) => !o)} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open}>
        <span className={`cselect-value ${selected ? '' : 'placeholder'}`}>{selected ? fmtNice(value) : placeholder}</span>
        <ChevronDown className="chev" size={17} />
      </button>
      {open && pos && createPortal(
        <div className="popover dp" ref={popRef} role="dialog" style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}>
          <div className="dp-head">
            <button className="icon-btn" type="button" onClick={() => setView(new Date(y, m - 1, 1))} aria-label="Previous month"><ChevronLeft size={18} /></button>
            <span className="dp-month">{MONTHS[m]} {y}</span>
            <button className="icon-btn" type="button" onClick={() => setView(new Date(y, m + 1, 1))} aria-label="Next month"><ChevronRight size={18} /></button>
          </div>
          <div className="dp-grid">
            {DOW.map((d, i) => <div className="dp-dow" key={i}>{d}</div>)}
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: days }).map((_, i) => {
              const day = i + 1; const iso = toISO(new Date(y, m, day));
              const cls = `dp-day ${iso === todayISO ? 'today' : ''} ${iso === value ? 'selected' : ''}`;
              return <button type="button" key={day} className={cls} onClick={() => pick(day)}>{day}</button>;
            })}
          </div>
          <div className="dp-foot">
            <button className="dp-link" type="button" onClick={() => { onChange(''); setOpen(false); }}>Clear</button>
            <button className="dp-link" type="button" onClick={() => { onChange(todayISO); setOpen(false); }}>Today</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
