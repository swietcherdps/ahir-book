import { useRef, useEffect } from 'react'

interface FrequencyOption {
    value: number       // dakika cinsinden
    label: string
    emoji: string
}

// Seçenekler (her iki sistemde de aynı kullanılacak)
export const FREQUENCY_OPTIONS: FrequencyOption[] = [
    { value: 1, label: '1 Dakika (Test)', emoji: '🧪' },
    { value: 5, label: '5 Dakika', emoji: '⚡' },
    { value: 15, label: '15 Dakika', emoji: '🕐' },
    { value: 60, label: 'Saat Başı', emoji: '🕒' },
    { value: 240, label: '4 Saatte Bir', emoji: '📌' },
    { value: 480, label: 'Günde 3 Kez', emoji: '🌅' },
    { value: 720, label: 'Günde 2 Kez', emoji: '🌓' },
    { value: 1440, label: 'Günde 1 Kez', emoji: '📆' },
    { value: 10080, label: 'Haftada 1 Kez', emoji: '📅' },
]

// String tipli frekans seçenekleri (kitap bildirimleri için)
export const BOOK_FREQUENCY_OPTIONS = [
    { value: '1m', label: '1 Dakika (Test)', emoji: '🧪' },
    { value: '5m', label: '5 Dakika', emoji: '⚡' },
    { value: '15m', label: '15 Dakika', emoji: '🕐' },
    { value: '1h', label: 'Saat Başı', emoji: '🕒' },
    { value: '4h', label: '4 Saatte Bir', emoji: '📌' },
    { value: '8h', label: 'Günde 3 Kez', emoji: '🌅' },
    { value: '12h', label: 'Günde 2 Kez', emoji: '🌓' },
    { value: '24h', label: 'Günde 1 Kez', emoji: '📆' },
    { value: '1w', label: 'Haftada 1 Kez', emoji: '📅' },
]

interface Props {
    value: number
    onChange: (value: number) => void
    disabled?: boolean
}

export default function NotificationFrequencySelector({ value, onChange, disabled = false }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const selectedRef = useRef<HTMLButtonElement>(null)

    // Seçili öğeyi görünür alana kaydır
    useEffect(() => {
        if (selectedRef.current && scrollRef.current) {
            const container = scrollRef.current
            const selected = selectedRef.current
            const containerRect = container.getBoundingClientRect()
            const selectedRect = selected.getBoundingClientRect()

            // Eğer seçili öğe görünür alanın dışındaysa ortala
            if (selectedRect.left < containerRect.left || selectedRect.right > containerRect.right) {
                selected.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
            }
        }
    }, [value])

    return (
        <div className="space-y-2">
            <div
                ref={scrollRef}
                className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {FREQUENCY_OPTIONS.map((option) => {
                    const isSelected = value === option.value
                    return (
                        <button
                            key={option.value}
                            ref={isSelected ? selectedRef : null}
                            onClick={() => !disabled && onChange(option.value)}
                            disabled={disabled}
                            className={`
                flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-200 border-2
                ${isSelected
                                    ? 'bg-accent text-white border-accent shadow-md scale-105'
                                    : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-accent/50 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
                        >
                            <span className="text-lg">{option.emoji}</span>
                            <span className="whitespace-nowrap">{option.label}</span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

// Kitap bildirimleri için ayrı komponent (string value kullanan)
interface BookFrequencyProps {
    value: string
    onChange: (value: string) => void
    disabled?: boolean
}

export function BookNotificationFrequencySelector({ value, onChange, disabled = false }: BookFrequencyProps) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const selectedRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        if (selectedRef.current && scrollRef.current) {
            const container = scrollRef.current
            const selected = selectedRef.current
            const containerRect = container.getBoundingClientRect()
            const selectedRect = selected.getBoundingClientRect()

            if (selectedRect.left < containerRect.left || selectedRect.right > containerRect.right) {
                selected.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
            }
        }
    }, [value])

    return (
        <div className="space-y-2">
            <div
                ref={scrollRef}
                className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {BOOK_FREQUENCY_OPTIONS.map((option) => {
                    const isSelected = value === option.value
                    return (
                        <button
                            key={option.value}
                            ref={isSelected ? selectedRef : null}
                            onClick={() => !disabled && onChange(option.value)}
                            disabled={disabled}
                            className={`
                flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-200 border-2
                ${isSelected
                                    ? 'bg-accent text-white border-accent shadow-md scale-105'
                                    : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-accent/50 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
                        >
                            <span className="text-lg">{option.emoji}</span>
                            <span className="whitespace-nowrap">{option.label}</span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
