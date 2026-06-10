import React, { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie,
} from 'recharts';
import type { PieLabelRenderProps } from 'recharts';
import { Phone, Mail, Calendar, CheckSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useStore } from '../../lib/store';
import { PageHeader, EmptyState, money } from '../../lib/ui';
import { STAGES, STAGE_LABEL, STAGE_COLOR } from '../../types';
import type { Stage, ActivityType } from '../../types';

// ── Dashboard ──
// High-level overview of the pipeline: headline KPIs, value/count by stage,
// and the next follow-ups due. Pure read view derived from the store.

const ACTIVITY_ICON: Record<ActivityType, LucideIcon> = {
  call: Phone,
  email: Mail,
  meeting: Calendar,
  task: CheckSquare,
};

interface StageDatum {
  stage: Stage;
  label: string;
  value: number;
  count: number;
  [key: string]: string | number;
}

export default function Dashboard() {
  const { deals, contacts, activities, contactName } = useStore();

  const openPipeline = useMemo(
    () => deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost').reduce((s, d) => s + d.value, 0),
    [deals],
  );
  const wonValue = useMemo(
    () => deals.filter((d) => d.stage === 'won').reduce((s, d) => s + d.value, 0),
    [deals],
  );
  const wonCount = useMemo(() => deals.filter((d) => d.stage === 'won').length, [deals]);
  const lostCount = useMemo(() => deals.filter((d) => d.stage === 'lost').length, [deals]);
  const openCount = useMemo(
    () => deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost').length,
    [deals],
  );

  const winRate = wonCount + lostCount > 0
    ? `${Math.round((wonCount / (wonCount + lostCount)) * 100)}%`
    : '—';

  const byStage = useMemo<StageDatum[]>(
    () => STAGES.map((stage) => {
      const inStage = deals.filter((d) => d.stage === stage);
      return {
        stage,
        label: STAGE_LABEL[stage],
        value: inStage.reduce((s, d) => s + d.value, 0),
        count: inStage.length,
      };
    }),
    [deals],
  );

  const upcoming = useMemo(
    () => activities
      .filter((a) => !a.done)
      .sort((a, b) => a.due.localeCompare(b.due))
      .slice(0, 8),
    [activities],
  );

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Pipeline at a glance" />

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Open Pipeline</div>
          <div className="kpi-value">{money(openPipeline)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Won Value</div>
          <div className="kpi-value">{money(wonValue)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Win Rate</div>
          <div className="kpi-value">{winRate}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Open Deals</div>
          <div className="kpi-value">{openCount}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Contacts</div>
          <div className="kpi-value">{contacts.length}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Value by stage</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byStage}>
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v: number) => money(v)} tick={{ fontSize: 12 }} width={80} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Bar dataKey="value">
                {byStage.map((d) => (
                  <Cell key={d.stage} fill={STAGE_COLOR[d.stage]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <h3>Deals by stage</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Tooltip />
              <Pie
                data={byStage}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={(entry: PieLabelRenderProps) => {
                  const d = entry.payload as StageDatum | undefined;
                  return d ? `${d.label}: ${d.count}` : '';
                }}
              >
                {byStage.map((d) => (
                  <Cell key={d.stage} fill={STAGE_COLOR[d.stage]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3>Upcoming activities</h3>
        {upcoming.length === 0 ? (
          <EmptyState>No open activities — you're all caught up.</EmptyState>
        ) : (
          upcoming.map((a) => {
            const Icon = ACTIVITY_ICON[a.type];
            return (
              <div className="list-row" key={a.id}>
                <span className="tag"><Icon size={14} /> {a.type}</span>
                <span style={{ flex: 1 }}>{a.subject}</span>
                <span className="muted">{contactName(a.contactId)}</span>
                <span className="muted">{a.due}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
