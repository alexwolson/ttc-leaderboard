import { useState, useEffect, useRef } from 'react'
import './LeaderboardPosition.css'

interface LeaderboardPosition {
    routeNumber: string;
    routeTitle: string;
    liveSpeedKmh: number;
    avg24hSpeedKmh: number | null;
    transitType: 'bus' | 'streetcar' | 'subway';
}

function formatSpeedKmh(value: number | null | undefined): string {
    if (value == null) return '—';
    if (!Number.isFinite(value)) return '—';
    return value.toFixed(1);
}

function LeaderboardPosition({ routeNumber, routeTitle, liveSpeedKmh, avg24hSpeedKmh, transitType }: LeaderboardPosition) {
    const containerRef = useRef<HTMLDivElement>(null);

    const [isMobile, setIsMobile] = useState(window.innerWidth < 500);
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 500);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    // Then use it:
    // Mobile: 36 dashes + 2 = 38 chars, Desktop: 50 dashes + 2 = 52 chars
    const borderWidth = isMobile ? 38 : 52;
    const border = isMobile
        ? '+------------------------------------+'
        : '+--------------------------------------------------+';

    // 50, 36

    const displayTitle = routeTitle.trim().length ? routeTitle : routeNumber;
    const liveText = formatSpeedKmh(liveSpeedKmh);
    const avg24hText = formatSpeedKmh(avg24hSpeedKmh);

    // Color coding by transit type
    const colorClass = transitType === 'streetcar' ? 'red' : 
                       transitType === 'subway' ? 'blue' : 
                       'green'; // bus

    return (
        <div className="leaderboard-position" ref={containerRef}>
            <div className="border">
                {border}
            </div>
            <div className="content" style={{ width: `${borderWidth}ch` }}>
                <div className="left-side">
                    |&nbsp;
                    <div className={`position-route-number ${colorClass}`}>{routeNumber}</div>
                    &nbsp;-&nbsp;
                    <div className="position-route-name">{displayTitle}</div>
                </div>
                <div className="right-side">
                    <div className="position-speed">
                        live {liveText} / 24h {avg24hText} km/h
                    </div>
                    &nbsp;|
                </div>
            </div>
            <div className="border">
                {border}
            </div>
        </div>
    );
}

export default LeaderboardPosition;
