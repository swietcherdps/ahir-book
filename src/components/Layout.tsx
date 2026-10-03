import { Outlet, useLocation } from 'react-router-dom'
import BottomNavigation from './BottomNavigation'

export default function Layout() {
    const location = useLocation()

    // Hide bottom navigation in reader view
    const isReader = location.pathname.startsWith('/reader/')

    return (
        <div className={`min-h-screen bg-background dark:bg-black ${!isReader ? 'safe-area-top' : ''}`}>
            <main className={!isReader ? 'pb-20' : ''}>
                <Outlet />
            </main>
            {!isReader && <BottomNavigation />}
        </div>
    )
}
