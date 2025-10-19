export default function Home() {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <button className="p-2 hover:bg-gray-200 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-primary">Ahir Book</h1>
        </header>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Virgülle ayrılmış kelimeler ile ara..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button className="w-full bg-accent text-white py-3 rounded-lg hover:bg-blue-600 transition">
            Arama
          </button>
        </div>

        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold text-primary">Arama Sonuçları</h2>
          <p className="text-gray-500">Arama yapmak için yukarıdaki kutuyu kullanın</p>
        </div>
      </div>
    </div>
  )
}
