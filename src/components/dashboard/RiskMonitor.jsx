import { ShieldCheck } from 'lucide-react'
import Card from '../ui/Card'
import ProgressBar from '../ui/ProgressBar'
import Badge from '../ui/Badge'

export default function RiskMonitor({ snapshot }) {
  const remaining = snapshot.dailyLossLimit - snapshot.dailyLossUsed

  return (
    <Card className="flex h-full flex-col gap-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[18px] font-semibold text-text-primary">Risk Monitor</h3>
        <Badge tone="success">
          <ShieldCheck className="h-3 w-3" /> SAFE
        </Badge>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-text-secondary">Daily Loss Limit</span>
          <span className="tabular-nums font-semibold text-text-primary">${snapshot.dailyLossLimit}</span>
        </div>
        <ProgressBar value={snapshot.dailyLossUsed} max={snapshot.dailyLossLimit} tone="success" />
        <div className="mt-2 flex items-center justify-between text-xs text-text-muted">
          <span>Used ${snapshot.dailyLossUsed}</span>
          <span>Remaining ${remaining}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
        <div>
          <p className="text-xs font-medium text-text-muted">Current Risk</p>
          <p className="tabular-nums mt-1 text-lg font-semibold text-text-primary">{snapshot.currentRiskPct}%</p>
        </div>
        <div>
          <p className="text-xs font-medium text-text-muted">Max Allowed</p>
          <p className="tabular-nums mt-1 text-lg font-semibold text-text-primary">{snapshot.maxRiskPct}%</p>
        </div>
      </div>
    </Card>
  )
}
