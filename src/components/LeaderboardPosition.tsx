import './LeaderboardPosition.css'

interface LeaderboardPosition {
    routeNumber: string;
    routeName: string;
    speed: number;
}


function LeaderboardPosition({ routeNumber, routeName, speed }: LeaderboardPosition) {
    return (
        <div className="leaderboard-position">
            <div className="border">
                +--------------------------------------------------+
            </div>
            <div className="content">
                <div className="left-side">
                    |&nbsp;
                    <div className={`position-route-number ${routeNumber.startsWith('3') ? 'blue' : ''}`}>{routeNumber}</div>
                    &nbsp;-&nbsp;
                    <div className="position-route-name">{routeName}</div>
                </div>
                <div className="right-side">
                    <div className="position-speed">{speed.toFixed(1)} km/h</div>
                    &nbsp;|
                </div>
            </div>
            <div className="border">
                +--------------------------------------------------+
            </div>
        </div>
    );
}

export default LeaderboardPosition;
