import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { DEFAULT_PLAN, getTradingPlan, normalizePlan, saveTradingPlan } from '../services/tradingPlanService'

// Loads the trader's plan (seeding the starter template the first time)
// and exposes `savePlan(nextPlan)` — updates the screen immediately and
// rolls back if the save fails.
export function useTradingPlan() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [plan, setPlan] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const row = await getTradingPlan()
      if (row) {
        setPlan(normalizePlan(row.content))
        setUpdatedAt(row.updated_at)
      } else {
        setPlan(normalizePlan(DEFAULT_PLAN))
        try {
          const saved = await saveTradingPlan(DEFAULT_PLAN)
          setUpdatedAt(saved.updated_at)
        } catch {
          // Starter plan still shows; it will save on the first edit.
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load your trading plan.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  const savePlan = useCallback(
    async (next) => {
      const previous = plan
      setPlan(next)
      setSaving(true)
      try {
        const saved = await saveTradingPlan(next)
        setUpdatedAt(saved.updated_at)
      } catch (err) {
        setPlan(previous)
        throw err
      } finally {
        setSaving(false)
      }
    },
    [plan]
  )

  return { plan, updatedAt, loading, saving, error, reload: load, savePlan }
}