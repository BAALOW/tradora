import { useCallback, useEffect, useState } from 'react'
import * as accountService from '../services/accountService'
import { useAuth } from '../contexts/AuthContext'

// Central place for accounts state: list, loading, error, and CRUD.
// Pages just call the actions this hook returns — no raw Supabase
// calls or manual state juggling in the components themselves.
export function useAccounts() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mutating, setMutating] = useState(false)

  const fetchAccounts = useCallback(async () => {
    if (!userId) {
      setAccounts([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await accountService.getAccounts()
      setAccounts(data)
    } catch (err) {
      setError(err.message || 'Failed to load accounts. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
    // Depending on userId (a stable primitive) instead of the session
    // object stops this from re-running every time Supabase fires a
    // token-refresh event with a new session reference for the same user.
  }, [userId])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  const createAccount = useCallback(async (payload) => {
    setMutating(true)
    try {
      const created = await accountService.createAccount(payload)
      setAccounts((prev) => [created, ...prev])
      return created
    } finally {
      setMutating(false)
    }
  }, [])

  const updateAccount = useCallback(async (accountId, payload) => {
    setMutating(true)
    try {
      const updated = await accountService.updateAccount(accountId, payload)
      setAccounts((prev) => prev.map((a) => (a.id === accountId ? updated : a)))
      return updated
    } finally {
      setMutating(false)
    }
  }, [])

  const deleteAccount = useCallback(async (accountId) => {
    setMutating(true)
    try {
      await accountService.deleteAccount(accountId)
      setAccounts((prev) => prev.filter((a) => a.id !== accountId))
    } finally {
      setMutating(false)
    }
  }, [])

  return {
    accounts,
    loading,
    error,
    mutating,
    refresh: fetchAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
  }
}