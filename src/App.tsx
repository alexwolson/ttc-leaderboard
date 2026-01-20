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
  avg24hAvailable?: boolean;
  avg24hSpeedKmh?: number | null;
  vehicleCount: number;
  updatedAt: string;
};

function App() {
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData[]>([]);
  const [avg24hAvailable, setAvg24hAvailable] = useState<boolean | null>(null);
  const leaderboardDataRef = useRef<LeaderboardData[]>([]);
  const leaderboardQueue = useRef(new LeaderboardQueue());
  const routeTitlesByTagRef = useRef<Record<string, string | null>>({});
  // Used only to trigger a rerender when route titles change.
  const [, setRouteTitlesRevision] = useState(0);

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch('/api/ttc');
      const data = await response.json();

      if (response.status !== 200)
        throw new Error(`Failed to fetch: ${response.status}`);

      const apiRoutes = data as ApiLiveRouteSpeed[];
      if (Array.isArray(apiRoutes) && apiRoutes.length > 0 && typeof apiRoutes[0]?.avg24hAvailable === 'boolean') {
        // The API explicitly reports whether KV-backed 24h averages are available.
        // If unavailable, we should indicate that in the UI (while still showing live speeds).
        setAvg24hAvailable(Boolean(apiRoutes[0].avg24hAvailable));
      } else {
        setAvg24hAvailable(null);
      }

      let titlesChanged = false;
      for (const route of apiRoutes) {
        const prevTitle = routeTitlesByTagRef.current[route.routeTag];
        if (prevTitle !== route.routeTitle) {
          routeTitlesByTagRef.current[route.routeTag] = route.routeTitle;
          titlesChanged = true;
        }
      }
      if (titlesChanged) {
        setRouteTitlesRevision((x) => x + 1);
      }

      const newData: LeaderboardData[] = apiRoutes.map((route) => ({
        routeNumber: route.routeTag,
        speed: route.liveSpeedKmh
      }));

      // Filter to find elements that are different from current leaderboard
      const changedData = newData.filter((newItem) => {
        const existingItem = leaderboardDataRef.current.find(
          (item) => item.routeNumber === newItem.routeNumber
        );
        // Include if: doesn't exist in current data OR speed changed
        return !existingItem || existingItem.speed !== newItem.speed;
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

        const sortedData = [...newData].sort((a, b) => b.speed - a.speed);

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
          TTC STREETCARS LIVE LEADERBOARD
        </div>
        <div className="image-container">
          <img id="streetcar-image" src="https://live.staticflickr.com/7791/17390893711_bf1b2131ad_h.jpg" alt="streetcar pulled by horse" />
        </div>
        <div className="information">
          Recently the TTC has been under a lot of criticism for <a href="https://www.blogto.com/city/2024/08/toronto-ttc-streetcars-slowest-world/" target="_blank">slow service</a>.
          <br></br>
          This site intends to show how slow it really is.
        </div>
        <div className="leaderboard">
          <AnimatePresence>
            {leaderboardData.length == 0 ? (
              <div className="loading">Loading...</div>
            ) : (
              leaderboardData.map((position) => (
                <motion.div
                  key={position.routeNumber}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <LeaderboardPosition
                    routeNumber={position.routeNumber}
                    routeName={routeTitlesByTagRef.current[position.routeNumber] ?? position.routeNumber}
                    speed={position.speed}
                  />
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
        <div className="info">
          This leaderboard is live and shows the average speed<br></br>of all streetcars on a route with ~30 second delay.
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
