import { useState } from 'react'
import Card from '../ui/Card'
import Checkbox from '../ui/Checkbox'
import { checklistItems } from '../../data/mockData'

export default function TodaysChecklist() {
  const [items, setItems] = useState(checklistItems)
  const completed = items.filter((i) => i.done).length

  const toggle = (id) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)))
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[18px] font-semibold text-text-primary">Today's Trading Checklist</h3>
        <span className="tabular-nums text-sm font-medium text-text-muted">
          {completed}/{items.length}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between">
            <Checkbox
              id={item.id}
              checked={item.done}
              onChange={() => toggle(item.id)}
              label={item.label}
            />
          </div>
        ))}
      </div>
    </Card>
  )
}
