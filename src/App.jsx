import { useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import Landing from './components/Landing.jsx'
import FloorExplorer from './components/FloorExplorer.jsx'
import BotFab from './components/BotFab.jsx'
import BotSheet from './components/BotSheet.jsx'
import RouteMap from './components/RouteMap.jsx'

export default function App() {
  const [scene, setScene] = useState('landing') // 'landing' | 'explore'
  const [botOpen, setBotOpen] = useState(false)
  const [selected, setSelected] = useState(null) // store object
  const [lastVisited, setLastVisited] = useState(null) // node id of last routed destination
  const [activeRoute, setActiveRoute] = useState(null)

  const handleStoreTap = (store) => {
    setSelected(store)
    setBotOpen(true)
  }

  const closeBot = () => {
    setBotOpen(false)
    setSelected(null)
  }

  const handleRouteReady = (route) => setLastVisited(route.dest.id)

  return (
    <div className="relative mx-auto h-dvh max-w-[430px] overflow-hidden">
      <LayoutGroup>
        {scene === 'landing' && (
          <Landing
            onEnter={() => setScene('explore')}
            onRouteReady={handleRouteReady}
            onOpenRoute={setActiveRoute}
          />
        )}
        {scene === 'explore' && (
          <>
            <FloorExplorer onStoreTap={handleStoreTap} />
            <AnimatePresence>
              {botOpen ? (
                <motion.div key="bot-overlay" className={`absolute inset-0 z-40 ${activeRoute ? 'invisible' : ''}`}>
                  <motion.div
                    className="absolute inset-0 bg-black/55"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={closeBot}
                  />
                  <BotSheet
                    mode="overlay"
                    store={selected}
                    lastVisited={lastVisited}
                    onRouteReady={handleRouteReady}
                    onOpenRoute={setActiveRoute}
                    onClose={closeBot}
                  />
                </motion.div>
              ) : (
                <BotFab key="bot-fab" onOpen={() => setBotOpen(true)} />
              )}
            </AnimatePresence>
          </>
        )}
        <AnimatePresence>
          {activeRoute && <RouteMap route={activeRoute} onClose={() => setActiveRoute(null)} />}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}
