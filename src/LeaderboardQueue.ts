export interface LeaderboardData {
    routeNumber: string;
    routeTitle: string | null;
    liveSpeedKmh: number;
    avg24hSpeedKmh: number | null;
    vehicleCount: number;
    updatedAt: string; // ISO string
    transitType: 'bus' | 'streetcar' | 'subway';
}

export class LeaderboardQueue {
    private items: LeaderboardData[] = [];

    // Add to the back of the queue
    append(item: LeaderboardData): void {
        this.items.push(item);
    }

    // Add multiple items - update if exists, append if not
    upsertAll(items: LeaderboardData[]): void {
        for (const item of items) {
            const existingIndex = this.items.findIndex(
                existing => existing.routeNumber === item.routeNumber
            );

            if (existingIndex !== -1) {
                // Replace the existing item so all fields stay in sync
                // (live speed, 24h average, titles, counts, timestamps, etc.).
                this.items[existingIndex] = item;
            } else {
                // Append new item
                this.items.push(item);
            }
        }
    }

    // Remove and return from the front
    popFront(): LeaderboardData | undefined {
        return this.items.shift();
    }

    // Peek at the front without removing
    peekFront(): LeaderboardData | undefined {
        return this.items[0];
    }

    // Check if queue is empty
    isEmpty(): boolean {
        return this.items.length === 0;
    }

    // Get current size
    size(): number {
        return this.items.length;
    }

    // Clear the queue
    clear(): void {
        this.items = [];
    }
}
