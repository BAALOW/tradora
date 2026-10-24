import Card from '../ui/Card'
import ProgressBar from '../ui/ProgressBar'
import { disciplineMetrics } from '../../data/mockData'

const rows = [
  { label: 'Strategy Compliance', key: 'strategyCompliance' },
  { label: 'Risk Management', key: 'riskManagement' },
  { label: 'Discipline', key: 'discipline' },
  { label: 'Psychology', key: 'psychology' },
]

export default function TradingDiscipline() {
  return (
    <Card>
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-[18px] font-semibold text-text-primary">Trading Discipline</h3>
        <span className="tabular-nums text-lg font-bold text-brand">{disciplineMetrics.overall} / 100</span>
      </div>
      <div className="flex flex-col gap-4">
        {rows.map((row) => (
          <div key={row.key}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-text-secondary">{row.label}</span>
              <span className="tabular-nums font-medium text-text-primary">{disciplineMetrics[row.key]}%</span>
            </div>
            <ProgressBar value={disciplineMetrics[row.key]} tone="brand" />
          </div>
        ))}
      </div>
    </Card>
  )
}
