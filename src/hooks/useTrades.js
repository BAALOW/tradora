import { useCallback, useEffect, useState } from 'react'
import * as tradeService from '../services/tradeService'
import { useAuth } from '../contexts/AuthContext'

// Fetches trades (optionally scoped to one account) and exposes the
// same loading/error/refresh shape as useAccounts, plus CRUD for
// manually-journaled trades.
export function useTrades({ accountId } = {}) {
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
      const data = await tradeService.getTrades({ accountId })
      setTrades(data)
    } catch (err) {
      setError(err.message || 'Failed to load trades. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [userId, accountId])

  useEffect(() => {
    fetchTrades()
  }, [fetchTrades])

  const createManualTrade = useCallback(async (payload) => {
    setMutating(true)
    try {
      const created = await tradeService.createManualTrade(payload)
      setTrades((prev) => [created, ...prev])
      return created
    } finally {
      setMutating(false)
    }
  }, [])

  const updateTrade = useCallback(async (tradeId, payload) => {
    setMutating(true)
    try {
      const updated = await tradeService.updateTrade(tradeId, payload)
      setTrades((prev) => prev.map((t) => (t.id === tradeId ? updated : t)))
      return updated
    } finally {
      setMutating(false)
    }
  }, [])

  const deleteTrade = useCallback(async (tradeId) => {
    setMutating(true)
    try {
      await tradeService.deleteTrade(tradeId)
      setTrades((prev) => prev.filter((t) => t.id !== tradeId))
    } finally {
      setMutating(false)
    }
  }, [])

  return {
    trades,
    loading,
    error,
    mutating,
    refresh: fetchTrades,
    createManualTrade,
    updateTrade,
    deleteTrade,
  }
}