import { Moon, BookOpen, Sparkles, Flame } from 'lucide-react'
import Card from '../ui/Card'
import Button from '../ui/Button'
import { dailyWorship } from '../../data/mockData'

export default function DailyWorship() {
  return (
    <Card className="bg-gradient-to-br from-blue-50/60 via-white to-violet-50/60">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-ai">
          <Moon className="h-4 w-4" />
        </div>
        <h3 className="text-[16px] font-semibold text-text-primary">Daily Worship</h3>
      </div>

      <div className="flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-text-secondary">Prayer</span>
          <span className="tabular-nums font-semibold text-text-primary">
            {dailyWorship.prayer.done} / {dailyWorship.prayer.total}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-text-secondary">
            <BookOpen className="h-3.5 w-3.5" /> Qur'an
          </span>
          <span className="font-medium text-brand">{dailyWorship.quran ? 'Completed' : 'Pending'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-text-secondary">
            <Sparkles className="h-3.5 w-3.5" /> Adhkar
          </span>
          <span className="font-medium text-brand">{dailyWorship.adhkar ? 'Completed' : 'Pending'}</span>
        </div>
        <div className="flex items-center justify-between border-t border-border/70 pt-3">
          <span className="flex items-center gap-1.5 text-text-secondary">
            <Flame className="h-3.5 w-3.5 text-warning" /> Current Streak
          </span>
          <span className="tabular-nums font-semibold text-text-primary">{dailyWorship.streak} Days</span>
        </div>
      </div>

      <Button variant="secondary" className="mt-5 w-full">
        View Daily Worship
      </Button>
    </Card>
  )
}
