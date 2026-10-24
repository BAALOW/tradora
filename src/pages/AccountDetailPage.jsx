import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, RefreshCw, Link2, Link2Off, PlayCircle, Zap } from 'lucide-react'
import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'
import Card from '../components/ui/Card'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
import { useToast } from '../components/ui/Toast'
import ConnectMt5Modal from '../components/mt5/ConnectMt5Modal'
import * as accountService from '../services/accountService'
import * as tradeService from '../services/tradeService'
import * as mt5Service from '../services/mt5Service'
import * as demoSyncService from '../services/demoSyncService'
import { useMT5Connection } from '../hooks/useMT5Connection'
import { calcPnl, calcPnlPct, statusLabel, typeLabel } from '../lib/accountCalculations'

const statusToneMap = {
  healthy: 'success',
  passed: 'success',
  caution: 'warning',
  at_risk: 'danger',
  failed: 'danger',
  inactive: 'neutral',
}

const connectionToneMap = {
  connected: 'success',
  never_connected: 'neutral',
  disconnected: 'neutral',
  sync_error: 'danger',
}

const connectionLabelMap = {
  connected: 'MT5 Connected',
  never_connected: 'MT5 Never Connected',
  disconnected: 'MT5 Disconnected',
  sync_error: 'MT5 Sync Error',
}

export default function AccountDetailPage() {
  const { accountId } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [account, setAccount] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const [runningDemo, setRunningDemo] = useState(false)

  const { connection, status, lastSyncLabel, refresh: refreshConnection, saveDetails, generateToken } = useMT5Connection(accountId)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [accountData, statsData] = await Promise.all([
        accountService.getAccountById(accountId),
        tradeService.getAccountStats(accountId),
      ])
      setAccount(accountData)
      setStats(statsData)
    } catch (err) {
      setError(err.message || 'Failed to load this account.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  const handleRunDemoSync = async () => {
    if (!account) return
    setRunningDemo(true)
    try {
      await demoSyncService.runFullDemoCycle(accountId, account)
      showToast({
        type: 'success',
        title: 'Demo sync complete',
        description: 'A simulated trade was opened and closed — check the Trading Journal.',
      })
      await Promise.all([load(), refreshConnection()])
    } catch (err) {
      showToast({ type: 'error', title: 'Demo sync failed', description: err.message })
    } finally {
      setRunningDemo(false)
    }
  }

  const pnl = account ? calcPnl(account) : 0
  const pnlPct = account ? calcPnlPct(account) : 0
  const hasTrades = stats && (Number(stats.closed_trades) > 0 || Number(stats.open_trades) > 0)

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          accounts={[]}
          selectedAccount={{ label: account?.name || 'Account' }}
          onSelectAccount={() => {}}
          breadcrumb="Overview / Accounts / Details"
        />

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <button
            onClick={() => navigate('/accounts')}
            className="mb-4 flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Accounts
          </button>

          {loading && (
            <Card className="flex flex-col gap-4">
              <LoadingSkeleton className="h-6 w-1/3" />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i}>
                    <LoadingSkeleton className="h-3 w-16" />
                    <LoadingSkeleton className="mt-2 h-6 w-24" />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {!loading && error && (
            <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-danger">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-text-primary">Couldn't load this account</p>
              <p className="max-w-xs text-sm text-text-muted">{error}</p>
              <Button variant="secondary" icon={RefreshCw} onClick={load} className="mt-2">Retry</Button>
            </Card>
          )}

          {!loading && !error && account && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-[28px] font-bold text-text-primary sm:text-[32px]">{account.name}</h1>
                  <p className="mt-1 text-sm text-text-secondary">
                    {account.firm || 'No firm set'} · {typeLabel(account.account_type)} · {account.platform}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusToneMap[account.status] || 'neutral'}>{statusLabel(account.status)}</Badge>
                  <Badge tone={connectionToneMap[status]}>
                    {status === 'connected' ? <Link2 className="h-3 w-3" /> : <Link2Off className="h-3 w-3" />}
                    {connectionLabelMap[status]}
                  </Badge>
                  <Button variant="secondary" size="sm" onClick={() => setConnectOpen(true)}>
                    {connection ? 'Manage MT5 Connection' : 'Connect MT5'}
                  </Button>
                </div>
              </div>

              {/* MT5 sync status strip */}
              <Card className="flex flex-wrap items-center justify-between gap-4" padded>
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-xs font-medium text-text-muted">Connection</p>
                    <p className="mt-0.5 text-sm font-semibold text-text-primary">{connectionLabelMap[status]}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-text-muted">Last Sync</p>
                    <p className="mt-0.5 text-sm font-semibold text-text-primary">{lastSyncLabel}</p>
                  </div>
                  {connection?.mt5_login && (
                    <div>
                      <p className="text-xs font-medium text-text-muted">MT5 Login</p>
                      <p className="mt-0.5 text-sm font-semibold text-text-primary">{connection.mt5_login}</p>
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="sm" icon={PlayCircle} loading={runningDemo} onClick={handleRunDemoSync}>
                  Run Demo Sync
                </Button>
              </Card>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Card padded>
                  <p className="text-xs font-medium text-text-muted">Balance</p>
                  <p className="tabular-nums mt-1 text-xl font-bold text-text-primary">
                    ${Number(account.current_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </Card>
                <Card padded>
                  <p className="text-xs font-medium text-text-muted">Equity</p>
                  <p className="tabular-nums mt-1 text-xl font-bold text-text-primary">
                    {account.current_equity != null ? `$${Number(account.current_equity).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'N/A'}
                  </p>
                </Card>
                <Card padded>
                  <p className="text-xs font-medium text-text-muted">P&L</p>
                  <p className={`tabular-nums mt-1 text-xl font-bold ${pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                    {pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </Card>
                <Card padded>
                  <p className="text-xs font-medium text-text-muted">P&L %</p>
                  <p className={`tabular-nums mt-1 text-xl font-bold ${pnlPct >= 0 ? 'text-success' : 'text-danger'}`}>
                    {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                  </p>
                </Card>
              </div>

              <Card>
                <p className="mb-4 text-sm font-semibold text-text-primary">Account Details</p>
                <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <div><p className="text-xs text-text-muted">Account Number</p><p className="mt-0.5 font-medium text-text-primary">{account.account_number || '—'}</p></div>
                  <div><p className="text-xs text-text-muted">Server</p><p className="mt-0.5 font-medium text-text-primary">{account.server || '—'}</p></div>
                  <div><p className="text-xs text-text-muted">Currency</p><p className="mt-0.5 font-medium text-text-primary">{account.currency}</p></div>
                  <div><p className="text-xs text-text-muted">Leverage</p><p className="mt-0.5 font-medium text-text-primary">{account.leverage ? `1:${account.leverage}` : 'N/A'}</p></div>
                </div>
              </Card>

              <Card>
                <p className="mb-4 text-sm font-semibold text-text-primary">Risk</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-text-muted">Daily Loss Limit</p>
                    <p className="mt-0.5 font-medium text-text-primary">
                      {account.daily_loss_limit_percent ? `${account.daily_loss_limit_percent}%` : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Maximum Drawdown</p>
                    <p className="mt-0.5 font-medium text-text-primary">
                      {account.max_drawdown_percent ? `${account.max_drawdown_percent}%` : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Current Drawdown</p>
                    <p className="mt-0.5 font-medium text-text-primary">
                      {hasTrades ? 'Calculated from equity curve' : 'No data yet'}
                    </p>
                  </div>
                </div>
              </Card>

              {!hasTrades && (
                <Card className="flex flex-col items-center gap-2 border-dashed py-10 text-center">
                  <p className="text-sm font-medium text-text-primary">No trading data yet.</p>
                  <p className="max-w-sm text-sm text-text-muted">
                    Connect your MT5 account or run a demo sync to start seeing performance statistics — win rate,
                    total trades, and drawdown will appear here automatically once data comes in.
                  </p>
                </Card>
              )}

              {hasTrades && (
                <Card>
                  <p className="mb-4 text-sm font-semibold text-text-primary">Performance</p>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-text-muted">Total Trades</p>
                      <p className="tabular-nums mt-0.5 text-lg font-bold text-text-primary">
                        {Number(stats.closed_trades) + Number(stats.open_trades)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">Win Rate</p>
                      <p className="tabular-nums mt-0.5 text-lg font-bold text-text-primary">
                        {stats.closed_trades > 0 ? ((stats.wins / stats.closed_trades) * 100).toFixed(1) : '0.0'}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">Net P&L</p>
                      <p className={`tabular-nums mt-0.5 text-lg font-bold ${Number(stats.net_pnl) >= 0 ? 'text-success' : 'text-danger'}`}>
                        {Number(stats.net_pnl) >= 0 ? '+' : ''}${Number(stats.net_pnl).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted">Open Trades</p>
                      <p className="tabular-nums mt-0.5 text-lg font-bold text-text-primary">{stats.open_trades}</p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}
        </main>
      </div>

      <ConnectMt5Modal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        account={account}
        onSaveDetails={saveDetails}
        onGenerate={generateToken}
      />
    </div>
  )
}