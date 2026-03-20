"use client";

import { useEffect, useState, useCallback } from "react";
import type { FeedEvent } from "@/lib/feed";

const TYPE_CONFIG: Record<string, { color: string; icon: string }> = {
  upset: { color: "border-l-red-500", icon: "\u{1F4A5}" },
  rank_change: { color: "border-l-[#F4793B]", icon: "\u{1F4CA}" },
  game_result: { color: "border-l-green-500", icon: "\u2705" },
  rare_pick: { color: "border-l-blue-500", icon: "\u{1F48E}" },
};

function relativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function EventCard({ event }: { event: FeedEvent }) {
  const config = TYPE_CONFIG[event.type] || { color: "border-l-gray-300", icon: "\u{1F4CC}" };

  return (
    <div className={`bg-white rounded-lg border border-[#BFD4E4]/50 border-l-4 ${config.color} p-4 transition-all hover:shadow-sm`}>
      <div className="flex items-start gap-3">
        <span className="text-lg flex-shrink-0 mt-0.5">{config.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {event.teams.length > 0 && (
              <div className="flex -space-x-1">
                {event.teams.slice(0, 2).map((team, i) => (
                  team.logoUrl ? (
                    <img key={i} src={team.logoUrl} alt="" className="w-5 h-5 object-contain rounded-full bg-white border border-[#EFF5FA]" />
                  ) : (
                    <div key={i} className="w-5 h-5 rounded-full bg-[#EFF5FA] flex items-center justify-center border border-white">
                      <span className="text-[8px] font-bold text-[#5A7A99]">{team.abbreviation.slice(0, 2)}</span>
                    </div>
                  )
                ))}
              </div>
            )}
            <span className="text-xs text-[#5A7A99]">{relativeTime(event.timestamp)}</span>
          </div>
          <p className="text-sm font-semibold text-[#1B365D] leading-snug">{event.title}</p>
          <p className="text-xs text-[#5A7A99] mt-1 leading-relaxed">{event.description}</p>
        </div>
      </div>
    </div>
  );
}

export function ActivityFeed({ compact = false }: { compact?: boolean }) {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/feed");
      if (res.ok) {
        const data = await res.json();
        setEvents(Array.isArray(data) ? data : []);
      }
    } catch {
      // Silently fail for feed
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 30000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#F4793B] border-t-transparent" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-[#5A7A99]">
        <p className="text-sm">No events yet. Check back once games start!</p>
      </div>
    );
  }

  if (compact) {
    return <TickerStrip events={events.slice(0, 5)} />;
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}

function TickerStrip({ events }: { events: FeedEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="bg-[#1B365D] rounded-xl px-4 py-3 mb-6 overflow-hidden">
      <div className="flex items-center gap-2 mb-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F4793B] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F4793B]" />
        </span>
        <span className="text-[10px] font-bold text-[#F4793B] uppercase tracking-wider">Live Feed</span>
      </div>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1">
        {events.map((event) => {
          const config = TYPE_CONFIG[event.type] || { icon: "\u{1F4CC}" };
          return (
            <div key={event.id} className="flex items-center gap-2 flex-shrink-0">
              <span className="text-sm">{config.icon}</span>
              <div className="flex items-center gap-1.5">
                {event.teams.slice(0, 2).map((team, i) => (
                  team.logoUrl ? (
                    <img key={i} src={team.logoUrl} alt="" className="w-4 h-4 object-contain" />
                  ) : null
                ))}
                <span className="text-xs text-white/90 font-medium whitespace-nowrap max-w-48 truncate">
                  {event.title}
                </span>
              </div>
              <span className="text-[10px] text-white/40">{relativeTime(event.timestamp)}</span>
              {events.indexOf(event) < events.length - 1 && (
                <span className="text-white/20 mx-1">&middot;</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ActivityFeed;
