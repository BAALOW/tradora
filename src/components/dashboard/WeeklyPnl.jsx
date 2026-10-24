import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import ChartCard from './ChartCard'
import { weeklyPnl } from '../../data/mockData'

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const value = payload[0].value
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 shadow-popover">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`tabular-nums text-sm font-semibold ${value >= 0 ? 'text-success' : 'text-danger'}`}>
        {value >= 0 ? '+' : ''}${value}
      </p>
    </div>
  )
}

export default function WeeklyPnl() {
  return (
    <ChartCard title="Weekly P&L">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeklyPnl} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F1F5F9' }} />
            <Bar dataKey="pnl" radius={[6, 6, 6, 6]}>
              {weeklyPnl.map((entry, i) => (
                <Cell key={i} fill={entry.pnl >= 0 ? '#16A34A' : '#DC2626'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
