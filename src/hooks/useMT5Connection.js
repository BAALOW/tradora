import { useCallback, useEffect, useState } from 'react'
import * as mt5Service from '../services/mt5Service'

// One connection record per account. Handles the "Connect MT5" modal
// flow: save login/server details, generate a one-time token, and
// surface connection/sync status for the Account Details page.
export function useMT5Connection(accountId) {
  const [connection, setConnection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    setError(null)
    try {
      const data = await mt5Service.getConnection(accountId)
      setConnection(data)
    } catch (err) {
      setError(err.message || 'Failed to load MT5 connection status.')
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const saveDetails = useCallback(
    async (details) => {
      const data = await mt5Service.upsertConnectionDetails(accountId, details)
      setConnection(data)
      return data
    },
    [accountId]
  )

  const generateToken = useCallback(async () => {
    return mt5Service.generateConnectorToken(accountId)
  }, [accountId])

  const status = connection?.connection_status || 'never_connected'
  const lastSyncLabel = connection?.last_sync_at
    ? new Date(connection.last_sync_at).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Never synced'

  return { connection, status, lastSyncLabel, loading, error, refresh, saveDetails, generateToken }
}