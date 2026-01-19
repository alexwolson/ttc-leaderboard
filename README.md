# TTC Streetcar Leaderboard

Recently, Toronto opened Line 6, the first new rapid transit line in the city in over 20 years. The route was advertised with a ~30 minute end-to-end journey time, but on opening day, it took nearly an hour.

This issue with speed is not endemic to the LRT, and has been known about for years, especially with the city's streetcar network. 

This website is intended to be a social commentary on the state of the TTC's streetcar network, in an attempt to raise awareness and hopefully spur some action.

Many people blame the lack of TSP (transit signal priority), but there are many other factors that contribute to slow streetcars, including stop spacing, arbitrary speed limits, and mixed traffic.

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript |
| Animations | Framer Motion |
| Build Tool | Vite |
| Backend | Vercel Serverless Functions |
| Data Source | TTC NextBus XML Feed |
| Analytics | Vercel Analytics |

## 🚀 Getting Started

### Prerequisites
- Node.js 20.x or later
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/lukajvnic/ttc-leaderboard.git
cd ttc-leaderboard

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

## 📊 How It Works

1. **Data Fetching** — The serverless API (`/api/ttc`) fetches the TTC's live vehicle location feed
2. **Speed Calculation** — Calculates average speed for each route based on all active streetcars
   - **Speed source**: TTC/UmoIQ (NextBus) public XML feed `vehicleLocations`, vehicle attribute `speedKmHr`
   - **Units**: km/h
   - **Current meaning**: instantaneous per-vehicle speed as reported by the feed; route speed is the simple arithmetic mean across active vehicles on that route (including stopped vehicles at 0 km/h)
   - **Validation rules**: missing/empty/non-numeric/negative `speedKmHr` values are excluded from averages; 0 is treated as valid (stopped vehicle). Routes with no valid speed samples are omitted to prevent `NaN`/`Infinity`.
3. **Change Detection** — Only routes with updated speeds are added to the update queue
4. **Queue Processing** — Updates are processed one at a time; if a position change occurs, the UI waits 1 second for the animation, otherwise it moves to the next update immediately
5. **Ranking** — Routes are sorted by speed, fastest at the top

## 🗂️ Project Structure

```
ttcleaderboard/
├── api/
│   └── ttc.ts              # Vercel serverless function for TTC data
├── src/
│   ├── components/
│   │   └── LeaderboardPosition.tsx  # Individual route row component
│   ├── App.tsx             # Main application component
│   ├── LeaderboardQueue.ts # Queue data structure for updates
│   └── App.css             # Global styles
├── index.html
└── package.json
```

## 👤 Author

**Luka Jovanovic** — [lukajvnic.com](https://lukajvnic.com)