import { ArrowUp, ArrowDown } from 'lucide-react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import Button from '../ui/Button'
import { recentTrades } from '../../data/mockData'

const resultTone = { WIN: 'success', LOSS: 'danger', BE: 'neutral' }

function TradeCard({ trade }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            trade.direction === 'BUY' ? 'bg-green-50 text-success' : 'bg-red-50 text-danger'
          }`}
        >
          {trade.direction === 'BUY' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">{trade.pair}</p>
          <p className="text-xs text-text-muted">{trade.setup}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`tabular-nums text-sm font-semibold ${trade.pnl >= 0 ? 'text-success' : trade.pnl < 0 ? 'text-danger' : 'text-text-secondary'}`}>
          {trade.pnl > 0 ? '+' : ''}${trade.pnl}
        </p>
        <p className="text-xs text-text-muted">{trade.date}</p>
      </div>
    </div>
  )
}

export default function RecentTrades() {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[18px] font-semibold text-text-primary">Recent Trades</h3>
        <Button variant="ghost" size="sm">
          View All
        </Button>
      </div>

      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
              <th className="py-2.5 pr-4">Pair</th>
              <th className="py-2.5 pr-4">Direction</th>
              <th className="hidden py-2.5 pr-4 lg:table-cell">Setup</th>
              <th className="hidden py-2.5 pr-4 md:table-cell">RR</th>
              <th className="hidden py-2.5 pr-4 md:table-cell">Risk</th>
              <th className="py-2.5 pr-4">P&L</th>
              <th className="py-2.5 pr-4">Result</th>
              <th className="hidden py-2.5 pr-0 lg:table-cell">Date</th>
            </tr>
          </thead>
          <tbody>
            {recentTrades.map((trade) => (
              <tr key={trade.id} className="border-b border-border/70 last:border-0">
                <td className="py-3 pr-4 font-semibold text-text-primary">{trade.pair}</td>
                <td className="py-3 pr-4">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold ${
                      trade.direction === 'BUY' ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {trade.direction === 'BUY' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {trade.direction}
                  </span>
                </td>
                <td className="hidden py-3 pr-4 text-text-secondary lg:table-cell">{trade.setup}</td>
                <td className="hidden py-3 pr-4 tabular-nums text-text-secondary md:table-cell">{trade.rr}</td>
                <td className="hidden py-3 pr-4 tabular-nums text-text-secondary md:table-cell">${trade.risk}</td>
                <td
                  className={`tabular-nums py-3 pr-4 font-semibold ${
                    trade.pnl > 0 ? 'text-success' : trade.pnl < 0 ? 'text-danger' : 'text-text-secondary'
                  }`}
                >
                  {trade.pnl > 0 ? '+' : ''}${trade.pnl}
                </td>
                <td className="py-3 pr-4">
                  <Badge tone={resultTone[trade.result]}>{trade.result}</Badge>
                </td>
                <td className="hidden py-3 pr-0 text-text-muted lg:table-cell">{trade.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 sm:hidden">
        {recentTrades.map((trade) => (
          <TradeCard key={trade.id} trade={trade} />
        ))}
      </div>
    </Card>
  )
}
