import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
    isOpen: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    type?: 'danger' | 'warning' | 'info'
    onConfirm: () => void
    onCancel: () => void
}

const TYPE_STYLES = {
    danger: {
        icon: '🗑️',
        confirmBg: 'bg-red-600 hover:bg-red-700',
        headerBg: 'bg-red-50 dark:bg-red-900/20'
    },
    warning: {
        icon: '⚠️',
        confirmBg: 'bg-yellow-600 hover:bg-yellow-700',
        headerBg: 'bg-yellow-50 dark:bg-yellow-900/20'
    },
    info: {
        icon: 'ℹ️',
        confirmBg: 'bg-accent hover:bg-blue-600',
        headerBg: 'bg-blue-50 dark:bg-blue-900/20'
    }
}

export default function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmLabel = 'Evet',
    cancelLabel = 'Hayır',
    type = 'warning',
    onConfirm,
    onCancel
}: ConfirmDialogProps) {
    const dialogRef = useRef<HTMLDivElement>(null)
    const styles = TYPE_STYLES[type]

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
        }
        return () => {
            document.body.style.overflow = ''
        }
    }, [isOpen])

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel()
        }
        if (isOpen) {
            document.addEventListener('keydown', handleEsc)
        }
        return () => document.removeEventListener('keydown', handleEsc)
    }, [isOpen, onCancel])

    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
            onClick={onCancel}
        >
            <div
                ref={dialogRef}
                className="bg-white dark:bg-gray-900 rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden animate-slide-down"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`px-5 py-4 ${styles.headerBg}`}>
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">{styles.icon}</span>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {title}
                        </h3>
                    </div>
                </div>

                {/* Body */}
                <div className="px-5 py-4">
                    <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                        {message}
                    </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3 px-5 pb-5">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 px-4 py-2.5 text-white rounded-xl font-medium transition ${styles.confirmBg}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
