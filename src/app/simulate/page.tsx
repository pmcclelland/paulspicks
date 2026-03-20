"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";

type TeamOdds = {
  teamId: number;
  name: string;
  abbreviation: string;
  seed: number;
  region: string;
  logoUrl: string | null;
  r32: number;
  s16: number;
  e8: number;
  f4: number;
  finals: number;
  champion: number;
};

type UserProjection = {
  userId: number;
  name: string;
  expectedPoints: number;
  medianPoints: number;
  winProbability: number;
  p10Points: number;
  p90Points: number;
  championPick?: {
    teamName: string;
    abbreviation: string;
    seed: number;
    logoUrl: string | null;
  } | null;
};

type InjuredTeam = {
  teamId: number;
  abbreviation: string;
  out: number;
  gtd: number;
  penalty: number;
};

type SimulationData = {
  teamOdds: TeamOdds[];
  userProjections: UserProjection[];
  liveTeamOdds: TeamOdds[];
  liveUserProjections: UserProjection[];
  simulationCount: number;
  completedGames: number;
  totalGames: number;
  injuredTeams: InjuredTeam[];
};

type SortKey = keyof TeamOdds;
type UserSortKey = keyof UserProjection;

function pct(value: number): string {
  if (value >= 0.995) return ">99%";
  if (value < 0.005) return "<1%";
  return `${(value * 100).toFixed(1)}%`;
}

function barWidth(value: number): number {
  return Math.min(Math.round(value * 100), 100);
}

function probStyle(value: number): string {
  if (value >= 0.5) return "font-bold text-[#1B365D]";
  if (value >= 0.2) return "font-semibold text-[#1B365D]";
  if (value >= 0.05) return "text-[#1B365D]";
  if (value >= 0.005) return "text-[#5A7A99]";
  return "text-[#BFD4E4]";
}

function SortIndicator({ active, desc }: { active: boolean; desc: boolean }) {
  if (!active) return null;
  return <span className="ml-0.5 text-[#F4793B]">{desc ? " \u2193" : " \u2191"}</span>;
}

/** Reusable team odds table */
function TeamOddsTable({
  teams,
  sortKey,
  sortDesc,
  onSort,
}: {
  teams: TeamOdds[];
  sortKey: SortKey;
  sortDesc: boolean;
  onSort: (key: SortKey) => void;
}) {
  const headers: { key: SortKey; label: string; hideOnMobile?: boolean }[] = [
    { key: "seed", label: "Seed" },
    { key: "name", label: "Team" },
    { key: "region", label: "Region", hideOnMobile: true },
    { key: "r32", label: "R32", hideOnMobile: true },
    { key: "s16", label: "S16", hideOnMobile: true },
    { key: "e8", label: "E8" },
    { key: "f4", label: "F4" },
    { key: "finals", label: "Finals" },
    { key: "champion", label: "Champ" },
  ];

  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((h) => (
                <TableHead
                  key={h.key}
                  className={`cursor-pointer select-none ${
                    h.hideOnMobile ? "hidden sm:table-cell" : ""
                  } ${h.key !== "name" && h.key !== "seed" && h.key !== "region" ? "text-center" : ""}`}
                  onClick={() => onSort(h.key)}
                >
                  {h.label}
                  <SortIndicator active={sortKey === h.key} desc={sortDesc} />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((team) => (
              <TableRow key={team.teamId}>
                <TableCell className="font-mono text-[#5A7A99] w-12">
                  {team.seed}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {team.logoUrl ? (
                      <img src={team.logoUrl} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-[#EFF5FA] flex items-center justify-center flex-shrink-0">
                        <span className="text-[8px] font-bold text-[#5A7A99]">{team.abbreviation.slice(0, 2)}</span>
                      </div>
                    )}
                    <span className="font-medium text-[#1B365D]">{team.abbreviation}</span>
                  </div>
                </TableCell>
                <TableCell className="text-[#5A7A99] hidden sm:table-cell">{team.region}</TableCell>
                {(["r32", "s16", "e8", "f4", "finals", "champion"] as const).map((key) => {
                  const isHiddenOnMobile = key === "r32" || key === "s16";
                  return (
                    <TableCell key={key} className={`text-center ${isHiddenOnMobile ? "hidden sm:table-cell" : ""}`}>
                      <div className="relative flex items-center justify-center">
                        <div
                          className="absolute inset-y-0 left-0 bg-[#F4793B]/[0.08] rounded-sm transition-all"
                          style={{ width: `${barWidth(team[key])}%` }}
                        />
                        <span className={`relative font-mono text-xs ${probStyle(team[key])}`}>
                          {pct(team[key])}
                        </span>
                      </div>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

/** Reusable user projections table */
function UserProjectionsTable({
  users,
  sortKey,
  sortDesc,
  onSort,
}: {
  users: UserProjection[];
  sortKey: UserSortKey;
  sortDesc: boolean;
  onSort: (key: UserSortKey) => void;
}) {
  const router = useRouter();

  const headers: { key: UserSortKey; label: string; hideOnMobile?: boolean }[] = [
    { key: "name", label: "Name" },
    { key: "expectedPoints", label: "Exp. Pts" },
    { key: "medianPoints", label: "Median", hideOnMobile: true },
    { key: "p90Points", label: "P90", hideOnMobile: true },
    { key: "winProbability", label: "Win %" },
  ];

  if (users.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-[#5A7A99]">No bracket picks found.</p>
          <p className="text-sm mt-2 text-[#BFD4E4]">
            Pool projections will appear once users submit their brackets.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Rank</TableHead>
              {headers.map((h) => (
                <TableHead
                  key={h.key}
                  className={`cursor-pointer select-none ${
                    h.hideOnMobile ? "hidden sm:table-cell" : ""
                  } ${h.key !== "name" ? "text-right" : ""}`}
                  onClick={() => onSort(h.key)}
                >
                  {h.label}
                  <SortIndicator active={sortKey === h.key} desc={sortDesc} />
                </TableHead>
              ))}
              <TableHead>Champion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user, i) => (
              <TableRow
                key={user.userId}
                className="group cursor-pointer transition-colors hover:bg-[#EFF5FA]"
                onClick={() => router.push(`/bracket/${user.userId}`)}
              >
                <TableCell className="font-mono text-[#5A7A99]">{i + 1}</TableCell>
                <TableCell>
                  <span className="font-medium text-[#1B365D] group-hover:text-[#F4793B] group-hover:underline transition-colors">
                    {user.name}
                  </span>
                </TableCell>
                <TableCell className="text-right font-bold text-[#1B365D]">
                  {user.expectedPoints}
                </TableCell>
                <TableCell className="text-right text-muted-foreground hidden sm:table-cell">
                  {user.medianPoints}
                </TableCell>
                <TableCell className="text-right text-muted-foreground hidden sm:table-cell">
                  {user.p90Points}
                </TableCell>
                <TableCell className="text-right">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
                      user.winProbability >= 0.15
                        ? "bg-[#F4793B]/10 text-[#F4793B]"
                        : user.winProbability >= 0.05
                          ? "bg-[#1B365D]/8 text-[#1B365D]"
                          : "bg-transparent text-[#5A7A99]"
                    }`}
                  >
                    {pct(user.winProbability)}
                  </span>
                </TableCell>
                <TableCell>
                  {user.championPick ? (
                    <div className="flex items-center gap-1.5">
                      {user.championPick.logoUrl && (
                        <img src={user.championPick.logoUrl} alt="" className="w-5 h-5 object-contain" />
                      )}
                      <span className="text-xs text-[#5A7A99]">{user.championPick.abbreviation}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-[#BFD4E4]">&mdash;</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function InjuryImpactSection({ injuries }: { injuries: InjuredTeam[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? injuries : injuries.slice(0, 5);

  return (
    <section>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-[#5A7A99] hover:text-[#1B365D] transition-colors mb-3"
      >
        <svg
          className={`w-4 h-4 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Injury Adjustments
        <span className="text-xs font-normal text-[#BFD4E4]">
          ({injuries.length} team{injuries.length !== 1 ? "s" : ""})
        </span>
      </button>
      {(expanded || injuries.length <= 5) && (
        <div className="flex flex-wrap gap-2">
          {shown.map((t) => (
            <span
              key={t.teamId}
              className="inline-flex items-center gap-1.5 rounded-full bg-white ring-1 ring-[#BFD4E4] px-2.5 py-1 text-xs"
            >
              <span className="font-semibold text-[#1B365D]">{t.abbreviation}</span>
              {t.out > 0 && (
                <span className="inline-flex items-center rounded-full bg-red-50 text-red-600 px-1.5 py-0 text-[10px] font-bold">
                  {t.out} OUT
                </span>
              )}
              {t.gtd > 0 && (
                <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-600 px-1.5 py-0 text-[10px] font-bold">
                  {t.gtd} GTD
                </span>
              )}
              <span className="text-[10px] text-[#5A7A99]">
                {t.penalty > 0 ? "+" : ""}{t.penalty.toFixed(1)} adjEM
              </span>
            </span>
          ))}
          {!expanded && injuries.length > 5 && (
            <button
              onClick={() => setExpanded(true)}
              className="text-xs text-[#F4793B] hover:underline self-center"
            >
              +{injuries.length - 5} more
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default function SimulatePage() {
  const [data, setData] = useState<SimulationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Sort state for each tab's team table
  const [cleanTeamSort, setCleanTeamSort] = useState<{ key: SortKey; desc: boolean }>({ key: "champion", desc: true });
  const [liveTeamSort, setLiveTeamSort] = useState<{ key: SortKey; desc: boolean }>({ key: "champion", desc: true });
  const [liveUserSort, setLiveUserSort] = useState<{ key: UserSortKey; desc: boolean }>({ key: "winProbability", desc: true });

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/simulate");
        if (!res.ok) {
          setError("Failed to load simulation data.");
          return;
        }
        setData(await res.json());
      } catch {
        setError("Failed to load simulation data.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  function toggleSort<K>(
    setter: React.Dispatch<React.SetStateAction<{ key: K; desc: boolean }>>,
    key: K,
    defaultDesc: boolean = true
  ) {
    setter((prev) => ({
      key,
      desc: prev.key === key ? !prev.desc : defaultDesc,
    }));
  }

  function sortList<T>(list: T[], key: keyof T, desc: boolean): T[] {
    return [...list].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (typeof av === "number" && typeof bv === "number") {
        return desc ? bv - av : av - bv;
      }
      return desc
        ? String(bv).localeCompare(String(av))
        : String(av).localeCompare(String(bv));
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#F4793B] border-t-transparent" />
          <p className="text-sm text-muted-foreground">Running simulations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              setError("");
              fetch("/api/simulate")
                .then((r) => r.json())
                .then((d) => setData(d))
                .catch(() => setError("Failed to load simulation data."))
                .finally(() => setLoading(false));
            }}
            className="text-sm text-[#F4793B] hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const hasActualResults = data.completedGames > 0;

  // Summary stats from live data (most relevant)
  const liveTopTeam = data.liveTeamOdds[0];
  const cleanTopTeam = data.teamOdds[0];
  const liveTopUser = data.liveUserProjections[0];
  const oneSeeds = data.liveTeamOdds.filter((t) => t.seed === 1);
  const oneSeedChampSum = oneSeeds.reduce((s, t) => s + t.champion, 0);

  const sortedCleanTeams = sortList(data.teamOdds, cleanTeamSort.key, cleanTeamSort.desc);
  const sortedLiveTeams = sortList(data.liveTeamOdds, liveTeamSort.key, liveTeamSort.desc);
  const sortedLiveUsers = sortList(data.liveUserProjections, liveUserSort.key, liveUserSort.desc);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1B365D]">Simulation</h1>
          <p className="text-sm text-[#5A7A99] mt-1">
            {data.simulationCount.toLocaleString()} &nbsp;Monte Carlo simulations &middot; KenPom + historical seed data + injuries
          </p>
        </div>
        {hasActualResults && (
          <div className="hidden sm:flex items-center gap-3">
            <span className="text-xs font-medium text-[#5A7A99] uppercase tracking-wider">
              Tournament
            </span>
            <div className="w-24 h-2 bg-[#D6E6F0] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#F4793B] rounded-full transition-all"
                style={{ width: `${Math.round((data.completedGames / data.totalGames) * 100)}%` }}
              />
            </div>
            <span className="text-xs font-bold text-[#1B365D]">
              {data.completedGames}/{data.totalGames}
            </span>
          </div>
        )}
      </div>

      {/* At a Glance */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={liveTopTeam ? "border-[#F4793B]/30" : ""}>
          <CardContent className="p-4">
            <p className="text-[10px] font-medium text-[#5A7A99] uppercase tracking-wider mb-1">
              {hasActualResults ? "Live Favorite" : "Sim Favorite"}
            </p>
            {liveTopTeam ? (
              <div className="flex items-center gap-2 mt-1">
                {liveTopTeam.logoUrl && (
                  <img src={liveTopTeam.logoUrl} alt="" className="w-7 h-7 object-contain" />
                )}
                <div>
                  <p className="text-lg font-bold text-[#F4793B]">{pct(liveTopTeam.champion)}</p>
                  <p className="text-xs text-[#5A7A99] -mt-0.5">{liveTopTeam.abbreviation}</p>
                </div>
              </div>
            ) : (
              <p className="text-2xl font-bold text-[#1B365D]">&mdash;</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-medium text-[#5A7A99] uppercase tracking-wider mb-1">1-Seeds Win</p>
            <p className="text-2xl font-bold text-[#1B365D]">{pct(oneSeedChampSum)}</p>
            <p className="text-xs text-[#5A7A99] -mt-0.5">combined</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-medium text-[#5A7A99] uppercase tracking-wider mb-1">Pool Favorite</p>
            {liveTopUser ? (
              <>
                <p className="text-2xl font-bold text-[#1B365D]">{pct(liveTopUser.winProbability)}</p>
                <p className="text-xs text-[#5A7A99] -mt-0.5">{liveTopUser.name}</p>
              </>
            ) : (
              <p className="text-2xl font-bold text-[#1B365D]">&mdash;</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-medium text-[#5A7A99] uppercase tracking-wider mb-1">Injury Impact</p>
            <p className="text-2xl font-bold text-[#1B365D]">
              {data.injuredTeams.length}
            </p>
            <p className="text-xs text-[#5A7A99] -mt-0.5">teams affected</p>
          </CardContent>
        </Card>
      </div>

      {/* Injury Impact Summary */}
      {data.injuredTeams.length > 0 && (
        <InjuryImpactSection injuries={data.injuredTeams} />
      )}

      {/* Tabs */}
      <Tabs defaultValue={hasActualResults ? "live" : "clean"}>
        <TabsList>
          {hasActualResults && <TabsTrigger value="live">Live Odds</TabsTrigger>}
          <TabsTrigger value="clean">Pre-Tournament</TabsTrigger>
          <TabsTrigger value="pool">Pool Projections</TabsTrigger>
        </TabsList>

        {/* Live Odds — accounts for actual results */}
        {hasActualResults && (
          <TabsContent value="live">
            <div className="mb-4">
              <p className="text-sm text-[#5A7A99]">
                Accounts for {data.completedGames} completed game{data.completedGames !== 1 ? "s" : ""}. Eliminated teams show 0%. Remaining games simulated.
              </p>
            </div>
            <TeamOddsTable
              teams={sortedLiveTeams}
              sortKey={liveTeamSort.key}
              sortDesc={liveTeamSort.desc}
              onSort={(key) => toggleSort(setLiveTeamSort, key, key !== "name" && key !== "region")}
            />
          </TabsContent>
        )}

        {/* Clean predictions — from scratch, no actual results */}
        <TabsContent value="clean">
          <div className="mb-4">
            <p className="text-sm text-[#5A7A99]">
              Pure pre-tournament predictions ignoring actual results. Simulates all 63 games from scratch as a control.
            </p>
          </div>
          <TeamOddsTable
            teams={sortedCleanTeams}
            sortKey={cleanTeamSort.key}
            sortDesc={cleanTeamSort.desc}
            onSort={(key) => toggleSort(setCleanTeamSort, key, key !== "name" && key !== "region")}
          />
        </TabsContent>

        {/* Pool Projections — uses live simulation */}
        <TabsContent value="pool">
          <div className="mb-4">
            <p className="text-sm text-[#5A7A99]">
              {hasActualResults
                ? `Each user's bracket scored against ${data.simulationCount.toLocaleString()} simulations of the remaining ${data.totalGames - data.completedGames} games.`
                : `Each user's bracket scored against ${data.simulationCount.toLocaleString()} full tournament simulations.`}
            </p>
          </div>
          <UserProjectionsTable
            users={sortedLiveUsers}
            sortKey={liveUserSort.key}
            sortDesc={liveUserSort.desc}
            onSort={(key) => toggleSort(setLiveUserSort, key, key !== "name")}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
