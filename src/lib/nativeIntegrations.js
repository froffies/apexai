import { Capacitor } from "@capacitor/core"

export function isNativeApp() {
  return Capacitor.isNativePlatform()
}

export async function hapticTap() {
  if (!isNativeApp()) return false
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics")
    await Haptics.impact({ style: ImpactStyle.Light })
    return true
  } catch {
    return false
  }
}

export async function requestNotificationAccess() {
  if (!isNativeApp()) return { granted: false, reason: "Native notifications are available in the iPhone build." }
  const { LocalNotifications } = await import("@capacitor/local-notifications")
  const permission = await LocalNotifications.requestPermissions()
  return { granted: permission.display === "granted", reason: permission.display }
}

export async function scheduleDailyCoachNudge({ hour = 18, minute = 0, title = "ApexAI Coach", body = "Check your plan and protein before the day gets away." } = {}) {
  if (!isNativeApp()) return { scheduled: false, reason: "Native notification scheduling requires the iPhone build." }
  const { LocalNotifications } = await import("@capacitor/local-notifications")
  await LocalNotifications.schedule({
    notifications: [
      {
        id: 101,
        title,
        body,
        schedule: { on: { hour, minute }, repeats: true },
      },
    ],
  })
  return { scheduled: true }
}

export async function shareText(title, text) {
  if (navigator.share) {
    await navigator.share({ title, text })
    return true
  }
  if (isNativeApp()) {
    const { Share } = await import("@capacitor/share")
    await Share.share({ title, text, dialogTitle: title })
    return true
  }
  await navigator.clipboard.writeText(text)
  return true
}

export function nativeCapabilitySummary() {
  return isNativeApp()
    ? "Implemented native helpers: notifications, haptics, and system sharing."
    : "Web mode now; implemented native helpers become available in the iPhone shell."
}
