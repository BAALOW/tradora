import { useCallback, useEffect, useState } from 'react'
import * as backtestService from '../services/backtestService'
import { useAuth } from '../contexts/AuthContext'

export function useBacktestTrades({ accountId, startDate, endDate } = {}) {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mutating, setMutating] = useState(false)

  const fetchTrades = useCallback(async () => {
    if (!userId) {
      setTrades([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await backtestService.getBacktestTrades({ accountId, startDate, endDate })
      setTrades(data)
    } catch (err) {
      setError(err.message || 'Failed to load backtest results. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [userId, accountId, startDate, endDate])

  useEffect(() => {
    fetchTrades()
  }, [fetchTrades])

  const createTrade = useCallback(async (payload) => {
    setMutating(true)
    try {
      const created = await backtestService.createBacktestTrade(payload)
      setTrades((prev) => [...prev, created].sort((a, b) => new Date(a.trade_date) - new Date(b.trade_date)))
      return created
    } finally {
      setMutating(false)
    }
  }, [])

  const updateTrade = useCallback(async (id, payload) => {
    setMutating(true)
    try {
      const updated = await backtestService.updateBacktestTrade(id, payload)
      setTrades((prev) =>
        prev
          .map((t) => (t.id === id ? updated : t))
          .sort((a, b) => new Date(a.trade_date) - new Date(b.trade_date))
      )
      return updated
    } finally {
      setMutating(false)
    }
  }, [])

  const deleteTrade = useCallback(async (id) => {
    setMutating(true)
    try {
      await backtestService.deleteBacktestTrade(id)
      setTrades((prev) => prev.filter((t) => t.id !== id))
    } finally {
      setMutating(false)
    }
  }, [])

  return { trades, loading, error, mutating, refresh: fetchTrades, createTrade, updateTrade, deleteTrade }
}