"use client";

import { useEffect, useState } from "react";
import type { BuzzItem } from "@/lib/social-buzz";

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  trending: { label: "Trending", color: "bg-blue-100 text-blue-700" },
  upset_reaction: { label: "Upset", color: "bg-red-100 text-red-700" },
  cinderella: { label: "Cinderella", color: "bg-purple-100 text-purple-700" },
  player_highlight: { label: "Player", color: "bg-green-100 text-green-700" },
};

const SENTIMENT_ICON: Record<string, string> = {
  positive: "\u{1F44D}",
  negative: "\u{1F44E}",
  excited: "\u{1F525}",
  neutral: "\u{1F4AC}",
};

function BuzzCard({ item }: { item: BuzzItem }) {
  const config = CATEGORY_CONFIG[item.category] || { label: item.category, color: "bg-gray-100 text-gray-700" };

  return (
    <div className="bg-white rounded-lg border border-[#BFD4E4]/50 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${config.color}`}>
          {config.label}
        </span>
        <span className="text-sm">{SENTIMENT_ICON[item.sentiment] || ""}</span>
        {item.teams.length > 0 && (
          <div className="flex -space-x-1 ml-auto">
            {item.teams.map((team, i) => (
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
      </div>
      <p className="text-sm font-semibold text-[#1B365D] mb-1">{item.headline}</p>
      <p className="text-xs text-[#5A7A99] leading-relaxed">{item.summary}</p>
    </div>
  );
}

export function SocialBuzz({
  gameId,
  teamId,
  singleColumn = false,
}: {
  gameId?: number;
  teamId?: number;
  singleColumn?: boolean;
}) {
  const [buzz, setBuzz] = useState<BuzzItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBuzz() {
      try {
        const params = new URLSearchParams();
        if (gameId) params.set("gameId", String(gameId));
        if (teamId) params.set("teamId", String(teamId));
        const res = await fetch(`/api/social-buzz?${params}`);
        if (res.ok) {
          const data = await res.json();
          setBuzz(data.buzz || []);
        }
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    }
    fetchBuzz();
  }, [gameId, teamId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-[#BFD4E4]/50 p-4 animate-pulse">
            <div className="h-4 bg-[#EFF5FA] rounded w-20 mb-3" />
            <div className="h-4 bg-[#EFF5FA] rounded w-3/4 mb-2" />
            <div className="h-3 bg-[#EFF5FA] rounded w-full" />
            <div className="h-3 bg-[#EFF5FA] rounded w-2/3 mt-1" />
          </div>
        ))}
      </div>
    );
  }

  if (buzz.length === 0) {
    return (
      <div className="text-center py-6 text-[#5A7A99]">
        <p className="text-sm">No buzz yet. Check back during games!</p>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 ${singleColumn ? "" : "md:grid-cols-2"} gap-3`}>
      {buzz.map((item, i) => (
        <BuzzCard key={i} item={item} />
      ))}
      <p className="col-span-full text-[10px] text-[#BFD4E4] text-center mt-2">
        AI-curated from tournament coverage
      </p>
    </div>
  );
}

export default SocialBuzz;
