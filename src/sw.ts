import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'

/// <reference lib="webworker" />

declare let self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()

precacheAndRoute(self.__WB_MANIFEST)

self.skipWaiting()
clientsClaim()

// Notification Click Handler
self.addEventListener('notificationclick', (event: any) => {
    event.notification.close()

    if (event.notification.data && event.notification.data.url) {
        const targetUrl = event.notification.data.url
        console.log('Notification clicked, opening:', targetUrl)

        event.waitUntil(
            self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                // 1. Try to find an existing window to focus
                for (const client of clientList) {
                    // Check if same origin and can focus
                    if (client.url.startsWith(self.location.origin) && 'focus' in client) {
                        return (client as WindowClient).focus().then((focusedClient) => {
                            // Optional: Navigate to key URL if needed, or just let app handle hash change
                            if (focusedClient) {
                                return focusedClient.navigate(targetUrl)
                            }
                        })
                    }
                }

                // 2. If no window is open, open a new one
                if (self.clients.openWindow) {
                    return self.clients.openWindow(targetUrl)
                }
            })
        )
    }
})
