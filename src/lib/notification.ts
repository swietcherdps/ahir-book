import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'
import { db } from './db'
import { generateNotificationContent } from './ai'
// import { schedulePushNotification, getUserId } from './push'
import { scheduleNoteNotifications } from './noteNotifications'

export type NotificationFrequency = '1m' | '5m' | '15m' | '1h' | '4h' | '8h' | '12h' | '24h' | '1w'

// Helper to strip HTML tags
const stripHtml = (html: string): string => {
    const tmp = document.createElement('DIV')
    tmp.innerHTML = html
    return tmp.textContent || tmp.innerText || ''
}

// Helper to get minutes from frequency
const getMinutesFromFrequency = (freq: NotificationFrequency): number => {
    switch (freq) {
        case '1m': return 1
        case '5m': return 5
        case '15m': return 15
        case '1h': return 60
        case '4h': return 240
        case '8h': return 480
        case '12h': return 720
        case '24h': return 1440
        case '1w': return 10080
        default: return 240
    }
}

export const getNativeScheduleTime = (now: Date, index: number, intervalMinutes: number): Date =>
    new Date(now.getTime() + (index + 1) * intervalMinutes * 60 * 1000)

// Kept only to clean up the single repeating alarm created by v1.1.6.
const LEGACY_BOOK_ALARM_ID = 900000001

const cancelNativeBookAlarms = async () => {
    const pending = await LocalNotifications.getPending()
    const bookNotifications = pending.notifications.filter(notification =>
        notification.id === LEGACY_BOOK_ALARM_ID ||
        (notification.extra?.bookId && notification.extra?.type !== 'note')
    )

    if (bookNotifications.length > 0) {
        await LocalNotifications.cancel({
            notifications: bookNotifications.map(notification => ({ id: notification.id }))
        })
    }

    localStorage.removeItem('mobile_pending_backup')
}

const ensureNativeNotificationPermissions = async () => {
    const permission = await LocalNotifications.requestPermissions()
    if (permission.display !== 'granted') {
        throw new Error('Bildirim izni verilmedi')
    }

    if (Capacitor.getPlatform() === 'android') {
        const exactAlarm = await LocalNotifications.checkExactNotificationSetting()
        if (exactAlarm.exact_alarm !== 'granted') {
            const updated = await LocalNotifications.changeExactNotificationSetting()
            if (updated.exact_alarm !== 'granted') {
                throw new Error('Tam zamanlı alarm izni verilmedi. Ayarlardan “Alarmlar ve hatırlatıcılar” iznini açın.')
            }
        }
    }
}

// Helper to format date in Turkish: "26.12.2025 Cuma 12:00"
const formatTurkishDate = (date: Date): string => {
    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    const dayName = days[date.getDay()]
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${day}.${month}.${year} ${dayName} ${hours}:${minutes}`
}

// Helper to get correct base URL (handles GitHub Pages subdirectories)
const getBaseUrl = () => {
    const { origin, pathname } = window.location
    // Remove trailing slash if exists
    const basePath = pathname.endsWith('/') ? pathname : pathname + '/'
    return `${origin}${basePath}`
}

// Helper to extract a random sentence from text
const extractRandomSentence = (text: string): string => {
    if (!text) return ''

    // Strip HTML first
    let cleanText = stripHtml(text)

    // Remove Arabic script characters (keep only Latin/Turkish text)
    // This ensures notifications only contain readable Turkish text
    const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g
    cleanText = cleanText.replace(arabicRegex, ' ').replace(/\s+/g, ' ').trim()

    // If text is empty or too short after filtering, return empty (will be skipped)
    if (cleanText.length < 20) {
        return ''
    }

    // Standard Turkish/Latin logic
    // Split by common sentence endings (. ! ?)
    // Filter for sentences with reasonable length (e.g. 40-200 chars)
    const allSentences = cleanText.match(/[^.!?]+[.!?]+/g)
        ?.map(s => s.trim())
        ?.filter(s => s.length > 40 && s.length < 500) || []

    // Apply quality filters to get meaningful sentences
    const qualitySentences = allSentences.filter(s => {
        // Must start with uppercase letter (Turkish: A-Z, Ç, Ğ, İ, Ö, Ş, Ü)
        if (!/^[A-ZÇĞİÖŞÜ]/.test(s)) return false

        // Must not start with a reference marker like "(Bakara" 
        if (/^\(/.test(s)) return false

        // Must not be just a reference "(Sure XX)" or "olarak buyrulmuştur" type fragments
        if (/^(olarak|diye|gibi|ise|için|ile|de|da|ki)\s/i.test(s)) return false

        // Must not end with incomplete patterns (reference numbers, etc.)
        if (/\(\d+[\.\)]\s*$/.test(s)) return false
        if (/:\s*$/.test(s)) return false  // Ends with colon (incomplete)

        // Must contain at least 5 words
        const wordCount = s.split(/\s+/).length
        if (wordCount < 5) return false

        // Must contain a verb-like pattern (Turkish verb endings)
        // Common Turkish verb endings: -mak, -mek, -dır, -dir, -tir, -tır, -yor, -miş, etc.
        const hasSimpleEnding = /[\.!?]$/.test(s)

        if (!hasSimpleEnding) return false

        // Prefer sentences that look complete (not too many parentheses/references)
        const paranCount = (s.match(/\(/g) || []).length
        if (paranCount > 2) return false

        return true
    })

    // If we have quality sentences, pick from those
    if (qualitySentences.length > 0) {
        const randomIndex = Math.floor(Math.random() * qualitySentences.length)
        return qualitySentences[randomIndex]
    }

    // Fallback to any sentence that at least starts properly
    const fallbackSentences = allSentences.filter(s => /^[A-ZÇĞİÖŞÜ]/.test(s))
    if (fallbackSentences.length > 0) {
        const randomIndex = Math.floor(Math.random() * fallbackSentences.length)
        return fallbackSentences[randomIndex]
    }

    // Last resort: take first 100 chars
    if (cleanText.length > 500) {
        return cleanText.substring(0, 500) + '...'
    }

    return ''
}

// Helper to backup mobile notifications
const backupMobileNotifications = async () => {
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length > 0) {
        localStorage.setItem('mobile_pending_backup', JSON.stringify(pending.notifications))
    }
}

// Restore mobile notifications from backup
const restoreMobileNotifications = (): any[] => {
    const backup = JSON.parse(localStorage.getItem('mobile_pending_backup') || '[]')
    return backup
}

// Add to history helper
export const addToHistory = (notification: any) => {
    const history = JSON.parse(localStorage.getItem('notification_history') || '[]')

    // Check if already exists (deduplication)
    if (history.some((n: any) => n.id === notification.id)) return

    history.unshift(notification)

    // Clean up old items (older than 7 days) unless favorited
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const filtered = history.filter((n: any) => {
        if (n.isFavorite) return true
        return new Date(n.sentAt) > sevenDaysAgo
    })

    // Helper to keep max 100 items for safety
    if (filtered.length > 100) {
        filtered.length = 100
    }

    localStorage.setItem('notification_history', JSON.stringify(filtered))
}

// Sync mobile history: Detect notifications that fired while app was closed
export const syncMobileHistory = async () => {
    if (Capacitor.getPlatform() === 'web') return

    const pendingMobile = await LocalNotifications.getPending()
    const pendingIds = new Set(pendingMobile.notifications.map(n => n.id))

    const backup = restoreMobileNotifications()
    const now = new Date()

    // Find items that were in backup but are no longer in pending OS list
    // AND were scheduled for the past (meaning they fired)
    const fired = backup.filter((n: any) => {
        const scheduledTime = new Date(n.schedule?.at || n.at)
        return !pendingIds.has(n.id) && scheduledTime < now
    })

    if (fired.length > 0) {
        console.log(`Detected ${fired.length} notifications fired in background. Adding to history.`)
        fired.forEach((n: any) => {
            addToHistory({
                id: n.id,
                title: n.title,
                body: n.body,
                sentAt: new Date(n.schedule?.at || n.at).toISOString(),
                bookId: n.extra?.bookId,
                pageId: n.extra?.pageId,
                isAI: n.extra?.isAI || false,
                url: n.extra?.url,
                isRead: false
            })
        })
    }

    // Update backup to match current OS reality (plus any new ones added later)
    await backupMobileNotifications()
}

export const scheduleNotifications = async (
    frequency: NotificationFrequency,
    selectedBookIds: number[],
    enabled: boolean
) => {
    const isWeb = Capacitor.getPlatform() === 'web'

    console.log('scheduleNotifications started', { frequency, selectedBookIds, enabled })

    // Stopping the alarm must also stop notifications already registered with the OS.
    if (!enabled || selectedBookIds.length === 0) {
        if (isWeb) {
            localStorage.setItem('web_scheduled_notifications', '[]')
        } else {
            await cancelNativeBookAlarms()
        }
        console.log('Notifications disabled or no books selected - scheduled book alarms cancelled')
        return
    }

    // SMART TOP-UP LOGIC: Don't clear existing notifications
    // Instead, check how many exist per book and only add missing ones

    // Get current pending notifications count per book
    let existingCountPerBook: Record<number, number> = {}

    if (isWeb) {
        const existing = JSON.parse(localStorage.getItem('web_scheduled_notifications') || '[]')
        for (const notif of existing) {
            const bookId = notif.extra?.bookId
            if (bookId) {
                existingCountPerBook[bookId] = (existingCountPerBook[bookId] || 0) + 1
            }
        }
    } else {
        // Native alarms are rebuilt atomically whenever their settings change. This
        // prevents stale schedules from keeping the old frequency indefinitely.
        await cancelNativeBookAlarms()
        const pending = await LocalNotifications.getPending()
        // We can't easily get bookId from pending notifications directly
        // So we use the backup which has extra data
        const backup = JSON.parse(localStorage.getItem('mobile_pending_backup') || '[]')
        for (const notif of backup) {
            const bookId = notif.extra?.bookId
            if (bookId) {
                existingCountPerBook[bookId] = (existingCountPerBook[bookId] || 0) + 1
            }
        }
        // Also check actual pending count
        console.log(`Mobile: ${pending.notifications.length} pending notifications`)
    }

    console.log('Existing notifications per book:', existingCountPerBook)

    // Request permissions
    console.log('Requesting permissions...')
    if (isWeb) {
        const permission = await Notification.requestPermission()
        console.log('Web permission:', permission)
        if (permission !== 'granted') {
            throw new Error('Bildirim izni verilmedi')
        }
    } else {
        await ensureNativeNotificationPermissions()
    }

    // Get content for selected books
    console.log('Fetching book content...')
    const allContent = await db.bookContent
        .where('bookId')
        .anyOf(selectedBookIds)
        .toArray()
    console.log('Content fetched:', allContent.length)

    if (allContent.length === 0) return

    // Get counts from settings
    const smartCount = parseInt(localStorage.getItem('notification_smart_count') || '5')
    const aiCount = parseInt(localStorage.getItem('notification_ai_count') || '5')
    // Only calculate AI ratio if Google API key is set
    const hasApiKey = !!localStorage.getItem('google_api_key')
    const aiRatio = hasApiKey && (smartCount + aiCount) > 0 ? aiCount / (smartCount + aiCount) : 0

    const bookCounts = JSON.parse(localStorage.getItem('notification_book_counts') || '{}')

    console.log('Scheduling Debug:', {
        smartCount,
        aiCount,
        aiRatio,
        selectedBookIds,
        bookCounts
    })

    // Build queue based on per-book counts, but SUBTRACT existing count
    const queue: { bookId: number, useAI: boolean }[] = []

    // Deduplicate IDs just in case
    const uniqueBookIds = Array.from(new Set(selectedBookIds))

    for (const bookId of uniqueBookIds) {
        const targetCount = bookCounts[bookId] !== undefined ? bookCounts[bookId] : 1
        const existingCount = existingCountPerBook[bookId] || 0
        const needed = Math.max(0, targetCount - existingCount)

        console.log(`Book ${bookId}: target=${targetCount}, existing=${existingCount}, needed=${needed}`)

        for (let i = 0; i < needed; i++) {
            const useAI = Math.random() < aiRatio
            queue.push({ bookId, useAI })
        }
    }

    console.log('Generated Queue Size (only NEW needed):', queue.length)

    // Shuffle queue
    for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
    }

    if (queue.length === 0) {
        console.log('All books already have required notifications. Nothing new to add.')
        return
    }

    // Calculate start time aligned to system clock
    const intervalMinutes = getMinutesFromFrequency(frequency)
    const now = new Date()

    // Align to next interval (e.g. if 5m and now is 10:12, next is 10:15)
    // But first, we want an IMMEDIATE notification if possible, or very soon.
    // User said: "hemen başlasın" (start immediately).
    // So the first one should be NOW (or +10s).
    // The SUBSEQUENT ones should be aligned.

    // Actually, if we just start now, and add interval, it's 10:12, 10:17, 10:22.
    // User wants "dakika sırası doğru değil. sistem saatine göre sıralasın".
    // This implies 10:15, 10:20, 10:25.
    // So:
    // 1. First notification: NOW (Immediate)
    // 2. Second notification: Next Aligned Time (e.g. 10:15)
    // 3. Third+: Aligned + Interval

    // Calculate next aligned time
    let remainder = now.getMinutes()
    if (intervalMinutes < 60) {
        remainder = remainder % intervalMinutes
    }

    let minutesToAdd = intervalMinutes - remainder
    let alignedTime = new Date(now.getTime() + minutesToAdd * 60000)
    alignedTime.setSeconds(0)
    alignedTime.setMilliseconds(0)

    const googleApiKey = localStorage.getItem('google_api_key')
    const baseUrl = getBaseUrl()

    // Helper to schedule a single notification
    const scheduleItem = async (index: number, item: { bookId: number, useAI: boolean }): Promise<boolean> => {
        // Filter content for this specific book
        const bookContent = allContent.filter(c => c.bookId === item.bookId)
        if (bookContent.length === 0) return false

        const randomContent = bookContent[Math.floor(Math.random() * bookContent.length)]
        const book = await db.books.get(item.bookId)

        if (!book) return false

        let body = ''
        let title = book.title
        let originalTextForHighlight = ''

        if (item.useAI && googleApiKey) {
            try {
                // Determine if Ottoman (simple check)
                const isOttoman = book.series?.includes('Osmanlıca') || book.title.includes('Osmanlıca')
                const promptStyle = localStorage.getItem('notification_prompt_style') || 'short_quote'

                const aiResult = await generateNotificationContent(
                    book.title,
                    randomContent.plainText || randomContent.contentText,
                    promptStyle as any,
                    isOttoman
                )

                if (aiResult) {
                    title = aiResult.title
                    body = aiResult.body
                    if (aiResult.originalText) {
                        originalTextForHighlight = aiResult.originalText
                    }
                } else {
                    body = extractRandomSentence(randomContent.plainText || randomContent.contentText)
                    originalTextForHighlight = body
                }
            } catch (e) {
                console.warn('AI Generation failed, falling back to smart sentence', e)
                // Fallback to smart sentence
                body = extractRandomSentence(randomContent.plainText || randomContent.contentText)
                originalTextForHighlight = body
            }
        } else {
            // Smart Sentence Logic
            body = extractRandomSentence(randomContent.plainText || randomContent.contentText)
            originalTextForHighlight = body
        }

        // Append page number to body if not already there (AI might not include it)
        // body += ` (Sayfa: ${randomContent.pageNumber})` 

        // Skip if no meaningful content was extracted
        if (!body || body.trim().length === 0) {
            console.log('Skipping notification - no meaningful content extracted')
            return false
        }

        // Register every item as its own OS alarm. Native alarms begin one full
        // interval from now; web alarms retain their clock-aligned behavior.
        const scheduleTime = isWeb
            ? new Date(alignedTime.getTime() + index * intervalMinutes * 60 * 1000)
            : getNativeScheduleTime(now, index, intervalMinutes)

        // Keep book notification IDs away from the ranges used by notes and
        // ensure each pending item is represented separately by the OS.
        const id = 100000 + Math.floor(Math.random() * 1900000000)

        // Construct URL with highlight
        let targetUrl = `${baseUrl}#/reader/${book.id}/${randomContent.pageNumber}`
        if (originalTextForHighlight) {
            targetUrl += `?q=${encodeURIComponent(originalTextForHighlight)}`
        }

        // Use just the book title (no date in notification)
        // Date/time is stored in schedule.at and shown in Settings pending list
        const notificationData = {
            title: title,
            body: body,
            id: id,
            schedule: isWeb
                ? { at: scheduleTime }
                : { at: scheduleTime, allowWhileIdle: true },
            sound: undefined,
            attachments: undefined,
            actionTypeId: '',
            extra: {
                bookId: book.id,
                pageId: randomContent.pageNumber,
                url: targetUrl,
                isAI: item.useAI,
                originalTitle: title,
                formattedTime: formatTurkishDate(scheduleTime) // Store for display in Settings
            },
            sentViaOneSignal: false // Flag to prevent duplicates
        }

        // For Web, we simulate scheduling by saving to localStorage
        if (isWeb) {
            let sentViaOneSignal = false

            const existing = JSON.parse(localStorage.getItem('web_scheduled_notifications') || '[]')
            existing.push({
                ...notificationData,
                schedule: { at: scheduleTime.toISOString() }, // Serialize date
                sentViaOneSignal: sentViaOneSignal
            })
            // Sort by time
            existing.sort((a: any, b: any) => new Date(a.schedule.at).getTime() - new Date(b.schedule.at).getTime())
            localStorage.setItem('web_scheduled_notifications', JSON.stringify(existing))
        } else {
            await LocalNotifications.schedule({ notifications: [notificationData] })
        }

        return true
    }

    // Schedule from queue
    console.log(`Scheduling ${queue.length} notifications...`)

    // We process sequentially but don't block heavily
    for (let i = 0; i < queue.length; i++) {
        const scheduled = await scheduleItem(i, queue[i])
        if (!scheduled) continue
    }

    // START FIX: Update backup immediately after scheduling new batch
    if (!isWeb) {
        await backupMobileNotifications()
    }
}

// Reschedule existing notifications when frequency changes
// This preserves notification content but updates times
export const rescheduleExistingNotifications = async (newFrequency: NotificationFrequency) => {
    const isWeb = Capacitor.getPlatform() === 'web'
    const intervalMinutes = getMinutesFromFrequency(newFrequency)

    console.log(`Rescheduling existing notifications with new frequency: ${newFrequency} (${intervalMinutes} minutes)`)

    // Calculate aligned start time
    const now = new Date()
    let remainder = now.getMinutes()
    if (intervalMinutes < 60) {
        remainder = remainder % intervalMinutes
    }
    let minutesToAdd = intervalMinutes - remainder
    if (minutesToAdd === intervalMinutes) minutesToAdd = 0 // Already aligned
    let alignedTime = new Date(now.getTime() + minutesToAdd * 60000)
    alignedTime.setSeconds(0)
    alignedTime.setMilliseconds(0)

    if (isWeb) {
        const existing = JSON.parse(localStorage.getItem('web_scheduled_notifications') || '[]')
        if (existing.length === 0) {
            console.log('No existing notifications to reschedule')
            return
        }

        // Update each notification with new time
        const updated = existing.map((notif: any, index: number) => {
            const newTime = new Date(alignedTime.getTime() + index * intervalMinutes * 60 * 1000)
            const formattedTime = formatTurkishDate(newTime)
            const originalTitle = notif.extra?.originalTitle || notif.title.split(' - ')[0]

            return {
                ...notif,
                title: `${originalTitle} - ${formattedTime}`,
                schedule: { at: newTime.toISOString() },
                extra: { ...notif.extra, originalTitle }
            }
        })

        // Sort by time
        updated.sort((a: any, b: any) => new Date(a.schedule.at).getTime() - new Date(b.schedule.at).getTime())
        localStorage.setItem('web_scheduled_notifications', JSON.stringify(updated))
        console.log(`Rescheduled ${updated.length} web notifications`)
    } else {
        // For mobile, we need to cancel and recreate with new times
        const backup = JSON.parse(localStorage.getItem('mobile_pending_backup') || '[]')
        if (backup.length === 0) {
            console.log('No backup notifications to reschedule')
            return
        }

        // Cancel existing
        const pending = await LocalNotifications.getPending()
        if (pending.notifications.length > 0) {
            await LocalNotifications.cancel(pending)
        }

        // Schedule with new times
        const newNotifications = backup.map((notif: any, index: number) => {
            const newTime = new Date(alignedTime.getTime() + index * intervalMinutes * 60 * 1000)
            const formattedTime = formatTurkishDate(newTime)
            const originalTitle = notif.extra?.originalTitle || notif.title.split(' - ')[0]

            return {
                ...notif,
                title: `${originalTitle} - ${formattedTime}`,
                schedule: { at: newTime },
                extra: { ...notif.extra, originalTitle }
            }
        })

        for (const notif of newNotifications) {
            await LocalNotifications.schedule({ notifications: [notif] })
        }

        // Update backup
        localStorage.setItem('mobile_pending_backup', JSON.stringify(newNotifications))
        console.log(`Rescheduled ${newNotifications.length} mobile notifications`)
    }
}

// Replenish notifications on app load to maintain buffer
export const replenishNotifications = async () => {
    const isWeb = Capacitor.getPlatform() === 'web'

    // FIX: Sync history first to capture any that fired while closed
    if (!isWeb) {
        await syncMobileHistory()
    }
    const enabled = localStorage.getItem('notifications_enabled') === 'true'
    if (!enabled) return

    const frequency = (localStorage.getItem('notification_frequency') as NotificationFrequency) || '4h'
    const selectedBookIds = JSON.parse(localStorage.getItem('notification_book_ids') || '[]')

    if (selectedBookIds.length === 0) return

    // Migrate the single repeating alarm created by v1.1.6 into the corrected
    // multi-item queue automatically after an app update.
    if (!isWeb) {
        const pending = await LocalNotifications.getPending()
        const hasLegacySingleAlarm = pending.notifications.some(notification =>
            notification.id === LEGACY_BOOK_ALARM_ID || notification.extra?.recurringAlarm === true
        )
        if (hasLegacySingleAlarm) {
            await scheduleNotifications(frequency, selectedBookIds, true)
            return
        }
    }

    // Get counts
    // Get counts
    // const smartCount = parseInt(localStorage.getItem('notification_smart_count') || '5')
    // const aiCount = parseInt(localStorage.getItem('notification_ai_count') || '5')
    // aiRatio unused here, removing
    // const aiRatio = (smartCount + aiCount) > 0 ? aiCount / (smartCount + aiCount) : 0
    const bookCounts = JSON.parse(localStorage.getItem('notification_book_counts') || '{}')

    // Calculate total target based on book counts
    let totalTarget = 0
    for (const bookId of selectedBookIds) {
        totalTarget += (bookCounts[bookId] !== undefined ? bookCounts[bookId] : 1)
    }

    let currentCount = 0
    // lastScheduleTime unused here, removing
    // let lastScheduleTime = new Date()

    if (isWeb) {
        const existing = JSON.parse(localStorage.getItem('web_scheduled_notifications') || '[]')
        currentCount = existing.length
    } else {
        const pending = await LocalNotifications.getPending()
        currentCount = pending.notifications.filter(notification =>
            notification.extra?.bookId && notification.extra?.type !== 'note'
        ).length
        if (currentCount >= totalTarget) return
    }


    // Get settings
    // const bookCounts = JSON.parse(localStorage.getItem('notification_book_counts') || '{}') // Duplicate definition
    const hasApiKey = !!localStorage.getItem('google_api_key')
    // Set AI ratio to 0 if no API key
    const aiRatioSetting = hasApiKey ? parseInt(localStorage.getItem('notification_ai_ratio') || '50') : 0
    const promptStyle = localStorage.getItem('notification_prompt_style') || 'short_quote'

    // Get existing pending notifications to implement "Replenish" logic
    let existingPending: any[] = []
    if (isWeb) {
        existingPending = JSON.parse(localStorage.getItem('web_scheduled_notifications') || '[]')
    } else {
        const pending = await LocalNotifications.getPending()
        existingPending = pending.notifications
    }

    // Filter out notifications for books that are no longer selected
    const validPending = existingPending.filter(n => {
        const bookId = n.extra?.bookId
        // Type safe comparison
        return bookId && selectedBookIds.some((id: number) => Number(id) === Number(bookId))
    })

    // If not enabled, just clear everything
    if (!enabled) {
        if (isWeb) {
            localStorage.setItem('web_scheduled_notifications', '[]')
        } else {
            const pending = await LocalNotifications.getPending()
            if (pending.notifications.length > 0) {
                await LocalNotifications.cancel(pending)
            }
        }
        return
    }

    // Cancel invalid notifications (books unselected)
    const invalidIds = existingPending.filter(n => !validPending.find(vp => vp.id === n.id)).map(n => n.id)
    if (invalidIds.length > 0) {
        if (isWeb) {
            localStorage.setItem('web_scheduled_notifications', JSON.stringify(validPending))
        } else {
            await LocalNotifications.cancel({ notifications: invalidIds.map(id => ({ id })) })
        }
    }

    const notifications: any[] = []

    // Determine start time for new notifications
    const intervalMinutes = getMinutesFromFrequency(frequency)
    let lastScheduleTimeForNew = new Date()

    if (validPending.length > 0) {
        // Continue from last existing notification
        const times = validPending.map(n => new Date(n.schedule?.at || n.at).getTime())
        lastScheduleTimeForNew = new Date(Math.max(...times))
    } else {
        // Start fresh - align to system time
        const now = new Date()
        let remainder = now.getMinutes()
        if (intervalMinutes < 60) {
            remainder = remainder % intervalMinutes
        }

        let minutesToAdd = intervalMinutes - remainder
        lastScheduleTimeForNew = new Date(now.getTime() + minutesToAdd * 60000)
        lastScheduleTimeForNew.setSeconds(0)
        lastScheduleTimeForNew.setMilliseconds(0)

        // Subtract one interval because we add it in the loop
        lastScheduleTimeForNew = new Date(lastScheduleTimeForNew.getTime() - intervalMinutes * 60000)
    }

    for (const bookId of selectedBookIds) {
        const targetCount = bookCounts[bookId] || 1
        if (targetCount <= 0) continue

        // Count how many we already have for this book
        const currentCount = validPending.filter(n => n.extra?.bookId === bookId).length
        const needed = targetCount - currentCount

        if (needed <= 0) {
            console.log(`Book ${bookId} already has ${currentCount}/${targetCount} notifications. Skipping.`)
            continue
        }

        console.log(`Replenishing book ${bookId}: Needs ${needed} more (Target: ${targetCount}, Current: ${currentCount})`)

        const book = await db.books.get(bookId)
        if (!book) continue

        // Determine if Ottoman book
        const isOttoman = book.series?.includes('Osmanlıca') || book.title.includes('Osmanlıca')

        // Get total pages
        const totalPages = await db.bookContent.where('bookId').equals(bookId).count()
        if (totalPages === 0) continue

        for (let i = 0; i < needed; i++) {
            // Random page
            const randomPage = Math.floor(Math.random() * totalPages) + 1
            const content = await db.bookContent.where('[bookId+pageNumber]').equals([bookId, randomPage]).first()

            if (!content) continue

            // Determine type based on Ratio
            // If Ottoman, FORCE AI (100% AI) because we need dual language/translation
            let type: 'smart' | 'ai' = 'smart'
            if (isOttoman) {
                type = 'ai'
            } else {
                // Random check against ratio
                // aiRatioSetting 30 means 30% chance of AI
                type = Math.random() * 100 < aiRatioSetting ? 'ai' : 'smart'
            }

            let title = book.title
            let body = ''
            let isAI = false
            let originalTextForHighlight = ''

            if (type === 'smart') {
                const sentence = extractRandomSentence(content.plainText || content.contentText)
                if (!sentence) continue
                body = `"${sentence}"`
                originalTextForHighlight = sentence
            } else {
                // AI Generation
                // Pass promptStyle and isOttoman flag
                const aiResult = await generateNotificationContent(
                    book.title,
                    content.plainText || content.contentText,
                    promptStyle as any, // Cast to expected type
                    isOttoman
                )
                if (aiResult) {
                    title = aiResult.title
                    body = aiResult.body
                    isAI = true
                    if (aiResult.originalText) {
                        originalTextForHighlight = aiResult.originalText
                    }
                } else {
                    // Fallback to smart if AI fails
                    const sentence = extractRandomSentence(content.plainText || content.contentText)
                    if (!sentence) continue
                    body = `"${sentence}"`
                    originalTextForHighlight = sentence
                }
            }

            // Skip if no meaningful content was extracted
            if (!body || body.trim().length === 0) {
                console.log('Skipping notification - no meaningful content extracted')
                continue
            }

            // Schedule time: EXACT interval from last time (Fixed: Removed Jitter)
            lastScheduleTimeForNew = new Date(lastScheduleTimeForNew.getTime() + intervalMinutes * 60000)
            const scheduleTime = new Date(lastScheduleTimeForNew.getTime())

            const id = Math.floor(Math.random() * 1000000) + 1

            // Construct URL with highlight if available
            let targetUrl = `${getBaseUrl()}#/reader/${book.id}/${randomPage}`

            if (originalTextForHighlight) {
                targetUrl += `?q=${encodeURIComponent(originalTextForHighlight)}`
            }

            const notification = {
                id,
                title,
                body,
                schedule: { at: scheduleTime },
                sound: 'beep.wav',
                attachments: null,
                actionTypeId: '',
                extra: {
                    bookId: book.id,
                    pageId: randomPage,
                    isAI,
                    url: targetUrl
                }
            }

            notifications.push(notification)

            // Also schedule Push Notification (OneSignal) if configured
            // Note: OneSignal REST API scheduling is complex for individual users without external backend
            // For now, we rely on LocalNotifications for the device.
            // If we wanted to use OneSignal for "offline" delivery, we'd need to send this schedule to a server
            // or use OneSignal's "send after" feature via client SDK if supported (mostly server-side).
            // Given the constraints, we'll stick to LocalNotifications which work offline on mobile
            // as long as the app was opened once to schedule them.

            // However, user asked: "One signal aktif değilse de bildirim gidiyor değil mi?"
            // Answer: Yes, LocalNotifications work locally.
        }
    }

    if (notifications.length > 0) {
        if (isWeb) {
            // Merge with valid pending
            const newWebPending = [...validPending, ...notifications].sort((a, b) => new Date(a.schedule.at).getTime() - new Date(b.schedule.at).getTime())
            localStorage.setItem('web_scheduled_notifications', JSON.stringify(newWebPending))
            console.log('Web notifications scheduled:', newWebPending)
        } else {
            await LocalNotifications.schedule({ notifications })
            console.log('Mobile notifications scheduled:', notifications)
        }
    }

    // Also schedule note notifications (independent system)
    await scheduleNoteNotifications()
}

export const cancelAllNotifications = async () => {
    const isWeb = Capacitor.getPlatform() === 'web'
    if (isWeb) {
        // WE NEVER DELETE DATA FOR WEB, just rely on enabled flag
        // localStorage.setItem('web_scheduled_notifications', '[]') 
        console.log('Web notifications paused (data kept)')
    } else {
        // For Mobile, backup first!
        await backupMobileNotifications()

        const pending = await LocalNotifications.getPending()
        if (pending.notifications.length > 0) {
            await LocalNotifications.cancel(pending)
        }
        console.log('Mobile notifications cancelled (data backed up)')
    }
}

// Helper to remove from web pending
const removeFromWebPending = (id: number) => {
    const existing = JSON.parse(localStorage.getItem('web_scheduled_notifications') || '[]')
    const updated = existing.filter((n: any) => n.id !== id)
    localStorage.setItem('web_scheduled_notifications', JSON.stringify(updated))
}



// Polling function for web notifications
export const checkWebNotifications = async () => {
    const isWeb = Capacitor.getPlatform() === 'web'
    if (!isWeb) return

    const existing = JSON.parse(localStorage.getItem('web_scheduled_notifications') || '[]')
    if (existing.length === 0) return

    const now = Date.now()

    // Check for Service Worker registration
    let registration: ServiceWorkerRegistration | undefined
    if ('serviceWorker' in navigator) {
        registration = await navigator.serviceWorker.ready
    }

    const baseUrl = getBaseUrl()
    let anyNotificationSent = false

    for (const notif of existing) {
        const scheduleTime = new Date(notif.schedule.at).getTime()

        // Check if it's time (or passed time within last 5 minutes to avoid flood)
        if (scheduleTime <= now && scheduleTime > now - 5 * 60 * 1000) {
            console.log(`Triggering notification ${notif.id}`)

            // If sent via OneSignal, do not show local notification to avoid duplicates
            if (notif.sentViaOneSignal) {
                console.log(`Skipping local notification ${notif.id} (Handled by OneSignal)`)
                // Still move to history and remove from pending
                addToHistory({
                    id: notif.id,
                    title: notif.title,
                    body: notif.body,
                    sentAt: new Date().toISOString(),
                    bookId: notif.extra.bookId,
                    pageId: notif.extra.pageId
                })
                removeFromWebPending(notif.id)
                anyNotificationSent = true
                continue
            }

            if (registration) {
                // Use Service Worker to show notification (Handles click better)
                registration.showNotification(notif.title, {
                    body: notif.body,
                    icon: baseUrl + 'icon-192x192.png',
                    requireInteraction: true,
                    data: notif.extra
                })
            } else {
                // Fallback for no SW (should rarely happen if PWA is set up)
                const n = new Notification(notif.title, {
                    body: notif.body,
                    icon: baseUrl + 'icon-192x192.png',
                    requireInteraction: true,
                    data: notif.extra
                })

                n.onclick = (e) => {
                    e.preventDefault()
                    n.close()
                    window.focus()
                    window.location.href = notif.extra.url
                }
            }

            // Move to history
            addToHistory({
                id: notif.id,
                title: notif.title,
                body: notif.body,
                sentAt: new Date().toISOString(),
                bookId: notif.extra.bookId,
                pageId: notif.extra.pageId,
                isAI: notif.extra?.isAI || false,
                url: notif.extra?.url
            })

            // Remove from pending
            removeFromWebPending(notif.id)
            anyNotificationSent = true
        } else if (scheduleTime <= now - 5 * 60 * 1000) {
            // Too old, just remove
            removeFromWebPending(notif.id)
            anyNotificationSent = true
        }
    }

    // Replenish notifications if any were sent
    if (anyNotificationSent) {
        console.log('Notifications sent, replenishing...')
        await replenishNotifications()
    }
}

export const sendTestNotification = async (selectedBookIds: number[]) => {
    const isWeb = Capacitor.getPlatform() === 'web'

    if (selectedBookIds.length === 0) {
        throw new Error('Lütfen en az bir kitap seçin')
    }

    // Pick random book and content
    const allContent = await db.bookContent
        .where('bookId')
        .anyOf(selectedBookIds)
        .toArray()

    if (allContent.length === 0) {
        throw new Error('Seçilen kitaplarda içerik bulunamadı')
    }

    const randomContent = allContent[Math.floor(Math.random() * allContent.length)]
    const book = await db.books.get(randomContent.bookId)

    if (!book) throw new Error('Kitap bulunamadı')

    let body = ''
    let title = book.title

    let originalTextForHighlight = ''

    // Tefeül uses smart sentence extraction directly (no AI)
    const sentence = extractRandomSentence(randomContent.plainText || randomContent.contentText)
    if (sentence) {
        body = sentence
        originalTextForHighlight = sentence
    }

    // Validate we have content
    if (!body || body.trim().length === 0) {
        throw new Error('İçerik oluşturulamadı. Kitap içi metin bulunamadı.')
    }

    const baseUrl = getBaseUrl()
    let targetUrl = `${baseUrl}#/reader/${book.id}/${randomContent.pageNumber}`

    if (originalTextForHighlight) {
        targetUrl += `?q=${encodeURIComponent(originalTextForHighlight)}`
    }

    if (isWeb) {
        // Timeout helper
        const withTimeout = <T>(promise: Promise<T>, ms: number, msg: string): Promise<T> => {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error(msg)), ms)
                promise.then(
                    (res) => { clearTimeout(timer); resolve(res) },
                    (err) => { clearTimeout(timer); reject(err) }
                )
            })
        }

        // Check and request permission
        let permission = Notification.permission
        console.log('Current permission:', permission)

        if (permission === 'default') {
            try {
                permission = await withTimeout(Notification.requestPermission(), 10000, 'İzin isteği zaman aşımına uğradı') as NotificationPermission
            } catch (e) {
                console.warn('Permission warning:', e)
            }
        }

        if (permission !== 'granted') {
            throw new Error('Bildirim izni verilmedi. Lütfen tarayıcı ayarlarından izin verin.')
        }

        // Method 1: Try Standard Notification API
        try {
            const n = new Notification(title, {
                body: body,
                icon: baseUrl + 'icon-192x192.png',
                requireInteraction: true,
                data: { url: targetUrl }
            })
            n.onclick = (e) => {
                e.preventDefault()
                n.close()
                window.focus()
                window.location.href = targetUrl
            }
            return body
        } catch (e) {
            console.warn('Standard Notification API failed, trying Service Worker...', e)
        }

        // Method 2: Try Service Worker (Required for Android/PWA)
        if ('serviceWorker' in navigator) {
            try {
                const registration = await withTimeout(
                    navigator.serviceWorker.ready,
                    5000,
                    'Service Worker yanıt vermedi (5s). Sayfayı yenilemeyi deneyin.'
                ) as ServiceWorkerRegistration

                if (registration) {
                    await registration.showNotification(title, {
                        body: body,
                        icon: baseUrl + 'icon-192x192.png',
                        data: { url: targetUrl }
                    })
                    return body
                }
            } catch (e) {
                console.error('Service Worker notification failed:', e)
                throw e // Re-throw to show alert
            }
        }

        throw new Error('Bildirim oluşturulamadı. Servis Worker bulunamadı.')
    } else {
        const permStatus = await LocalNotifications.requestPermissions()
        if (permStatus.display !== 'granted') {
            throw new Error('Bildirim izni verilmedi')
        }

        await LocalNotifications.schedule({
            notifications: [
                {
                    title: title,
                    body: body,
                    id: Math.floor(Math.random() * 100000),
                    schedule: { at: new Date(Date.now() + 1000) },
                    sound: undefined,
                    attachments: undefined,
                    actionTypeId: "",
                    extra: {
                        bookId: book.id,
                        pageId: randomContent.pageNumber,
                        url: targetUrl
                    }
                }
            ]
        })

        // FIX: Add to history immediately for Tefeül/Test
        addToHistory({
            id: Date.now(), // Unique enough for history
            title: title,
            body: body,
            sentAt: new Date().toISOString(),
            bookId: book.id,
            pageId: randomContent.pageNumber,
            isAI: false,
            url: targetUrl,
            isRead: true
        })

        return body
    }
}

// Update notification times without regenerating content
// This only updates the schedule.at times based on new frequency
export const updateNotificationTimes = async (frequency: NotificationFrequency): Promise<void> => {
    const isWeb = Capacitor.getPlatform() === 'web'
    const intervalMinutes = getMinutesFromFrequency(frequency)

    // Calculate aligned start time (e.g., if 5m interval and now is 22:32, start at 22:35)
    const now = new Date()
    let remainder = now.getMinutes()
    if (intervalMinutes < 60) {
        remainder = remainder % intervalMinutes
    }
    let minutesToAdd = intervalMinutes - remainder
    if (minutesToAdd === intervalMinutes) minutesToAdd = 0 // Already aligned
    let alignedTime = new Date(now.getTime() + minutesToAdd * 60000)
    alignedTime.setSeconds(0)
    alignedTime.setMilliseconds(0)

    console.log(`Updating notification times with ${intervalMinutes}m intervals, starting at ${alignedTime.toLocaleTimeString()}`)

    if (isWeb) {
        const existingNotifications = JSON.parse(localStorage.getItem('web_scheduled_notifications') || '[]')

        if (existingNotifications.length === 0) {
            console.log('No existing notifications to update')
            return
        }

        // Update each notification with new aligned time (no date in title)
        const updatedNotifications = existingNotifications.map((notif: any, index: number) => {
            const newTime = new Date(alignedTime.getTime() + index * intervalMinutes * 60000)
            const originalTitle = notif.extra?.originalTitle || notif.title.split(' - ')[0]

            return {
                ...notif,
                title: originalTitle,
                schedule: {
                    ...notif.schedule,
                    at: newTime.toISOString()
                },
                extra: { ...notif.extra, originalTitle, formattedTime: formatTurkishDate(newTime) }
            }
        })

        localStorage.setItem('web_scheduled_notifications', JSON.stringify(updatedNotifications))
        localStorage.setItem('notification_frequency', frequency)

        console.log(`Updated ${updatedNotifications.length} notification times`)
    } else {
        // For mobile, use backup to get extra data, then reschedule
        const backup = JSON.parse(localStorage.getItem('mobile_pending_backup') || '[]')
            .filter((notification: any) => notification.extra?.bookId && notification.extra?.type !== 'note')
        const pending = await LocalNotifications.getPending()
        const pendingBooks = pending.notifications.filter(notification =>
            notification.extra?.bookId && notification.extra?.type !== 'note'
        )

        if (pendingBooks.length === 0 && backup.length === 0) {
            console.log('No pending notifications to update')
            return
        }

        // Cancel only book notifications; note alarms are independent.
        if (pendingBooks.length > 0) {
            await LocalNotifications.cancel({ notifications: pendingBooks.map(n => ({ id: n.id })) })
        }

        // Use backup for extra data, or fall back to pending list
        const sourceList = backup.length > 0 ? backup : pendingBooks

        // Reschedule with new aligned times (no date in title)
        const rescheduled = sourceList.map((notif: any, index: number) => {
            const newTime = new Date(now.getTime() + (index + 1) * intervalMinutes * 60000)
            const originalTitle = notif.extra?.originalTitle || notif.title?.split(' - ')[0] || 'Bildirim'

            return {
                ...notif,
                title: originalTitle,
                schedule: {
                    ...notif.schedule,
                    at: newTime,
                    allowWhileIdle: true
                },
                extra: { ...notif.extra, originalTitle, formattedTime: formatTurkishDate(newTime) }
            }
        })

        for (const notif of rescheduled) {
            await LocalNotifications.schedule({ notifications: [notif] })
        }

        // Update backup
        localStorage.setItem('mobile_pending_backup', JSON.stringify(rescheduled))
        localStorage.setItem('notification_frequency', frequency)

        console.log(`Rescheduled ${rescheduled.length} notifications with new times`)
    }
}
