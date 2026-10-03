import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { addNote, updateNote, type Note, getNoteNotificationSettings, updateNoteNotificationSettings, type NoteNotificationSettings } from '../lib/db'
import { cancelNoteNotifications, scheduleNoteNotifications } from '../lib/noteNotifications'
import NotificationFrequencySelector from './NotificationFrequencySelector'
import { showToast } from './Toast'

interface NoteEditorProps {
    note: Note | null
    onSave: () => void
    onCancel: () => void
    showExtras?: boolean // Show extra buttons like "Go to Notes" and "Notifications"
}

export default function NoteEditor({ note, onSave, onCancel, showExtras = false }: NoteEditorProps) {
    const navigate = useNavigate()
    const [content, setContent] = useState(note?.content || '')
    const [saving, setSaving] = useState(false)
    const [notifSettings, setNotifSettings] = useState<NoteNotificationSettings | null>(null)
    const [showNotifSettings, setShowNotifSettings] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        // Auto-focus and move cursor to end
        if (textareaRef.current) {
            textareaRef.current.focus()
            textareaRef.current.setSelectionRange(content.length, content.length)
        }
        // Load notification settings
        loadNotifSettings()
    }, [])

    useEffect(() => {
        // Auto-grow textarea
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
        }
    }, [content])

    const loadNotifSettings = async () => {
        try {
            const settings = await getNoteNotificationSettings()
            setNotifSettings(settings)
        } catch (e) {
            console.error('Failed to load notif settings', e)
        }
    }

    const toggleNotifications = async () => {
        if (!notifSettings) return
        try {
            const newEnabled = !notifSettings.enabled
            await updateNoteNotificationSettings({ enabled: newEnabled })
            if (newEnabled) {
                await scheduleNoteNotifications()
                showToast('Bildirimler açıldı', 'success')
            } else {
                await cancelNoteNotifications()
                showToast('Bildirimler kapatıldı', 'info')
            }
            await loadNotifSettings()
        } catch (e) {
            console.error('Failed to toggle notifications', e)
            showToast('Bildirim ayarı değiştirilemedi', 'error')
        }
    }

    const updateFrequency = async (freq: number) => {
        try {
            await updateNoteNotificationSettings({ frequency: freq })
            if (notifSettings?.enabled) {
                await scheduleNoteNotifications()
            }
            await loadNotifSettings()
            showToast('Bildirim sıklığı güncellendi', 'success')
        } catch (e) {
            console.error('Failed to update frequency', e)
            showToast('Sıklık güncellenemedi', 'error')
        }
    }

    const handleSave = async () => {
        if (content.trim().length === 0) {
            showToast('Not boş olamaz', 'warning')
            return
        }

        setSaving(true)
        try {
            if (note?.id) {
                await updateNote(note.id, content.trim())
                showToast('Not güncellendi', 'success')
            } else {
                await addNote(content.trim())
                showToast('Not kaydedildi', 'success')
            }
            onSave()
        } catch (error) {
            console.error('Failed to save note:', error)
            showToast('Not kaydedilirken bir hata oluştu', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // Ctrl+Enter or Cmd+Enter to save
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault()
            handleSave()
        }
        // Escape to cancel
        if (e.key === 'Escape') {
            onCancel()
        }
    }

    const goToNotes = () => {
        onCancel()
        navigate('/?tab=notes')
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onCancel}>
            <div
                className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {note ? '📝 Notu Düzenle' : '📝 Yeni Not'}
                    </h3>

                    {/* Mini Actions */}
                    <div className="flex items-center gap-2">
                        {showExtras && notifSettings && (
                            <>
                                {/* Notification Toggle */}
                                <button
                                    onClick={toggleNotifications}
                                    className={`p-2 rounded-full transition ${notifSettings.enabled
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                                        }`}
                                    title={notifSettings.enabled ? 'Bildirimler Açık' : 'Bildirimler Kapalı'}
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                    </svg>
                                </button>

                                {/* Settings Toggle */}
                                <button
                                    onClick={() => setShowNotifSettings(!showNotifSettings)}
                                    className={`p-2 rounded-full transition ${showNotifSettings
                                        ? 'bg-accent text-white'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                        }`}
                                    title="Bildirim Ayarları"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </button>

                                {/* Go to Notes */}
                                <button
                                    onClick={goToNotes}
                                    className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                                    title="Notlarıma Git"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                </button>
                            </>
                        )}

                        {/* Close */}
                        <button
                            onClick={onCancel}
                            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Notification Settings Panel (Collapsible) */}
                {showExtras && showNotifSettings && notifSettings && (
                    <div className="px-5 py-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                        <div className="mb-3">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
                                🔔 Bildirim Sıklığı
                            </label>
                            <NotificationFrequencySelector
                                value={notifSettings.frequency}
                                onChange={updateFrequency}
                            />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {notifSettings.enabled
                                ? '✅ Bildirimler aktif - Notlarınız belirlenen sıklıkta gönderilecek'
                                : '⏸️ Bildirimler kapalı - Yukarıdaki 🔔 butonuyla açabilirsiniz'}
                        </p>
                    </div>
                )}

                {/* Content */}
                <div className="p-5">
                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Notunuzu buraya yazın..."
                        className="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/50 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white resize-none min-h-[150px] text-base"
                        style={{ overflow: 'hidden' }}
                    />

                    {/* Character count */}
                    <div className="flex justify-between items-center mt-2 px-1">
                        <span className="text-xs text-gray-400">
                            {content.length} karakter
                        </span>
                        <span className="text-xs text-gray-400">
                            ⌘+Enter
                        </span>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex gap-3 px-5 pb-5">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                        disabled={saving}
                    >
                        İptal
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || content.trim().length === 0}
                        className="flex-1 px-4 py-3 bg-accent text-white rounded-xl font-medium hover:bg-blue-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? '...' : 'Kaydet'}
                    </button>
                </div>
            </div>
        </div>
    )
}
