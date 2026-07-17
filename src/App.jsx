import { useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import Landing from './components/Landing.jsx'
import FloorExplorer from './components/FloorExplorer.jsx'
import BotFab from './components/BotFab.jsx'
import BotSheet from './components/BotSheet.jsx'
import { FLOORS } from './data/stores.js'

export default function App() {
  const [scene, setScene] = useState('landing') // 'landing' | 'explore'
  const [botOpen, setBotOpen] = useState(false)
  const [selected, setSelected] = useState(null) // store object
  const [lastVisited, setLastVisited] = useState(null) // node id of last routed destination

  const handleStoreTap = (store) => {
    setSelected(store)
    setBotOpen(true)
  }

  const closeBot = () => {
    setBotOpen(false)
    setSelected(null)
  }

  return (
    <div className="relative mx-auto h-dvh max-w-[430px] overflow-hidden">
      <LayoutGroup>
        {scene === 'landing' && <Landing onEnter={() => setScene('explore')} />}
        {scene === 'explore' && (
          <>
            <FloorExplorer onStoreTap={handleStoreTap} />
            <AnimatePresence>
              {botOpen ? (
                <motion.div key="bot-overlay" className="absolute inset-0 z-40">
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
                    onRouted={setLastVisited}
                    onClose={closeBot}
                  />
                </motion.div>
              ) : (
                <BotFab key="bot-fab" onOpen={() => setBotOpen(true)} />
              )}
            </AnimatePresence>
          </>
        )}
      </LayoutGroup>
    </div>
  )
}
