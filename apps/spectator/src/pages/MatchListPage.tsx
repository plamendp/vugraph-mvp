import { useState, useEffect, useCallback } from "react";
import { useAuth, apiFetch } from "@vugraph/ui";
import type { Match } from "@vugraph/types/engine";

export function MatchListPage() {
  const { user, logout } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchMatches = useCallback(async () => {
    try {
      const data = await apiFetch<Match[]>("/api/matches");
      setMatches(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const isCommentator = user?.roles.includes("commentator");

  return (
    <div className="page">
      <header className="topbar">
        <h1>Vugraph {isCommentator ? "(Commentator)" : ""}</h1>
        <div className="topbar-right">
          <span>{user?.username}</span>
          <button onClick={logout} className="btn-link">
            Log out
          </button>
        </div>
      </header>

      <main className="content">
        <section>
          <h2>Matches</h2>
          {loading ? (
            <p>Loading...</p>
          ) : error ? (
            <p className="error-msg">{error}</p>
          ) : matches.length === 0 ? (
            <p className="empty-state">No matches available.</p>
          ) : (
            <div className="match-list">
              {matches.map((m) => (
                <div key={m.id} className="match-card">
                  <div className="match-title">{m.title}</div>
                  <div className="match-teams">
                    {m.homeTeam} vs {m.awayTeam}
                  </div>
                  <div className="match-status">{m.status}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
