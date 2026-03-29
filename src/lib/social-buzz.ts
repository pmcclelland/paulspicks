import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const client = new Anthropic();

export type BuzzCategory = "trending" | "upset_reaction" | "cinderella" | "player_highlight";
export type BuzzSentiment = "positive" | "negative" | "excited" | "neutral";

export type BuzzItem = {
  category: BuzzCategory;
  headline: string;
  summary: string;
  sentiment: BuzzSentiment;
  teams: Array<{
    name: string;
    abbreviation: string;
    seed: number;
    logoUrl: string | null;
  }>;
};

export type BuzzResult = {
  buzz: BuzzItem[];
  lastUpdated: string;
};

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function getSocialBuzz(
  gameId?: number,
  teamId?: number
): Promise<BuzzResult> {
  let cacheKey = gameId
    ? `social_buzz_game_${gameId}`
    : teamId
      ? `social_buzz_team_${teamId}`
      : "social_buzz_global";

  // Check cache
  try {
    const cached = await db
      .select()
      .from(schema.appState)
      .where(eq(schema.appState.key, cacheKey));

    if (cached.length > 0) {
      const parsed = JSON.parse(cached[0].value);
      if (
        parsed.lastUpdated &&
        parsed.buzz?.length > 0 &&
        Date.now() - new Date(parsed.lastUpdated).getTime() < CACHE_TTL_MS
      ) {
        return parsed;
      }
    }
  } catch {
    // No cache
  }

  // Build context
  let contextStr = "March Madness 2026 NCAA Tournament";
  const teamsInvolved: Array<{ name: string; abbreviation: string; seed: number; logoUrl: string | null }> = [];

  if (gameId) {
    const games = await db.select().from(schema.games).where(eq(schema.games.id, gameId));
    if (games.length > 0) {
      const game = games[0];
      const allTeams = await db.select().from(schema.teams);
      const teamMap = new Map(allTeams.map((t) => [t.id, t]));
      const t1 = game.team1Id ? teamMap.get(game.team1Id) : null;
      const t2 = game.team2Id ? teamMap.get(game.team2Id) : null;

      if (t1) teamsInvolved.push({ name: t1.name, abbreviation: t1.abbreviation, seed: t1.seed, logoUrl: t1.logoUrl });
      if (t2) teamsInvolved.push({ name: t2.name, abbreviation: t2.abbreviation, seed: t2.seed, logoUrl: t2.logoUrl });

      contextStr = `${t1?.name || "TBD"} (${t1?.seed}-seed) vs ${t2?.name || "TBD"} (${t2?.seed}-seed) in the NCAA March Madness 2026 Tournament`;
      if (game.status === "final") {
        contextStr += `. Final score: ${game.team1Score}-${game.team2Score}.`;
      }
    }
  } else if (teamId) {
    const teams = await db.select().from(schema.teams).where(eq(schema.teams.id, teamId));
    if (teams.length > 0) {
      const team = teams[0];
      teamsInvolved.push({ name: team.name, abbreviation: team.abbreviation, seed: team.seed, logoUrl: team.logoUrl });
      contextStr = `${team.name} (${team.seed}-seed) in the NCAA March Madness 2026 Tournament`;
    }
  } else {
    // Global: get round-aware tournament context
    const allGames = await db.select().from(schema.games);
    const allTeams = await db.select().from(schema.teams);
    const teamMap = new Map(allTeams.map((t) => [t.id, t]));

    // Determine current tournament state by round
    const roundNames: Record<number, string> = {
      0: "First Four",
      1: "Round of 64",
      2: "Round of 32",
      3: "Sweet 16",
      4: "Elite 8",
      5: "Final Four",
      6: "Championship",
    };

    // Find the highest round with at least one final game, and any active round
    let highestCompletedRound = 0;
    let activeRound = 0;
    const completedByRound = new Map<number, typeof allGames>();
    const inProgressByRound = new Map<number, typeof allGames>();

    for (const g of allGames) {
      if (g.round === 0) continue; // skip First Four for buzz
      if (g.status === "final") {
        if (!completedByRound.has(g.round)) completedByRound.set(g.round, []);
        completedByRound.get(g.round)!.push(g);
        if (g.round > highestCompletedRound) highestCompletedRound = g.round;
      } else if (g.status === "in_progress" || (g.status === "scheduled" && g.team1Id && g.team2Id)) {
        if (!inProgressByRound.has(g.round)) inProgressByRound.set(g.round, []);
        inProgressByRound.get(g.round)!.push(g);
        if (g.round > activeRound) activeRound = g.round;
      }
    }

    const currentRound = activeRound || highestCompletedRound;
    const currentRoundName = roundNames[currentRound] || `Round ${currentRound}`;

    // Use round-aware cache key so buzz refreshes when tournament advances
    cacheKey = `social_buzz_global_r${currentRound}`;

    // Re-check cache with round-aware key
    try {
      const cached = await db
        .select()
        .from(schema.appState)
        .where(eq(schema.appState.key, cacheKey));

      if (cached.length > 0) {
        const parsed = JSON.parse(cached[0].value);
        if (
          parsed.lastUpdated &&
          parsed.buzz?.length > 0 &&
          Date.now() - new Date(parsed.lastUpdated).getTime() < CACHE_TTL_MS
        ) {
          return parsed;
        }
      }
    } catch {
      // No cache
    }

    contextStr = `NCAA March Madness 2026 Tournament — currently in the ${currentRoundName}`;

    // Add results from the current round and just-completed round
    const roundsToInclude = [currentRound];
    if (currentRound > 1 && !completedByRound.has(currentRound)) {
      roundsToInclude.push(currentRound - 1);
    }

    const notableResults: string[] = [];
    for (const round of roundsToInclude) {
      const completed = completedByRound.get(round) ?? [];
      for (const g of completed) {
        if (!g.winnerTeamId || !g.team1Id || !g.team2Id) continue;
        const winner = teamMap.get(g.winnerTeamId);
        const loserId = g.winnerTeamId === g.team1Id ? g.team2Id : g.team1Id;
        const loser = teamMap.get(loserId);
        if (!winner || !loser) continue;
        const isUpset = winner.seed > loser.seed;
        const label = isUpset ? " (UPSET)" : "";
        notableResults.push(
          `${roundNames[round] || `R${round}`}: ${winner.seed}-seed ${winner.name} beat ${loser.seed}-seed ${loser.name} ${g.team1Score}-${g.team2Score}${label}`
        );
      }
    }

    // Limit to most interesting results (upsets first, then recent)
    notableResults.sort((a, b) => {
      const aUpset = a.includes("(UPSET)") ? 0 : 1;
      const bUpset = b.includes("(UPSET)") ? 0 : 1;
      return aUpset - bUpset;
    });

    if (notableResults.length > 0) {
      contextStr += `. Results from this round: ${notableResults.slice(0, 8).join("; ")}`;
    }

    // Add in-progress games context
    const liveGames = inProgressByRound.get(currentRound) ?? [];
    if (liveGames.length > 0) {
      const liveDescriptions = liveGames
        .filter((g) => g.status === "in_progress")
        .map((g) => {
          const t1 = g.team1Id ? teamMap.get(g.team1Id) : null;
          const t2 = g.team2Id ? teamMap.get(g.team2Id) : null;
          return `${t1?.seed}-seed ${t1?.name || "TBD"} vs ${t2?.seed}-seed ${t2?.name || "TBD"} (${g.team1Score}-${g.team2Score})`;
        });
      if (liveDescriptions.length > 0) {
        contextStr += `. Currently playing: ${liveDescriptions.join("; ")}`;
      }
    }

    // Note remaining teams for later rounds
    if (currentRound >= 3) {
      const remainingTeamIds = new Set<number>();
      const eliminatedTeamIds = new Set<number>();
      for (const g of allGames) {
        if (g.status === "final" && g.winnerTeamId && g.team1Id && g.team2Id) {
          const loserId = g.winnerTeamId === g.team1Id ? g.team2Id : g.team1Id;
          eliminatedTeamIds.add(loserId);
        }
      }
      for (const t of allTeams) {
        if (!eliminatedTeamIds.has(t.id)) remainingTeamIds.add(t.id);
      }
      const remaining = [...remainingTeamIds]
        .map((id) => teamMap.get(id))
        .filter(Boolean)
        .map((t) => `${t!.seed}-seed ${t!.name}`);
      if (remaining.length > 0 && remaining.length <= 16) {
        contextStr += `. Teams still alive: ${remaining.join(", ")}`;
      }
    }
  }

  const prompt = `You are a sports commentator creating social media buzz summaries about the NCAA March Madness tournament. Based on the following context, generate 4-6 buzz items capturing what fans and media would be talking about RIGHT NOW in this stage of the tournament. Focus on the current round and its storylines.

Context: ${contextStr}

Generate a JSON array of buzz items. Each item should have:
- "category": one of "trending", "upset_reaction", "cinderella", "player_highlight"
- "headline": a short, punchy headline (max 60 chars)
- "summary": 2-3 sentences of commentary in an engaging, social-media-aware tone
- "sentiment": one of "positive", "negative", "excited", "neutral"

Respond with ONLY the JSON array, no other text.`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    const text = block.type === "text" ? block.text : "[]";

    // Parse the JSON response — handle markdown-wrapped JSON
    let jsonStr = text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    }

    const parsed = JSON.parse(jsonStr);
    const buzzItems: BuzzItem[] = (Array.isArray(parsed) ? parsed : []).map((item: BuzzItem) => ({
      ...item,
      teams: teamsInvolved,
    }));

    const result: BuzzResult = {
      buzz: buzzItems,
      lastUpdated: new Date().toISOString(),
    };

    // Only cache non-empty results
    if (buzzItems.length > 0) {
      await db
        .insert(schema.appState)
        .values({ key: cacheKey, value: JSON.stringify(result) })
        .onConflictDoUpdate({
          target: schema.appState.key,
          set: { value: JSON.stringify(result) },
        });
    }

    return result;
  } catch (error) {
    console.error("Social buzz generation error:", error);
    return { buzz: [], lastUpdated: new Date().toISOString() };
  }
}
