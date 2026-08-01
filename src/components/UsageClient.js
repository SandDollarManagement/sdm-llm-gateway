'use client'

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'

// Recharts paints to SVG/canvas and cannot resolve var(--token), so the house token
// values are READ from the live stylesheet at runtime instead of being copied here.
// Copying them would create a second source of truth that silently drifts the moment
// the design system changes — the exact failure the token layer exists to prevent.
function token(name, fallback) {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

const BRAND = () => token('--accent', '#2f6fed')
const BRAND_LIGHT = () => token('--accent-hover', '#2a62d4')
const MUTED = () => token('--text-muted', '#5e646c')
const GRID = () => token('--border', 'rgba(18,20,24,0.08)')

export default function UsageClient({ daily, byProvider, byAlias }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Calls per day (last 30 days)" className="lg:col-span-2">
        {daily.length === 0 ? (
          <Empty>No calls yet.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={daily} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID()} strokeDasharray="3 3" />
              <XAxis dataKey="day" stroke={MUTED()} fontSize={11} />
              <YAxis stroke={MUTED()} fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: token('--surface', '#151719'),
                  border: `1px solid ${GRID()}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                cursor={{ stroke: GRID() }}
              />
              <Line
                type="monotone"
                dataKey="calls"
                stroke={BRAND()}
                strokeWidth={2}
                dot={{ fill: BRAND(), strokeWidth: 0, r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Calls today by provider">
        {byProvider.length === 0 ? (
          <Empty>No calls yet today.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byProvider} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID()} strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke={MUTED()} fontSize={11} />
              <YAxis stroke={MUTED()} fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: token('--surface', '#151719'),
                  border: `1px solid ${GRID()}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                cursor={{ fill: token('--surface-3', '#25282d') }}
              />
              <Bar dataKey="calls" fill={BRAND()} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Calls today by alias">
        {byAlias.length === 0 ? (
          <Empty>No calls yet today.</Empty>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byAlias} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID()} strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke={MUTED()} fontSize={11} />
              <YAxis stroke={MUTED()} fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: token('--surface', '#151719'),
                  border: `1px solid ${GRID()}`,
                  borderRadius: 8,
                  fontSize: 12,
                }}
                cursor={{ fill: token('--surface-3', '#25282d') }}
              />
              <Bar dataKey="calls" fill={BRAND_LIGHT()} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  )
}

function Panel({ title, children, className = '' }) {
  return (
    <section className={`bg-surface-card border border-border rounded-xl p-4 ${className}`}>
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      {children}
    </section>
  )
}

function Empty({ children }) {
  return <div className="text-sm text-muted text-center py-12">{children}</div>
}
