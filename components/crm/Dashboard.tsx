import React, { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid,
  PieChart, Pie,
} from 'recharts';
import type { PieLabelRenderProps } from 'recharts';
import { Phone, Mail, Calendar, CheckSquare, CalendarCheck } from 'lucide-react';
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

// Apple HIG light-theme chart styling — soft ticks, hairline grid, clean
// tooltip. (CSS vars don't resolve inside JS style objects, so use literals.)
const AXIS_TICK = { fill: '#8e8e93', fontSize: 12 };
const TOOLTIP_STYLE = {
  background: '#fff',
  border: '1px solid rgba(0,0,0,0.1)',
  borderRadius: 12,
  boxShadow: '0 8px 28px rgba(0,0,0,0.12)',
  fontSize: 13,
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
          <div className="kpi-value tnum">{money(openPipeline)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Won Value</div>
          <div className="kpi-value tnum">{money(wonValue)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Win Rate</div>
          <div className="kpi-value tnum">{winRate}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Open Deals</div>
          <div className="kpi-value tnum">{openCount}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Contacts</div>
          <div className="kpi-value tnum">{contacts.length}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Value by stage</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={byStage} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'rgba(0,0,0,0.1)' }} />
              <YAxis tickFormatter={(v: number) => money(v)} tick={AXIS_TICK} tickLine={false} axisLine={false} width={80} />
              <Tooltip
                formatter={(v: number) => money(v)}
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                contentStyle={TOOLTIP_STYLE}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {byStage.map((d) => (
                  <Cell key={d.stage} fill={STAGE_COLOR[d.stage]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-title">Deals by stage</div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Pie
                data={byStage}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={100}
                stroke="#fff"
                strokeWidth={2}
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

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">Upcoming activities</div>
        {upcoming.length === 0 ? (
          <EmptyState icon={<CalendarCheck size={26} strokeWidth={1.75} />}>
            No open activities — you're all caught up.
          </EmptyState>
        ) : (
          upcoming.map((a) => {
            const Icon = ACTIVITY_ICON[a.type];
            return (
              <div className="list-row" key={a.id}>
                <span className="tag"><Icon size={14} /> {a.type}</span>
                <div className="list-main">
                  <div className="list-title">{a.subject}</div>
                  <div className="list-sub">{contactName(a.contactId)}</div>
                </div>
                <span className="list-sub tnum">{a.due}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
