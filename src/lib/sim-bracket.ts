import { getNextGame, getSlotInNextGame, REGIONS } from "@/lib/bracket-utils";
import {
  getWinProbability,
  lookupAdjEM,
  type SimTeam,
  type SimGame,
} from "@/lib/simulation";

export type SimBracketPick = {
  gameId: number;
  pickedTeamId: number;
};

export type SimBracketResult = {
  picks: SimBracketPick[];
  confidences: Record<number, number>; // gameId -> confidence (0.5–1.0)
};

/**
 * Determine whether to pick the underdog over the favorite.
 * Uses seed-matchup-specific thresholds in R1 (tuned to historical upset rates)
 * and a KenPom-aware threshold in later rounds.
 */
function shouldPickUpset(
  favorite: SimTeam,
  underdog: SimTeam,
  prob: number, // P(favorite wins), always >= 0.5
  round: number,
  kenpomMap: Map<string, number>
): boolean {
  // R1: use seed-matchup-specific thresholds
  if (round === 1) {
    const matchup = `${Math.min(favorite.seed, underdog.seed)}-${Math.max(favorite.seed, underdog.seed)}`;

    // 8v9: pure toss-up, just trust the model
    if (matchup === "8-9") return prob < 0.5;

    // 5v12: historically ~36% upset rate
    if (matchup === "5-12") return prob < 0.57;

    // 6v11, 7v10: historically ~33% upset rate
    if (matchup === "6-11" || matchup === "7-10") return prob < 0.55;

    // 4v13: historically ~21% upset rate
    if (matchup === "4-13") return prob < 0.52;

    // All other R1 (1v16, 2v15, 3v14): only pick upset if model says underdog is actually better
    return prob < 0.5;
  }

  // R2+: pick underdog when it's genuinely close
  let threshold = 0.53;

  // Boost threshold for underdogs with strong KenPom (underseeded teams)
  const underdogEM = lookupAdjEM(underdog.name, kenpomMap);
  const favoriteEM = lookupAdjEM(favorite.name, kenpomMap);
  if (underdogEM !== null && favoriteEM !== null) {
    // If underdog's KenPom is actually close to or better than favorite's
    if (underdogEM > favoriteEM - 3) {
      threshold = 0.56; // more willing to pick the upset
    }
  }

  return prob < threshold;
}

/**
 * Generate a deterministic "sim bracket" that picks upsets in a principled way.
 * Instead of always picking the favorite, picks the underdog when the probability
 * is close enough to justify the upset based on historical rates and KenPom data.
 * Remains fully deterministic — same inputs always produce same outputs.
 */
export function generateSimBracket(
  games: SimGame[],
  teamsById: Map<number, SimTeam>,
  kenpomMap: Map<string, number>,
  injuryPenalties?: Map<number, number>
): SimBracketResult {
  const gameKey = (region: string, round: number, idx: number) =>
    `${region}|${round}|${idx}`;
  const gameMap = new Map<string, SimGame>();
  for (const g of games) {
    gameMap.set(gameKey(g.region, g.round, g.gameIndex), g);
  }

  // Track simulated teams in each game slot
  const simSlots = new Map<number, { team1Id: number | null; team2Id: number | null }>();
  for (const g of games) {
    simSlots.set(g.id, { team1Id: g.team1Id, team2Id: g.team2Id });
  }

  const picks: SimBracketPick[] = [];
  const confidences: Record<number, number> = {};

  for (let round = 1; round <= 6; round++) {
    const roundGames = games.filter((g) => g.round === round);

    for (const game of roundGames) {
      const slots = simSlots.get(game.id)!;
      const t1 = slots.team1Id ? teamsById.get(slots.team1Id) : null;
      const t2 = slots.team2Id ? teamsById.get(slots.team2Id) : null;

      let winnerId: number;
      let confidence: number;

      if (t1 && t2) {
        const prob = getWinProbability(t1, t2, round, kenpomMap, injuryPenalties);
        const favorite = prob >= 0.5 ? t1 : t2;
        const underdog = prob >= 0.5 ? t2 : t1;
        const favProb = Math.max(prob, 1 - prob);

        const pickUpset = shouldPickUpset(favorite, underdog, favProb, round, kenpomMap);
        winnerId = pickUpset ? underdog.id : favorite.id;
        confidence = favProb;
      } else if (t1) {
        winnerId = t1.id;
        confidence = 1.0;
      } else if (t2) {
        winnerId = t2.id;
        confidence = 1.0;
      } else {
        continue; // No teams — skip
      }

      picks.push({ gameId: game.id, pickedTeamId: winnerId });
      confidences[game.id] = confidence;

      // Advance winner to next game (same logic as simulateTournament)
      if (round >= 1 && round <= 3) {
        const next = getNextGame(round, game.gameIndex);
        if (next) {
          const slot = getSlotInNextGame(game.gameIndex);
          const nextGame = gameMap.get(gameKey(game.region, next.round, next.gameIndex));
          if (nextGame) {
            const nextSlots = simSlots.get(nextGame.id)!;
            if (slot === "team1") {
              nextSlots.team1Id = winnerId;
            } else {
              nextSlots.team2Id = winnerId;
            }
          }
        }
      } else if (round === 4) {
        const regionIndex = REGIONS.indexOf(game.region as typeof REGIONS[number]);
        if (regionIndex >= 0) {
          const f4GameIndex = Math.floor(regionIndex / 2);
          const slot = regionIndex % 2 === 0 ? "team1" : "team2";
          const nextGame = gameMap.get(gameKey("Final Four", 5, f4GameIndex));
          if (nextGame) {
            const nextSlots = simSlots.get(nextGame.id)!;
            if (slot === "team1") {
              nextSlots.team1Id = winnerId;
            } else {
              nextSlots.team2Id = winnerId;
            }
          }
        }
      } else if (round === 5) {
        const next = getNextGame(round, game.gameIndex);
        if (next) {
          const slot = getSlotInNextGame(game.gameIndex);
          const nextGame = gameMap.get(gameKey("Final Four", next.round, next.gameIndex));
          if (nextGame) {
            const nextSlots = simSlots.get(nextGame.id)!;
            if (slot === "team1") {
              nextSlots.team1Id = winnerId;
            } else {
              nextSlots.team2Id = winnerId;
            }
          }
        }
      }
    }
  }

  return { picks, confidences };
}
