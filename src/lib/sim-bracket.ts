import { getNextGame, getSlotInNextGame, REGIONS } from "@/lib/bracket-utils";
import {
  getWinProbability,
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
 * Generate a deterministic "sim bracket" by always picking the team
 * with the higher win probability from the simulation model.
 * Mirrors simulateTournament() from simulation.ts but uses
 * `prob >= 0.5 ? t1 : t2` instead of `Math.random() < prob`.
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
        winnerId = prob >= 0.5 ? t1.id : t2.id;
        confidence = Math.max(prob, 1 - prob);
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
