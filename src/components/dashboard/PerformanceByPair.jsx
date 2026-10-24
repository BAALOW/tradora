import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import ChartCard from './ChartCard'
import { performanceByPair } from '../../data/mockData'

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 shadow-popover">
      <p className="text-xs text-text-muted">{payload[0].payload.pair}</p>
      <p className="tabular-nums text-sm font-semibold text-brand">{payload[0].value}% win rate</p>
    </div>
  )
}

export default function PerformanceByPair() {
  return (
    <ChartCard title="Performance by Pair">
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={performanceByPair}
            layout="vertical"
            margin={{ top: 5, right: 20, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="pair"
              tick={{ fontSize: 13, fill: '#111827', fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F1F5F9' }} />
            <Bar dataKey="winRate" radius={[0, 6, 6, 0]} fill="#2563EB" barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
