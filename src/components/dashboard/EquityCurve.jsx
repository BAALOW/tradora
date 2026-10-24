import { useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import ChartCard from './ChartCard'
import { equityCurve } from '../../data/mockData'

const ranges = ['1W', '1M', '3M', '6M', '1Y', 'ALL']

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 shadow-popover">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="tabular-nums text-sm font-semibold text-text-primary">
        ${payload[0].value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  )
}

export default function EquityCurve() {
  const [range, setRange] = useState('1M')
  const data = equityCurve[range]
  const current = data[data.length - 1]?.value ?? 0

  return (
    <ChartCard
      title="Equity Curve"
      controls={
        <div className="flex items-center gap-1 rounded-lg bg-surface p-1">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                range === r ? 'bg-white text-brand shadow-sm' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      }
    >
      <div className="mb-3">
        <p className="tabular-nums text-2xl font-bold text-text-primary">
          ${current.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563EB" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 12, fill: '#9CA3AF' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
              width={48}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#2563EB"
              strokeWidth={2.5}
              fill="url(#equityFill)"
              activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
