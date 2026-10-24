import { useState } from 'react'
import { Copy, Check, ShieldCheck } from 'lucide-react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import { useToast } from '../ui/Toast'

const steps = [
  'Copy the token below.',
  'Open MetaTrader 5 and attach the TRADORA_Connector EA to any chart.',
  'Paste the token into the EA\u2019s "Connector Token" input.',
  'In MT5, enable Tools \u2192 Options \u2192 Expert Advisors \u2192 "Allow WebRequest" and add your TRADORA API URL.',
  'Start the EA. TRADORA will show "Connected" once the first sync arrives.',
]

export default function ConnectMt5Modal({ open, onClose, account, onGenerate, onSaveDetails }) {
  const { showToast } = useToast()
  const [mt5Login, setMt5Login] = useState('')
  const [mt5Server, setMt5Server] = useState('')
  const [broker, setBroker] = useState(account?.firm || '')
  const [token, setToken] = useState(null)
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await onSaveDetails({ mt5Login, mt5Server, broker, isDemo: account?.account_type === 'demo' })
      const rawToken = await onGenerate()
      setToken(rawToken)
    } catch (err) {
      showToast({ type: 'error', title: 'Could not generate token', description: err.message })
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = async () => {
    if (!token) return
    await navigator.clipboard.writeText(token)
    setCopied(true)
    showToast({ type: 'success', title: 'Token copied' })
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = () => {
    setToken(null)
    setCopied(false)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Connect MT5">
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-xs font-medium text-text-muted">TRADORA Account</p>
          <p className="mt-0.5 text-sm font-semibold text-text-primary">{account?.name}</p>
        </div>

        {!token && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="MT5 Login" placeholder="12345678" value={mt5Login} onChange={(e) => setMt5Login(e.target.value)} />
              <Input label="MT5 Server" placeholder="FundedNext-Live01" value={mt5Server} onChange={(e) => setMt5Server(e.target.value)} />
            </div>
            <Input label="Broker" placeholder="FundedNext" value={broker} onChange={(e) => setBroker(e.target.value)} />

            <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-brand">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>TRADORA never asks for your MT5 password. The connector token is the only credential the EA uses.</p>
            </div>

            <Button onClick={handleGenerate} loading={generating} className="w-full">
              Generate Connection Token
            </Button>
          </>
        )}

        {token && (
          <>
            <div>
              <p className="mb-1.5 text-sm font-medium text-text-primary">Your connection token</p>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
                <code className="flex-1 truncate text-sm text-text-primary">{token}</code>
                <button
                  onClick={handleCopy}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-white"
                  aria-label="Copy token"
                >
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-danger">
                This token is shown once. Copy it now — you won't be able to view it again.
              </p>
            </div>

            <div className="rounded-xl border border-border p-4">
              <p className="mb-3 text-sm font-semibold text-text-primary">Next steps</p>
              <ol className="flex flex-col gap-2.5">
                {steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm text-text-secondary">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-brand">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <Button variant="secondary" onClick={handleClose} className="w-full">
              Done
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}