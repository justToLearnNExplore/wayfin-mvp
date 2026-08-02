import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { useLocalization } from './services/localization/useLocalization.js'
import Landing from './components/Landing.jsx'
import FloorExplorer from './components/FloorExplorer.jsx'
import BotFab from './components/BotFab.jsx'
import BotSheet from './components/BotSheet.jsx'
import RouteMap from './components/RouteMap.jsx'
import LocationFinder from './components/LocationFinder.jsx'
import { trackEvent } from './lib/analytics.js'

export default function App() {
  const [scene, setScene] = useState('landing') // 'landing' | 'explore'
  const [botOpen, setBotOpen] = useState(false)
  const [selected, setSelected] = useState(null) // store object
  const [lastVisited, setLastVisited] = useState(null) // node id of last routed destination
  const [activeRoute, setActiveRoute] = useState(null)

  const handleStoreTap = (store) => {
    trackEvent('store_viewed', { store: store.name })
    setSelected(store)
    setBotOpen(true)
  }

  const closeBot = () => {
    setBotOpen(false)
    setSelected(null)
  }

  const handleRouteReady = (route) => setLastVisited(route.dest.id)

  // ---- live positioning -------------------------------------------------
  // Owned at the app level so a fix survives the chat opening and closing, and
  // so the map and chat always read the same position.
  const localization = useLocalization()
  /** Mid-route re-fix. Rendered above the map so navigation is never torn down. */
  const [reAnchoring, setReAnchoring] = useState(false)

  /**
   * Accept a confirmed fix from LocationFinder and (re)start dead reckoning.
   * Re-anchoring mid-route only moves the estimate — navigation continues.
   * @param {import('./services/localization/tracker.js').Anchor & {nodeId?: string}} anchor
   */
  const handleAnchor = useCallback(
    (anchor) => {
      localization.anchor(anchor)
      // Sensors need a user gesture on iOS; this call originates from the tap
      // that confirmed the location, so it is a legitimate moment to ask.
      if (!localization.isTracking) localization.startTracking()
    },
    [localization]
  )

  // Constrain the estimate to the active route so lateral drift is absorbed.
  useEffect(() => {
    if (!activeRoute?.path) return localization.setRoutePath(null)
    const floor = localization.state.floor
    const sameFloor = activeRoute.path.filter((n) => n.floor === floor)
    localization.setRoutePath(sameFloor.length > 1 ? sameFloor : null)
  }, [activeRoute, localization.state.floor, localization])

  return (
    <div className="relative mx-auto h-dvh max-w-[430px] overflow-hidden">
      <LayoutGroup>
        {scene === 'landing' && (
          <Landing
            onEnter={() => {
              trackEvent('mall_entered')
              setScene('explore')
            }}
            onRouteReady={handleRouteReady}
            onOpenRoute={setActiveRoute}
            onAnchor={handleAnchor}
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
                    onAnchor={handleAnchor}
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
          {activeRoute && (
            <RouteMap
              route={activeRoute}
              live={localization.state}
              isTracking={localization.isTracking}
              onStartTracking={localization.startTracking}
              heading={localization.heading}
              onAnchor={handleAnchor}
              getMotion={localization.getMotion}
              onReAnchor={() => setReAnchoring(true)}
              onClose={() => setActiveRoute(null)}
            />
          )}
        </AnimatePresence>

        {/* Drift correction. Layered above the live map on purpose: the route,
            the active step and the walked distance all survive, so confirming
            a landmark only slides the dot — it never restarts navigation. */}
        <AnimatePresence>
          {reAnchoring && (
            <LocationFinder
              key="re-anchor"
              destinationName={activeRoute?.dest?.name}
              onLocated={(anchor) => {
                handleAnchor(anchor)
                setReAnchoring(false)
              }}
              onCancel={() => setReAnchoring(false)}
            />
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}
