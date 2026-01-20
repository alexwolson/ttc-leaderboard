import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './App.css'
import LeaderboardPosition from './components/LeaderboardPosition'
import { LeaderboardQueue, type LeaderboardData } from './LeaderboardQueue'
import { Analytics } from '@vercel/analytics/react'

type ApiLiveRouteSpeed = {
  routeTag: string;
  routeTitle: string | null;
  liveSpeedKmh: number;
  avg24hAvailable: boolean;
  avg24hSpeedKmh: number | null;
  vehicleCount: number;
  updatedAt: string;
};

type SortMetric = 'live' | 'avg24h';
type TransitType = 'all' | 'bus' | 'streetcar' | 'subway';

function getTransitType(routeNumber: string): 'bus' | 'streetcar' | 'subway' {
  // TTC route numbering conventions:
  // - Streetcars: 5xx routes (501, 504, 505, 506, 509, 510, 511, 512)
  // - Subway/RT: Lines 1-4 (represented as "1", "2", "3", "4")
  // - Buses: All other routes
  if (routeNumber.startsWith('5') && routeNumber.length === 3) {
    return 'streetcar';
  }
  if (routeNumber.length === 1 && ['1', '2', '3', '4'].includes(routeNumber)) {
    return 'subway';
  }
  return 'bus';
}

function getSortValue(item: LeaderboardData, metric: SortMetric): number {
  const raw = metric === 'avg24h' ? item.avg24hSpeedKmh : item.liveSpeedKmh;
  if (raw == null) return Number.NEGATIVE_INFINITY;
  if (!Number.isFinite(raw)) return Number.NEGATIVE_INFINITY;
  return raw;
}

function sortLeaderboard(data: LeaderboardData[], metric: SortMetric): LeaderboardData[] {
  return [...data].sort((a, b) => {
    const bValue = getSortValue(b, metric);
    const aValue = getSortValue(a, metric);
    if (bValue !== aValue) return bValue - aValue;
    return a.routeNumber.localeCompare(b.routeNumber, undefined, { numeric: true });
  });
}

function App() {
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData[]>([]);
  const [avg24hAvailable, setAvg24hAvailable] = useState<boolean | null>(null);
  const [sortMetric, setSortMetric] = useState<SortMetric>('live');
  const [transitFilter, setTransitFilter] = useState<TransitType>('all');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isEmptyApi, setIsEmptyApi] = useState(false);
  const leaderboardDataRef = useRef<LeaderboardData[]>([]);
  const leaderboardQueue = useRef(new LeaderboardQueue());
  const sortMetricRef = useRef<SortMetric>('live');

  useEffect(() => {
    sortMetricRef.current = sortMetric;
  }, [sortMetric]);

  useEffect(() => {
    // If the API indicates 24h averages are unavailable, prevent sorting by them.
    if (avg24hAvailable === false && sortMetric === 'avg24h') {
      setSortMetric('live');
    }
  }, [avg24hAvailable, sortMetric]);

  useEffect(() => {
    // Re-rank immediately when the selected metric changes.
    const sorted = sortLeaderboard(leaderboardDataRef.current, sortMetric);
    leaderboardDataRef.current = sorted;
    setLeaderboardData(sorted);
  }, [sortMetric]);

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch('/api/ttc');
      const data = await response.json();

      if (response.status !== 200)
        throw new Error(`Failed to fetch: ${response.status}`);

      const apiRoutes: ApiLiveRouteSpeed[] = Array.isArray(data) ? (data as ApiLiveRouteSpeed[]) : [];
      setHasLoaded(true);

      if (apiRoutes.length === 0) {
        setIsEmptyApi(true);
        setAvg24hAvailable(null);

        // If the API returns an empty list, clear existing/stale data so the UI
        // doesn't keep showing routes that are no longer present.
        leaderboardQueue.current.clear();
        leaderboardDataRef.current = [];
        setLeaderboardData([]);
        return;
      }

      setIsEmptyApi(false);

      if (typeof apiRoutes[0]?.avg24hAvailable === 'boolean') {
        // The API explicitly reports whether KV-backed 24h averages are available.
        // If unavailable, we should indicate that in the UI (while still showing live speeds).
        setAvg24hAvailable(Boolean(apiRoutes[0].avg24hAvailable));
      } else {
        setAvg24hAvailable(null);
      }

      const newData: LeaderboardData[] = apiRoutes.map((route) => ({
        routeNumber: route.routeTag,
        routeTitle: route.routeTitle && route.routeTitle.trim().length > 0 ? route.routeTitle : null,
        liveSpeedKmh: route.liveSpeedKmh,
        avg24hSpeedKmh: route.avg24hSpeedKmh,
        vehicleCount: route.vehicleCount,
        updatedAt: route.updatedAt,
      }));

      // Filter to find elements that are different from current leaderboard
      const changedData = newData.filter((newItem) => {
        const existingItem = leaderboardDataRef.current.find(
          (item) => item.routeNumber === newItem.routeNumber
        );
        // Include if:
        // - doesn't exist in current data OR
        // - live speed changed OR
        // - 24h average changed OR
        // - route title changed (rare, but we should reflect it)
        //
        // Note: we intentionally ignore `updatedAt` so we don't enqueue every route on every poll.
        return (
          !existingItem ||
          existingItem.liveSpeedKmh !== newItem.liveSpeedKmh ||
          existingItem.avg24hSpeedKmh !== newItem.avg24hSpeedKmh ||
          existingItem.routeTitle !== newItem.routeTitle
        );
      });

      // Add changed items to the queue
      leaderboardQueue.current.upsertAll(changedData);

    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  };

  useEffect(() => {
    fetchLeaderboard();

    const fetch_interval = setInterval(() => {
      fetchLeaderboard();
    }, 1000);

    let updateTimeoutId: ReturnType<typeof setTimeout>;

    const processNextItem = () => {
      const nextItem = leaderboardQueue.current.popFront();
      if (nextItem) {
        // Compute what the new sorted data will be using the ref
        const prevData = leaderboardDataRef.current;
        const existingIndex = prevData.findIndex(item => item.routeNumber === nextItem.routeNumber);
        let newData: LeaderboardData[];

        if (existingIndex !== -1) {
          newData = [...prevData];
          newData[existingIndex] = nextItem;
        } else {
          newData = [...prevData, nextItem];
        }

        const sortedData = sortLeaderboard(newData, sortMetricRef.current);

        // Check if order changed by comparing route order
        const orderChanged = sortedData.some((item, index) =>
          prevData[index]?.routeNumber !== item.routeNumber
        );

        // Update state and ref
        leaderboardDataRef.current = sortedData;
        setLeaderboardData(sortedData);

        // If order didn't change, immediately process next item
        // Otherwise wait 1 second for animation
        updateTimeoutId = setTimeout(processNextItem, orderChanged ? 1000 : 0);
      } else {
        // Queue empty, check again in 1 second
        updateTimeoutId = setTimeout(processNextItem, 200);
      }
    };

    processNextItem();

    return () => {
      clearInterval(fetch_interval);
      clearTimeout(updateTimeoutId);
    }
  }, []);

  return (
    <>
      <div className="wrapper">
        <div className="title">
          TTC ROUTE SPEED LEADERBOARD
        </div>
        <div className="image-container">
          <img id="streetcar-image" src="https://live.staticflickr.com/7791/17390893711_bf1b2131ad_h.jpg" alt="streetcar pulled by horse" />
        </div>
        <div className="information">
          Recently the TTC has been under a lot of criticism for <a href="https://www.blogto.com/city/2024/08/toronto-ttc-streetcars-slowest-world/" target="_blank">slow service</a>.
          <br></br>
          This site shows estimated speeds (km/h) for TTC routes using vehicle location data.
        </div>
        <div className="sort-toggle" role="group" aria-label="Leaderboard ranking metric">
          <span className="sort-toggle-label">Rank by:</span>
          <button
            type="button"
            className={sortMetric === 'live' ? 'active' : ''}
            aria-pressed={sortMetric === 'live'}
            onClick={() => setSortMetric('live')}
          >
            Live
          </button>
          <button
            type="button"
            className={sortMetric === 'avg24h' ? 'active' : ''}
            aria-pressed={sortMetric === 'avg24h'}
            disabled={avg24hAvailable === false}
            onClick={() => setSortMetric('avg24h')}
            title={avg24hAvailable === false ? '24h averages unavailable (configure Vercel KV)' : undefined}
          >
            24h avg
          </button>
        </div>
        <div className="sort-toggle" role="group" aria-label="Filter by transit type">
          <span className="sort-toggle-label">Filter:</span>
          <button
            type="button"
            className={transitFilter === 'all' ? 'active' : ''}
            aria-pressed={transitFilter === 'all'}
            onClick={() => setTransitFilter('all')}
          >
            All
          </button>
          <button
            type="button"
            className={transitFilter === 'bus' ? 'active' : ''}
            aria-pressed={transitFilter === 'bus'}
            onClick={() => setTransitFilter('bus')}
          >
            Bus
          </button>
          <button
            type="button"
            className={transitFilter === 'streetcar' ? 'active' : ''}
            aria-pressed={transitFilter === 'streetcar'}
            onClick={() => setTransitFilter('streetcar')}
          >
            Streetcar
          </button>
          <button
            type="button"
            className={transitFilter === 'subway' ? 'active' : ''}
            aria-pressed={transitFilter === 'subway'}
            onClick={() => setTransitFilter('subway')}
          >
            Subway
          </button>
        </div>
        <div className="leaderboard">
          <AnimatePresence>
            {!hasLoaded || (leaderboardData.length === 0 && !isEmptyApi) ? (
              <div className="loading">Loading...</div>
            ) : leaderboardData.filter((position) => 
                transitFilter === 'all' || getTransitType(position.routeNumber) === transitFilter
              ).length === 0 ? (
              <div className="loading">No {transitFilter === 'all' ? '' : transitFilter + ' '}routes with speed data right now.</div>
            ) : (
              leaderboardData
                .filter((position) => transitFilter === 'all' || getTransitType(position.routeNumber) === transitFilter)
                .map((position) => (
                <motion.div
                  key={position.routeNumber}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <LeaderboardPosition
                    routeNumber={position.routeNumber}
                    routeTitle={position.routeTitle?.trim().length ? position.routeTitle : position.routeNumber}
                    liveSpeedKmh={position.liveSpeedKmh}
                    avg24hSpeedKmh={position.avg24hSpeedKmh}
                    transitType={getTransitType(position.routeNumber)}
                  />
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
        <div className="info">
          Live = current average speed for vehicles reporting speed on each route.
          <br></br>
          24h avg = rolling average over the last 24 hours (when available).
          {avg24hAvailable === false ? (
            <>
              <br></br>
              24h averages unavailable (configure Vercel KV).
            </>
          ) : null}
        </div>
        <div className="footer">
          <i>By <a href="https://lukajvnic.com" target="_blank">Luka Jovanovic</a> (<a href="https://github.com/lukajvnic/ttc-leaderboard" target="_blank">github</a>)</i>
        </div>
      </div>

      <Analytics />
    </>
  )
}

export default App
