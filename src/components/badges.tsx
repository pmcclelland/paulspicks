"use client";

type Badge = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  userId: number | null;
  userName: string | null;
  stat: string;
};

const BADGE_COLORS: Record<string, string> = {
  "chaos-agent": "from-purple-500/10 to-purple-600/5 border-purple-200",
  "chalk-walk": "from-blue-500/10 to-blue-600/5 border-blue-200",
  "clown-car": "from-yellow-500/10 to-yellow-600/5 border-yellow-200",
  "cinderella-finder": "from-pink-500/10 to-pink-600/5 border-pink-200",
  "oracle": "from-indigo-500/10 to-indigo-600/5 border-indigo-200",
  "bold-and-wrong": "from-red-500/10 to-red-600/5 border-red-200",
  "perfect-round": "from-amber-500/10 to-amber-600/5 border-amber-200",
  "heartbreaker": "from-rose-500/10 to-rose-600/5 border-rose-200",
  "lone-wolf": "from-slate-500/10 to-slate-600/5 border-slate-200",
  "homer": "from-green-500/10 to-green-600/5 border-green-200",
};

export default function Badges({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-[#1B365D]">Awards</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {badges.map((badge) => {
          const claimed = badge.userId !== null;
          const colors = BADGE_COLORS[badge.id] || "from-gray-500/10 to-gray-600/5 border-gray-200";

          return (
            <div
              key={badge.id}
              className={`rounded-xl border p-4 text-center bg-gradient-to-b transition-all ${
                claimed ? colors : "from-gray-100/50 to-gray-200/30 border-gray-200 opacity-50"
              }`}
            >
              <div className="text-3xl mb-2">{badge.emoji}</div>
              <div className="text-sm font-bold text-[#1B365D] leading-tight">
                {badge.name}
              </div>
              <div className="text-xs text-[#5A7A99] mt-1 leading-tight">
                {badge.description}
              </div>
              <div className="mt-2 pt-2 border-t border-current/10">
                {claimed ? (
                  <>
                    <div className="text-xs font-bold text-[#F4793B] truncate">
                      {badge.userName}
                    </div>
                    <div className="text-[10px] text-[#5A7A99] mt-0.5">
                      {badge.stat}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-gray-400 italic">Unclaimed</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Compact badge icons for inline display next to user names in leaderboard
export function BadgeIcons({ badges, userId }: { badges: Badge[]; userId: number }) {
  const userBadges = badges.filter((b) => b.userId === userId);
  if (userBadges.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-0.5 ml-1.5">
      {userBadges.map((b) => (
        <span
          key={b.id}
          className="text-xs cursor-default"
          title={`${b.name}: ${b.stat}`}
        >
          {b.emoji}
        </span>
      ))}
    </span>
  );
}
