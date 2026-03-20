"use client";

import { ActivityFeed } from "@/components/activity-feed";

export default function FeedPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#1B365D]">Activity Feed</h1>
          <p className="text-sm text-[#5A7A99] mt-1">
            Live updates from the pool
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          Auto-refreshes every 30s
        </span>
      </div>

      <ActivityFeed />
    </div>
  );
}
