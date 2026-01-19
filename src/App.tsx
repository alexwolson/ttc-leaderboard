import { useState, useEffect } from 'react'
import './App.css'
import LeaderboardPosition from './components/LeaderboardPosition'

interface LeaderboardData {
  routeNumber: string;
  speed: number;
}

function App() {
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData[]>([]);
  const route_map: { [key: string]: string } = {
    "501": "Queen",
    "503": "Kingston",
    "504": "King",
    "505": "Dundas",
    "506": "Carlton",
    "507": "Long Branch",
    "508": "Lake Shore",
    "509": "Harbourfront",
    "510": "Spadina",
    "511": "Bathurst",
    "512": "St. Clair"
  };

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch('/api/ttc');
      const data = await response.json();

      if (response.status !== 200)
        throw new Error(`Failed to fetch: ${response.status}`);

      setLeaderboardData(data.map((route: [string, number]) => ({
        routeNumber: route[0],
        speed: route[1]
      })));

    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  return (
    <>
      <div className="wrapper">
        <div className="title">
          TTC STREETCARS LIVE LEADERBOARD
        </div>
        <div className="image-container">
          <img id="streetcar-image" src="https://farm7.static.flickr.com/6184/6125705401_815fe729e4_o.jpg" alt="streetcar pulled by horse" />
        </div>
        <div className="information">
          Recently the TTC has been under a lot of criticism for <a href="https://www.blogto.com/city/2024/08/toronto-ttc-streetcars-slowest-world/" target="_blank">slow service</a>.
          <br></br>
          This site intends to show how slow it really is.
        </div>
        <div className="leaderboard">
          {leaderboardData.map((position, index) => (
            <LeaderboardPosition key={index} routeNumber={position.routeNumber} routeName={route_map[position.routeNumber]} speed={position.speed} />
          ))}
        </div>
        <div className="footer">
          <br></br>
          <i>By <a href="https://lukajvnic.com" target="_blank">Luka Jovanovic</a></i>
        </div>
      </div>

    </>
  )
}

export default App
