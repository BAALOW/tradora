import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(undefined)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener?.subscription?.unsubscribe()
  }, [])

  const signIn = useCallback(async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }, [])

  const signInWithGoogle = useCallback(async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      // Redirect back to /login rather than straight to /dashboard: if the
      // provider sends back an error (access denied, misconfiguration,
      // etc.) there's no session yet, so landing on a ProtectedRoute would
      // just bounce the person again and the error would be lost. Login
      // reads the error off the URL, and once a session does exist it
      // redirects to /dashboard itself.
      options: { redirectTo: `${window.location.origin}/login` },
    })
    if (error) throw error
    return data
  }, [])

  const signUp = useCallback(async ({ email, password, fullName }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) throw error

    if (data?.user?.id) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        full_name: fullName,
        email,
      })
    }

    return data
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  // Sends the "reset your password" email. Supabase redirects the person
  // to /reset-password with a one-time recovery session once they click
  // the link in that email.
  const requestPasswordReset = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  }, [])

  // Verifies the 6-digit code from the reset email. On success Supabase
  // establishes a short-lived recovery session, which is what lets
  // updatePassword() below work on the Reset Password page.
  const verifyRecoveryOtp = useCallback(async (email, token) => {
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' })
    if (error) throw error
    return data
  }, [])

  // Called from the Reset Password page once the person has a recovery
  // session (established by verifyRecoveryOtp above).
  const updatePassword = useCallback(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) throw error
  }, [])

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signIn,
    signInWithGoogle,
    signUp,
    signOut,
    requestPasswordReset,
    verifyRecoveryOtp,
    updatePassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}