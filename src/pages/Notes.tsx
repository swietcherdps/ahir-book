import { useState, useEffect } from 'react'
import { getNotes, deleteNote, getNoteNotificationSettings, updateNoteNotificationSettings, type Note, type NoteNotificationSettings } from '../lib/db'
import { scheduleNoteNotifications, cancelNoteNotifications } from '../lib/noteNotifications'
import NoteEditor from '../components/NoteEditor'
import NotificationFrequencySelector from '../components/NotificationFrequencySelector'
import { showToast } from '../components/Toast'

export default function Notes() {
    const [notes, setNotes] = useState<Note[]>([])
    const [loading, setLoading] = useState(true)
    const [showEditor, setShowEditor] = useState(false)
    const [editingNote, setEditingNote] = useState<Note | null>(null)
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

    // Notification settings
    const [showNotifModal, setShowNotifModal] = useState(false)
    const [notifSettings, setNotifSettings] = useState<NoteNotificationSettings | null>(null)

    useEffect(() => {
        loadNotes()
        loadNotifSettings()
    }, [])

    const loadNotes = async () => {
        setLoading(true)
        try {
            const allNotes = await getNotes()
            setNotes(allNotes)
        } catch (error) {
            console.error('Failed to load notes:', error)
        } finally {
            setLoading(false)
        }
    }

    const loadNotifSettings = async () => {
        try {
            const settings = await getNoteNotificationSettings()
            setNotifSettings(settings)
        } catch (error) {
            console.error('Failed to load notification settings:', error)
        }
    }

    const handleAddNote = () => {
        setEditingNote(null)
        setShowEditor(true)
    }

    const handleEditNote = (note: Note) => {
        setEditingNote(note)
        setShowEditor(true)
    }

    const handleDeleteNote = async (id: number) => {
        try {
            await deleteNote(id)
            await loadNotes()
            setDeleteConfirmId(null)
        } catch (error) {
            console.error('Failed to delete note:', error)
            showToast('Not silinirken bir hata oluştu', 'error')
        }
    }

    const handleSave = async () => {
        setShowEditor(false)
        await loadNotes()
    }

    const toggleNotifications = async () => {
        if (!notifSettings) return

        const newEnabled = !notifSettings.enabled
        await updateNoteNotificationSettings({ enabled: newEnabled })

        if (newEnabled) {
            await scheduleNoteNotifications()
        } else {
            await cancelNoteNotifications()
        }

        await loadNotifSettings()
    }

    const updateFrequency = async (freq: number) => {
        await updateNoteNotificationSettings({ frequency: freq })
        if (notifSettings?.enabled) {
            await scheduleNoteNotifications()
        }
        await loadNotifSettings()
    }

    const updateMode = async (mode: 'sequential' | 'random') => {
        await updateNoteNotificationSettings({ mode })
        await loadNotifSettings()
    }

    const formatDate = (date: Date) => {
        return new Intl.DateTimeFormat('tr-TR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(date))
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-background dark:bg-black flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background dark:bg-black p-4 pb-24">
            <div className="max-w-4xl mx-auto">
                <header className="mb-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-primary dark:text-gray-100">Notlarım</h1>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Kişisel notlarınızı oluşturun ve hatırlatıcı olarak kullanın
                            </p>
                        </div>
                        {/* Notification Settings Button - Only bell icon */}
                        <button
                            onClick={() => setShowNotifModal(true)}
                            className={`p-2.5 rounded-xl transition ${notifSettings?.enabled
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-400'
                                }`}
                            title="Bildirim Ayarları"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                        </button>
                    </div>
                </header>

                {notes.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="w-24 h-24 bg-gray-100 dark:bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Henüz not eklemediniz
                        </h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-6">
                            İlk notunuzu oluşturmak için aşağıdaki butona tıklayın
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {notes.map((note) => (
                            <div
                                key={note.id}
                                className="bg-white dark:bg-gray-900 rounded-xl shadow-sm p-4 hover:shadow-md transition"
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex-1">
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            {formatDate(note.updatedAt)}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleEditNote(note)}
                                            className="p-2 text-accent hover:bg-blue-50 dark:hover:bg-gray-700 rounded-lg transition"
                                            title="Düzenle"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => setDeleteConfirmId(note.id!)}
                                            className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
                                            title="Sil"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                <p className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                                    {note.content.length > 300 ? note.content.substring(0, 300) + '...' : note.content}
                                </p>
                            </div>
                        ))}
                    </div>
                )}

                {/* Floating Add Button */}
                <button
                    onClick={handleAddNote}
                    className="fixed bottom-24 right-6 w-14 h-14 bg-accent text-white rounded-full shadow-lg hover:bg-blue-600 transition flex items-center justify-center z-40"
                    title="Yeni Not Ekle"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                </button>

                {/* Full Notification Settings Modal */}
                {showNotifModal && notifSettings && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNotifModal(false)}>
                        <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-md shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                            <div className="p-5">
                                <div className="flex items-center justify-between mb-5">
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">🔔 Not Bildirimleri</h3>
                                    <button
                                        onClick={() => setShowNotifModal(false)}
                                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition"
                                    >
                                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                {/* Enable/Disable Toggle */}
                                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl mb-4">
                                    <div>
                                        <span className="font-medium text-gray-900 dark:text-white">Bildirimleri Etkinleştir</span>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                            {notes.length} not mevcut
                                        </p>
                                    </div>
                                    <button
                                        onClick={toggleNotifications}
                                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${notifSettings.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                                            }`}
                                    >
                                        <span
                                            className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow ${notifSettings.enabled ? 'translate-x-6' : 'translate-x-1'
                                                }`}
                                        />
                                    </button>
                                </div>

                                {/* Frequency Selection - New Shared Component */}
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-3">
                                        Bildirim Sıklığı
                                    </label>
                                    <NotificationFrequencySelector
                                        value={notifSettings.frequency}
                                        onChange={(freq) => updateFrequency(freq)}
                                    />
                                </div>

                                {/* Mode Selection */}
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                                        Seçim Modu
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => updateMode('sequential')}
                                            className={`p-3 rounded-xl border-2 transition ${notifSettings.mode === 'sequential'
                                                ? 'border-accent bg-accent text-white'
                                                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-accent'
                                                }`}
                                        >
                                            <span className="text-lg block mb-1">📋</span>
                                            <span className="text-sm font-medium">Sıralı</span>
                                        </button>
                                        <button
                                            onClick={() => updateMode('random')}
                                            className={`p-3 rounded-xl border-2 transition ${notifSettings.mode === 'random'
                                                ? 'border-accent bg-accent text-white'
                                                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-accent'
                                                }`}
                                        >
                                            <span className="text-lg block mb-1">🎲</span>
                                            <span className="text-sm font-medium">Rastgele</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Info */}
                                <div className="text-xs text-gray-500 dark:text-gray-400 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                                    💡 Notlar belirlediğiniz sıklıkta bildirim olarak gönderilir
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Confirmation Modal */}
                {deleteConfirmId !== null && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full shadow-2xl">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                                Notu Sil
                            </h3>
                            <p className="text-gray-600 dark:text-gray-300 mb-6">
                                Bu notu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                                >
                                    İptal
                                </button>
                                <button
                                    onClick={() => handleDeleteNote(deleteConfirmId)}
                                    className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                                >
                                    Sil
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Note Editor Modal */}
                {showEditor && (
                    <NoteEditor
                        note={editingNote}
                        onSave={handleSave}
                        onCancel={() => setShowEditor(false)}
                    />
                )}
            </div>
        </div>
    )
}
