import type { InferSelectModel } from "drizzle-orm";
import type { games, teams } from "@/lib/db/schema";

export type BracketPick = {
  gameId: number;
  pickedTeamId: number;
};

export type GameWithTeams = InferSelectModel<typeof games> & {
  team1: InferSelectModel<typeof teams> | null;
  team2: InferSelectModel<typeof teams> | null;
};

export type LeaderboardEntry = {
  userId: number;
  name: string;
  totalPoints: number;
  roundBreakdown: [number, number, number, number, number, number];
  rank: number;
};

export type ESPNCompetitor = {
  id: string;
  team: {
    id: string;
    abbreviation: string;
    displayName: string;
    logo: string;
  };
  score: string;
  curatedRank?: { current: number };
  winner?: boolean;
  homeAway?: string;
};

export type PlayerGameStats = {
  name: string;
  position: string;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgMade: number;
  fgAttempted: number;
  threePtMade: number;
  threePtAttempted: number;
  ftMade: number;
  ftAttempted: number;
};

export type TeamGameStats = {
  fgPct: string;
  fgMadeAttempted: string;
  threePtPct: string;
  threePtMadeAttempted: string;
  ftPct: string;
  ftMadeAttempted: string;
  totalRebounds: number;
  offRebounds: number;
  defRebounds: number;
  assists: number;
  turnovers: number;
  steals: number;
  blocks: number;
  fouls: number;
};

export type GameLeader = {
  name: string;
  value: string;
  headshot: string | null;
};

export type GameBoxScoreTeam = {
  teamName: string;
  abbreviation: string;
  logoUrl: string | null;
  stats: TeamGameStats;
  players: PlayerGameStats[];
  leaders: {
    points: GameLeader | null;
    rebounds: GameLeader | null;
    assists: GameLeader | null;
  };
};

export type GameBoxScore = {
  team1: GameBoxScoreTeam;
  team2: GameBoxScoreTeam;
};

export type ESPNEvent = {
  id: string;
  date: string;
  name: string;
  status: {
    type: {
      id: string;
      name: string;
      state: string;
      completed: boolean;
    };
  };
  competitions: Array<{
    id: string;
    venue?: { fullName: string };
    competitors: ESPNCompetitor[];
    notes: Array<{ headline: string }>;
    broadcasts?: Array<{ names: string[] }>;
    status: {
      type: {
        id: string;
        name: string;
        state: string;
        completed: boolean;
      };
    };
  }>;
};
