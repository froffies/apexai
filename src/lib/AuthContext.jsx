import React, { createContext, useContext, useEffect, useMemo, useState } from "react"
import { deleteRemoteAccount } from "@/lib/accountApiClient"
import { deleteCloudState, hydrateCloudState, isCloudConfigured, setCloudUser, syncAllLocalToCloud } from "@/lib/cloudSync"
import { supabase } from "@/lib/supabaseClient"

const AuthContext = createContext(null)
const localUser = {
  id: "local-user",
  full_name: "Local Athlete",
  email: "local@apexai.app",
  provider: "local",
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Sync timed out")), ms)),
  ])
}

function mapSupabaseUser(user) {
  if (!user) return null
  return {
    id: user.id,
    full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Athlete",
    email: user.email || "",
    provider: "supabase",
  }
}

export function AuthProvider({ children }) {
  const cloudConfigured = isCloudConfigured()
  const localModeAllowed = !cloudConfigured || import.meta.env.DEV || import.meta.env.VITE_APEXAI_ALLOW_LOCAL_MODE === "true"
  const [localMode, setLocalMode] = useState(() => localModeAllowed && window.localStorage.getItem("apexai.localMode") === "true")
  const [user, setUser] = useState(cloudConfigured && !(localModeAllowed && localMode) ? null : localUser)
  const [isLoadingAuth, setIsLoadingAuth] = useState(cloudConfigured && !(localModeAllowed && localMode))
  const [cloudStatus, setCloudStatus] = useState(cloudConfigured ? "Cloud auth ready" : "Local mode")

  useEffect(() => {
    if (localModeAllowed || typeof window === "undefined") return
    window.localStorage.removeItem("apexai.localMode")
    if (localMode) {
      setLocalMode(false)
      setUser(cloudConfigured ? null : localUser)
    }
  }, [cloudConfigured, localMode, localModeAllowed])

  useEffect(() => {
    if (!cloudConfigured || localMode || !supabase) {
      setCloudUser(null)
      setIsLoadingAuth(false)
      return undefined
    }

    let mounted = true

    const loadSession = async () => {
      try {
        const { data } = await withTimeout(supabase.auth.getSession(), 8000)
        if (!mounted) return
        const mappedUser = mapSupabaseUser(data.session?.user)
        setUser(mappedUser)
        setCloudUser(mappedUser)
        if (mappedUser) {
          try {
            const hydratedCount = await withTimeout(hydrateCloudState(), 8000)
            if (!hydratedCount) await withTimeout(syncAllLocalToCloud(), 8000)
            if (mounted) setCloudStatus("Cloud sync active")
          } catch (error) {
            if (mounted) setCloudStatus(error instanceof Error ? error.message : "Cloud sync failed")
          }
        }
      } catch (error) {
        if (mounted) setCloudStatus(error instanceof Error ? error.message : "Auth failed")
      } finally {
        if (mounted) setIsLoadingAuth(false)
      }
    }

    void loadSession()

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (_event === "INITIAL_SESSION") return
      if (!mounted) return
      const mappedUser = mapSupabaseUser(session?.user)
      setUser(mappedUser)
      setCloudUser(mappedUser)
      if (mappedUser) {
        try {
          const hydratedCount = await withTimeout(hydrateCloudState(), 8000)
          if (!hydratedCount) await withTimeout(syncAllLocalToCloud(), 8000)
          if (mounted) setCloudStatus("Cloud sync active")
        } catch (error) {
          if (mounted) setCloudStatus(error instanceof Error ? error.message : "Cloud sync failed")
        }
      }
    })

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [cloudConfigured, localMode, localModeAllowed])

  const signInWithEmail = async (email, password) => {
    if (!supabase) throw new Error("Supabase is not configured")
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signUpWithEmail = async (email, password, fullName) => {
    if (!supabase) throw new Error("Supabase is not configured")
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) throw error
  }

  const continueLocally = () => {
    if (!localModeAllowed) {
      setCloudStatus("Sign in is required on this app.")
      return
    }
    window.localStorage.setItem("apexai.localMode", "true")
    setLocalMode(true)
    setUser(localUser)
    setCloudUser(null)
    setCloudStatus("Local mode")
  }

  const syncNow = async () => {
    await syncAllLocalToCloud()
    setCloudStatus("Cloud sync active")
  }

  const deleteAccountData = async () => {
    await deleteCloudState()
  }

  const deleteAccountPermanently = async () => {
    if (!cloudConfigured || localMode) return
    await deleteRemoteAccount()
    if (supabase) await supabase.auth.signOut()
    window.localStorage.removeItem("apexai.localMode")
    setLocalMode(false)
    setUser(null)
    setCloudUser(null)
  }

  const logout = async () => {
    if (localMode) {
      window.localStorage.removeItem("apexai.localMode")
      setLocalMode(false)
      setUser(cloudConfigured ? null : localUser)
      return
    }
    if (supabase) await supabase.auth.signOut()
    setUser(cloudConfigured ? null : localUser)
    setCloudUser(null)
  }

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authChecked: !isLoadingAuth,
      authError: cloudConfigured && !localMode && !isLoadingAuth && !user ? { type: "auth_required", message: "Sign in required" } : null,
      appPublicSettings: { mode: cloudConfigured && !localMode ? "cloud" : "local" },
      cloudConfigured,
      cloudStatus,
      localMode,
      localModeAllowed,
      setUser,
      signInWithEmail,
      signUpWithEmail,
      continueLocally,
      syncNow,
      deleteAccountData,
      deleteAccountPermanently,
      checkAppState: async () => user,
      checkUserAuth: async () => user,
      navigateToLogin: () => undefined,
      logout,
    }),
    [cloudConfigured, cloudStatus, isLoadingAuth, localMode, localModeAllowed, user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within an AuthProvider")
  return context
}
