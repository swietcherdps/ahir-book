import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'
import { getNotes, getNoteNotificationSettings, updateNoteNotificationSettings } from './db'
// import { schedulePushNotification, getUserId } from './push'

const NOTE_ALARM_ID = 1900000001

/**
 * Schedule note notifications based on user settings
 * Called by main notification replenishment system
 * 
 * Uses OneSignal for web (works when app is closed)
 * Uses LocalNotifications for mobile (works in background)
 */
export const scheduleNoteNotifications = async () => {
    try {
        const settings = await getNoteNotificationSettings()

        // Check if enabled
        if (!settings.enabled) {
            console.log('[Note Notifications] Disabled, skipping')
            return
        }

        const notes = await getNotes()
        if (notes.length === 0) {
            console.log('[Note Notifications] No notes available')
            return
        }

        const now = new Date()
        const frequencyMs = settings.frequency * 60 * 1000 // minutes to milliseconds
        const isWeb = Capacitor.getPlatform() === 'web'

        // Web scheduling is polled while the PWA is open, so retain the old
        // elapsed-time guard there. Native uses a persistent repeating alarm.
        if (isWeb && settings.lastSentAt) {
            const timeSinceLastMs = now.getTime() - new Date(settings.lastSentAt).getTime()
            if (timeSinceLastMs < frequencyMs) {
                console.log(`[Note Notifications] Not enough time elapsed: ${Math.round(timeSinceLastMs / 1000 / 60)} min since last`)
                return
            }
        }

        // Select next note based on mode
        let selectedNote
        let newIndex = settings.currentIndex

        if (settings.mode === 'sequential') {
            selectedNote = notes[settings.currentIndex]

            if (!selectedNote) {
                // Index out of bounds
                if (settings.repeatEnabled) {
                    // Loop back to start
                    newIndex = 0
                    selectedNote = notes[0]
                } else {
                    // No more notes, stop
                    console.log('[Note Notifications] Sequential mode finished, repeat disabled')
                    // Optionally disable notifications
                    await updateNoteNotificationSettings({ enabled: false })
                    return
                }
            } else {
                // Move to next note
                newIndex = settings.currentIndex + 1
                // If we've reached the end and repeat is enabled, reset
                if (newIndex >= notes.length) {
                    newIndex = settings.repeatEnabled ? 0 : notes.length
                }
            }
        } else {
            // Random mode
            const randomIndex = Math.floor(Math.random() * notes.length)
            selectedNote = notes[randomIndex]
            // Index doesn't matter for random mode, but we'll update it anyway
            newIndex = randomIndex
        }

        if (!selectedNote) {
            console.error('[Note Notifications] Failed to select note')
            return
        }

        // Schedule notification
        const notificationTime = new Date(now.getTime() + frequencyMs)
        const notificationId = isWeb ? 1001 + (selectedNote.id! % 1000) : NOTE_ALARM_ID

        const title = '📝 Notunuz'
        const body = selectedNote.content.length > 100
            ? selectedNote.content.substring(0, 100) + '...'
            : selectedNote.content

        const notificationData = {
            id: notificationId,
            title,
            body,
            schedule: { at: notificationTime },
            sound: undefined,
            attachments: undefined,
            actionTypeId: '',
            extra: {
                type: 'note',
                noteId: selectedNote.id,
                frequency: settings.frequency,
                recurringAlarm: !isWeb
            }
        }

        if (isWeb) {
            // Web: Use OneSignal for push notifications (works when app is closed)
            // OneSignal Removed
            /*
            const oneSignalAppId = localStorage.getItem('onesignal_app_id')
            const oneSignalApiKey = localStorage.getItem('onesignal_api_key')
            const oneSignalUserId = await getUserId()

            let sentViaOneSignal = false

            if (oneSignalUserId && oneSignalAppId && oneSignalApiKey) {
                try {
                    await schedulePushNotification(
                        oneSignalApiKey,
                        oneSignalAppId,
                        oneSignalUserId,
                        title,
                        body,
                        notificationTime,
                        { type: 'note', noteId: selectedNote.id }
                    )
                    sentViaOneSignal = true
                    console.log(`[Note Notifications] OneSignal push scheduled for ${notificationTime.toLocaleTimeString('tr-TR')}`)
                } catch (e) {
                    console.error('[Note Notifications] OneSignal schedule failed:', e)
                }
            } else {
                console.warn('[Note Notifications] OneSignal not configured - notifications will only work when app is open')
            }
            */
            let sentViaOneSignal = false

            // Also save to localStorage for fallback/local polling
            const existing = JSON.parse(localStorage.getItem('web_scheduled_notifications') || '[]')
            existing.push({
                ...notificationData,
                schedule: { at: notificationTime.toISOString() },
                sentViaOneSignal
            })
            existing.sort((a: any, b: any) => new Date(a.schedule.at).getTime() - new Date(b.schedule.at).getTime())
            localStorage.setItem('web_scheduled_notifications', JSON.stringify(existing))

        } else {
            const permission = await LocalNotifications.requestPermissions()
            if (permission.display !== 'granted') {
                throw new Error('Bildirim izni verilmedi')
            }

            if (Capacitor.getPlatform() === 'android') {
                const exactAlarm = await LocalNotifications.checkExactNotificationSetting()
                if (exactAlarm.exact_alarm !== 'granted') {
                    const updated = await LocalNotifications.changeExactNotificationSetting()
                    if (updated.exact_alarm !== 'granted') {
                        throw new Error('Tam zamanlı alarm izni verilmedi')
                    }
                }
            }

            // Remove the previous note alarm before registering the new period.
            const pending = await LocalNotifications.getPending()
            const oldNoteAlarms = pending.notifications.filter(notification =>
                notification.id === NOTE_ALARM_ID ||
                notification.extra?.type === 'note' ||
                (notification.id >= 1001 && notification.id <= 2000)
            )
            if (oldNoteAlarms.length > 0) {
                await LocalNotifications.cancel({
                    notifications: oldNoteAlarms.map(notification => ({ id: notification.id }))
                })
            }

            // Native repeating alarms continue after the WebView/app is closed.
            await LocalNotifications.schedule({
                notifications: [{
                    ...notificationData,
                    schedule: {
                        at: notificationTime,
                        repeats: true,
                        allowWhileIdle: true
                    }
                }]
            })
            console.log(`[Note Notifications] Local notification scheduled for ${notificationTime.toLocaleTimeString('tr-TR')}`)
        }

        // Update settings with new state
        await updateNoteNotificationSettings({
            currentIndex: newIndex,
            lastSentAt: now
        })

        console.log(`[Note Notifications] Notification scheduled successfully`)
    } catch (error) {
        console.error('[Note Notifications] Error scheduling:', error)
    }
}

/**
 * Cancel all note notifications
 */
export const cancelNoteNotifications = async () => {
    try {
        const isWeb = Capacitor.getPlatform() === 'web'

        if (isWeb) {
            // Remove note notifications from web pending list
            const existing = JSON.parse(localStorage.getItem('web_scheduled_notifications') || '[]')
            const filtered = existing.filter((n: any) => !(n.extra?.type === 'note'))
            localStorage.setItem('web_scheduled_notifications', JSON.stringify(filtered))
            console.log(`[Note Notifications] Removed ${existing.length - filtered.length} pending web notifications`)
        } else {
            // Include both the current persistent ID and legacy one-shot IDs.
            const pending = await LocalNotifications.getPending()
            const noteNotificationIds = pending.notifications
                .filter(n => n.id === NOTE_ALARM_ID || n.extra?.type === 'note' || (n.id >= 1001 && n.id <= 2000))
                .map(n => n.id)

            if (noteNotificationIds.length > 0) {
                await LocalNotifications.cancel({ notifications: noteNotificationIds.map(id => ({ id })) })
                console.log(`[Note Notifications] Cancelled ${noteNotificationIds.length} pending mobile notifications`)
            }
        }
    } catch (error) {
        console.error('[Note Notifications] Error canceling:', error)
    }
}

/**
 * Get the next scheduled note notification time
 */
export const getNextNoteNotificationTime = async (): Promise<Date | null> => {
    try {
        const settings = await getNoteNotificationSettings()
        if (!settings.enabled || !settings.lastSentAt) return null

        const frequencyMs = settings.frequency * 60 * 1000
        const nextTime = new Date(new Date(settings.lastSentAt).getTime() + frequencyMs)

        return nextTime
    } catch (error) {
        console.error('[Note Notifications] Error getting next time:', error)
        return null
    }
}
