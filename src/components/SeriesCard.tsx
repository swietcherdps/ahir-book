

interface SeriesCardProps {
    title: string
    count: number
    coverUrl?: string
    onClick: () => void
}

export default function SeriesCard({ title, count, coverUrl, onClick }: SeriesCardProps) {
    return (
        <div
            onClick={onClick}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden cursor-pointer hover:shadow-xl transition-all transform hover:-translate-y-1 border border-gray-200 dark:border-gray-700 group relative"
        >
            {/* Folder Tab Effect */}
            <div className="absolute top-0 left-0 w-24 h-6 bg-accent opacity-20 rounded-br-lg z-10" />

            <div className="aspect-[2/3] relative bg-gray-100 dark:bg-gray-700">
                {coverUrl ? (
                    <img
                        src={coverUrl}
                        alt={title}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-16 h-16 text-gray-300" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                    </div>
                )}

                {/* Overlay for folder look */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex flex-col justify-end p-4">
                    <div className="flex items-center gap-2 text-white mb-1">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                        <span className="font-medium text-sm">Seri / Klasör</span>
                    </div>
                    <h3 className="text-lg font-bold text-white leading-tight">{title}</h3>
                    <p className="text-xs text-gray-200 mt-1">{count} Kitap</p>
                </div>
            </div>
        </div>
    )
}
