import { createClient } from "@supabase/supabase-js"

/** @type {Record<string, string>} */
const viteEnv = import.meta.env || {}
const supabaseUrl = viteEnv.VITE_SUPABASE_URL || ""
const supabaseAnonKey = viteEnv.VITE_SUPABASE_ANON_KEY || ""

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null
