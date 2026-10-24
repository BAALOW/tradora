import { useLocation } from 'react-router-dom'
import { Construction } from 'lucide-react'
import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'
import Card from '../components/ui/Card'
import { accounts } from '../data/mockData'
import { useState } from 'react'

const titleMap = {
  '/plan': 'Trading Plan',
  '/backtesting': 'Backtesting',
  '/playbook': 'Playbook',
  '/analytics': 'Analytics',
  '/daily-routine': 'Daily Routine',
  '/daily-worship': 'Daily Worship',
  '/ai-coach': 'AI Coach',
  '/settings': 'Settings',
}

export default function ComingSoon() {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(accounts[0])
  const title = titleMap[location.pathname] || 'This page'

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          accounts={accounts}
          selectedAccount={selectedAccount}
          onSelectAccount={setSelectedAccount}
          breadcrumb={`Overview / ${title}`}
        />

        <main className="mx-auto flex w-full max-w-[1440px] flex-1 items-center justify-center px-4 py-16 sm:px-6 lg:px-8">
          <Card className="flex max-w-md flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-brand">
              <Construction className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary">{title} is coming soon</h1>
              <p className="mt-2 text-sm text-text-secondary">
                We're still building this part of TRADORA. In the meantime, check out your Dashboard, Accounts,
                and Trading Journal — those are fully live.
              </p>
            </div>
          </Card>
        </main>
      </div>
    </div>
  )
}