import { DEFAULT_LOCALE, getLocale } from "@/components/locale"
import { defaultProfile, storageKeys } from "@/lib/fitnessDefaults"
import { useLocalStorage } from "@/lib/useLocalStorage"

export default function useUserLocale() {
  const [profile] = useLocalStorage(storageKeys.profile, defaultProfile)
  return getLocale(profile.locale || DEFAULT_LOCALE)
}
