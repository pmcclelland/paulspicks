"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Stats = {
  teamCount: number;
  gameCount: number;
  userCount: number;
  pickCount: number;
  locked: boolean;
  lastRefresh: string | null;
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated") {
      if (!(session?.user as any)?.isAdmin) {
        router.push("/");
        return;
      }
      fetchStats();
    }
  }, [status, session, router]);

  async function fetchStats() {
    try {
      const res = await fetch("/api/admin/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // Stats fetch failed, show defaults
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(
    endpoint: string,
    actionName: string,
    body?: object
  ) {
    setActionLoading(actionName);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();

      if (res.ok) {
        toast.success(data.message || `${actionName} completed.`);
        fetchStats();
      } else {
        toast.error(data.error || `${actionName} failed.`);
      }
    } catch {
      toast.error(`${actionName} failed. Please try again.`);
    } finally {
      setActionLoading(null);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#F4793B] border-t-transparent" />
      </div>
    );
  }

  if (!(session?.user as any)?.isAdmin) {
    return null;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-8">Admin Dashboard</h1>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-[#F4793B]">
                {stats.teamCount}
              </div>
              <div className="text-xs text-muted-foreground">Teams</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-[#F4793B]">
                {stats.gameCount}
              </div>
              <div className="text-xs text-muted-foreground">Games</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-[#F4793B]">
                {stats.userCount}
              </div>
              <div className="text-xs text-muted-foreground">Users</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-[#F4793B]">
                {stats.pickCount}
              </div>
              <div className="text-xs text-muted-foreground">Picks</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Status */}
      {stats && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Picks locked:</span>
              <span
                className={`font-medium ${stats.locked ? "text-red-600" : "text-green-600"}`}
              >
                {stats.locked ? "Yes" : "No"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Last score refresh:</span>
              <span className="font-medium">
                {stats.lastRefresh
                  ? new Date(stats.lastRefresh).toLocaleString()
                  : "Never"}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>
            Manage tournament data and settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() =>
                handleAction("/api/admin/seed", "Seed Tournament")
              }
              disabled={actionLoading !== null}
              className="bg-[#F4793B] hover:bg-[#E06830] text-white"
            >
              {actionLoading === "Seed Tournament"
                ? "Seeding..."
                : "Seed Tournament"}
            </Button>

            <Button
              onClick={() =>
                handleAction("/api/admin/refresh", "Refresh Scores")
              }
              disabled={actionLoading !== null}
              variant="outline"
            >
              {actionLoading === "Refresh Scores"
                ? "Refreshing..."
                : "Refresh Scores"}
            </Button>

            <Button
              onClick={() =>
                handleAction("/api/admin/lock", "Toggle Lock", {
                  locked: !stats?.locked,
                })
              }
              disabled={actionLoading !== null}
              variant={stats?.locked ? "destructive" : "outline"}
            >
              {actionLoading === "Toggle Lock"
                ? "Toggling..."
                : stats?.locked
                  ? "Unlock Picks"
                  : "Lock Picks"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
