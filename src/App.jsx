import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { useLocalization } from './services/localization/useLocalization.js'
import Landing from './components/Landing.jsx'
import FloorExplorer from './components/FloorExplorer.jsx'
import AppBar from './components/AppBar.jsx'
import BotFab from './components/BotFab.jsx'
import BotSheet from './components/BotSheet.jsx'
import RouteMap from './components/RouteMap.jsx'
import LocationFinder from './components/LocationFinder.jsx'
import DestinationFinder from './components/DestinationFinder.jsx'
import { trackEvent } from './lib/analytics.js'

export default function App() {
  const [scene, setScene] = useState('landing') // 'landing' | 'explore'
  const [botOpen, setBotOpen] = useState(false)
  const [selected, setSelected] = useState(null) // store object
  const [lastVisited, setLastVisited] = useState(null) // node id of last routed destination
  const [activeRoute, setActiveRoute] = useState(null)
  /** Floor currently shown in the explorer, so the bar can label it. */
  const [exploreFloor, setExploreFloor] = useState(null)
  /**
   * True once the intro has played. Going back from the mall returns to the
   * chat you left — replaying a three-second brand animation every time
   * someone taps back is the opposite of getting them where they were.
   */
  const [splashSeen, setSplashSeen] = useState(false)
  /**
   * Bumped to remount the chat fresh.
   *
   * Finishing a route should leave the shopper at the six options ready for
   * the next errand — not in the conversation that produced the last one,
   * offering both "back to main menu" and the menu itself.
   */
  const [chatKey, setChatKey] = useState(0)

  const handleStoreTap = (store) => {
    trackEvent('store_viewed', { store: store.name })
    setSelected(store)
    setBotOpen(true)
  }

  const openBot = useCallback(() => setBotOpen(true), [])

  const closeBot = useCallback(() => {
    setBotOpen(false)
    setSelected(null)
  }, [])

  /**
   * Return to the start. Closes whatever is layered on top first, so the
   * shopper always lands somewhere coherent rather than on the landing screen
   * with an orphaned sheet still open above it.
   */
  const goHome = useCallback(() => {
    trackEvent('nav_home')
    setBotOpen(false)
    setSelected(null)
    setActiveRoute(null)
    setSplashSeen(true)
    setScene('landing')
  }, [])

  const handleRouteReady = (route) => setLastVisited(route.dest.id)

  // ---- live positioning -------------------------------------------------
  // Owned at the app level so a fix survives the chat opening and closing, and
  // so the map and chat always read the same position.
  const localization = useLocalization()
  /** Mid-route re-fix. Rendered above the map so navigation is never torn down. */
  const [reAnchoring, setReAnchoring] = useState(false)
  /** Full searchable catalogue, opened from the explorer's "see all". */
  const [browsingAll, setBrowsingAll] = useState(false)

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

  /**
   * Finish a mid-route re-fix.
   *
   * Stable by construction. This component re-renders at 15 Hz while live
   * positioning runs, so an inline arrow here would hand LocationFinder a new
   * prop identity on every frame — which previously cascaded into restarting
   * speech recognition fifteen times a second.
   * @param {import('./services/localization/tracker.js').Anchor} anchor
   */
  const handleReAnchored = useCallback(
    (anchor) => {
      handleAnchor(anchor)
      setReAnchoring(false)
    },
    [handleAnchor]
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
            skipSplash={splashSeen}
          />
        )}
        {scene === 'explore' && (
          <div className="flex h-full flex-col">
            {/* Always present, so entering the mall is no longer a one-way door. */}
            <AppBar
              onBack={goHome}
              onHome={goHome}
              context={exploreFloor?.short ? `${exploreFloor.short} floor` : undefined}
            />
            <div className="relative min-h-0 flex-1">
              <FloorExplorer onStoreTap={handleStoreTap} onFloorChange={setExploreFloor} onSeeAll={() => setBrowsingAll(true)} />
            </div>
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
                    key={chatKey}
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
                <BotFab key="bot-fab" onOpen={openBot} />
              )}
            </AnimatePresence>
          </div>
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
              onClose={() => {
                setActiveRoute(null)
                setSelected(null)
                setChatKey((k) => k + 1)
                setBotOpen(true)
              }}
            />
          )}
        </AnimatePresence>

        {/* The explorer shows a curated 16 per floor; this is where the rest
            of the catalogue lives, searchable rather than scrollable. */}
        <AnimatePresence>
          {browsingAll && (
            <DestinationFinder
              key="browse-all"
              onPick={(store) => {
                setBrowsingAll(false)
                handleStoreTap(store)
              }}
              onCancel={() => setBrowsingAll(false)}
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
              onLocated={handleReAnchored}
              onCancel={() => setReAnchoring(false)}
            />
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}
