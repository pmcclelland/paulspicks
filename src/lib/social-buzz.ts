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
  const cacheKey = gameId
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
    // Global: get recent upsets and notable results
    const recentFinals = await db.select().from(schema.games);
    const allTeams = await db.select().from(schema.teams);
    const teamMap = new Map(allTeams.map((t) => [t.id, t]));

    const upsets = recentFinals
      .filter((g) => {
        if (g.status !== "final" || !g.winnerTeamId || !g.team1Id || !g.team2Id) return false;
        const winner = teamMap.get(g.winnerTeamId);
        const loser = teamMap.get(g.winnerTeamId === g.team1Id ? g.team2Id : g.team1Id);
        return winner && loser && winner.seed > loser.seed;
      })
      .slice(0, 5);

    if (upsets.length > 0) {
      const upsetDescriptions = upsets.map((g) => {
        const winner = teamMap.get(g.winnerTeamId!);
        const loserId = g.winnerTeamId === g.team1Id ? g.team2Id! : g.team1Id!;
        const loser = teamMap.get(loserId);
        return `${winner?.seed}-seed ${winner?.name} beat ${loser?.seed}-seed ${loser?.name} ${g.team1Score}-${g.team2Score}`;
      });
      contextStr += `. Notable results: ${upsetDescriptions.join("; ")}`;
    }
  }

  const prompt = `You are a sports commentator creating social media buzz summaries about the NCAA March Madness tournament. Based on the following context, generate 4-6 buzz items capturing what fans and media would be talking about.

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
