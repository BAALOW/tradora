import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import Card from '../ui/Card'
import { ResponsiveContainer, LineChart, Line } from 'recharts'

export default function KpiCard({ icon: Icon, label, value, changeLabel, changeTone = 'success', sparkline, statusBadge }) {
  const ToneIcon = changeTone === 'success' ? ArrowUpRight : ArrowDownRight

  return (
    <Card className="flex flex-col gap-3" padded>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-text-secondary">
          {Icon && <Icon className="h-4 w-4" />}
          <span className="text-sm font-medium">{label}</span>
        </div>
        {sparkline && (
          <div className="h-8 w-16 opacity-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkline}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={changeTone === 'success' ? '#16A34A' : '#DC2626'}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <p className="tabular-nums text-[28px] font-bold leading-none text-text-primary">{value}</p>

      {changeLabel && !statusBadge && (
        <div className={`flex items-center gap-1 text-sm font-medium ${changeTone === 'success' ? 'text-success' : 'text-danger'}`}>
          <ToneIcon className="h-3.5 w-3.5" />
          <span>{changeLabel}</span>
        </div>
      )}

      {statusBadge && (
        <span
          className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            statusBadge.tone === 'success'
              ? 'bg-green-50 text-success'
              : statusBadge.tone === 'danger'
              ? 'bg-red-50 text-danger'
              : 'bg-amber-50 text-warning'
          }`}
        >
          {statusBadge.label}
        </span>
      )}
    </Card>
  )
}
