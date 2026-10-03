import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
    id: number
    message: string
    type: ToastType
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
    const context = useContext(ToastContext)
    if (!context) {
        throw new Error('useToast must be used within ToastProvider')
    }
    return context
}

// Standalone function for use outside React components
let globalShowToast: ((message: string, type?: ToastType) => void) | null = null

export function showToast(message: string, type: ToastType = 'info') {
    if (globalShowToast) {
        globalShowToast(message, type)
    } else {
        // Fallback to console if provider not ready
        console.log(`[Toast ${type}]: ${message}`)
    }
}

const TOAST_ICONS: Record<ToastType, string> = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
}

const TOAST_COLORS: Record<ToastType, string> = {
    success: 'bg-green-600 text-white',
    error: 'bg-red-600 text-white',
    warning: 'bg-yellow-500 text-gray-900',
    info: 'bg-blue-600 text-white'
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const addToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = Date.now()
        setToasts(prev => [...prev, { id, message, type }])

        // Auto remove after 3 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, 3000)
    }, [])

    // Set global function
    globalShowToast = addToast

    const removeToast = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }

    return (
        <ToastContext.Provider value={{ showToast: addToast }}>
            {children}

            {/* Toast Container - Fixed at top */}
            <div className="fixed top-0 left-0 right-0 z-[100] pointer-events-none flex flex-col items-center pt-4 gap-2 px-4">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`
              pointer-events-auto
              px-4 py-3 rounded-xl shadow-lg
              flex items-center gap-3 min-w-[280px] max-w-[90vw]
              animate-slide-down
              ${TOAST_COLORS[toast.type]}
            `}
                        onClick={() => removeToast(toast.id)}
                    >
                        <span className="text-lg flex-shrink-0">{TOAST_ICONS[toast.type]}</span>
                        <span className="text-sm font-medium flex-1">{toast.message}</span>
                        <button
                            className="opacity-70 hover:opacity-100 transition text-current"
                            onClick={(e) => {
                                e.stopPropagation()
                                removeToast(toast.id)
                            }}
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    )
}
