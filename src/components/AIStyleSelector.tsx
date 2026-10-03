import { useRef, useEffect } from 'react'

interface AIStyleSelectorProps {
    value: string
    onChange: (value: string) => void
    disabled?: boolean
}

const AI_STYLE_OPTIONS = [
    {
        value: 'short_quote',
        label: 'Kısa Alıntı',
        emoji: '💡',
        description: 'İlham Verici'
    },
    {
        value: 'summary_quote',
        label: 'Özet ve Alıntı',
        emoji: '📚',
        description: 'Öğretici'
    },
    {
        value: 'trivia',
        label: 'Biliyor muydun?',
        emoji: '🤔',
        description: 'Merak Uyandırıcı'
    }
]

export default function AIStyleSelector({ value, onChange, disabled = false }: AIStyleSelectorProps) {
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
        <div
            ref={scrollRef}
            className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
            {AI_STYLE_OPTIONS.map((option) => {
                const isSelected = value === option.value
                return (
                    <button
                        key={option.value}
                        ref={isSelected ? selectedRef : null}
                        onClick={() => !disabled && onChange(option.value)}
                        disabled={disabled}
                        className={`
                            flex flex-col items-center gap-1 px-4 py-3 rounded-xl text-xs font-medium transition snap-start flex-shrink-0 min-w-[100px]
                            ${isSelected
                                ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg scale-105'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                            }
                            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                        `}
                    >
                        <span className="text-xl">{option.emoji}</span>
                        <span className="whitespace-nowrap font-semibold">{option.label}</span>
                        <span className={`text-[10px] ${isSelected ? 'text-purple-100' : 'text-gray-400'}`}>
                            {option.description}
                        </span>
                    </button>
                )
            })}
        </div>
    )
}
