import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useAuth, apiFetch, useCentrifugo } from "@vugraph/ui";
import { type RoleName, ALL_ROLES, type UserInfo } from "@vugraph/types/auth";

interface UserEntry extends UserInfo {
  createdAt: string;
}

export function UsersPage() {
  const { user, logout } = useAuth();
  const { connected } = useCentrifugo();
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState("");

  // Create form state
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Set<RoleName>>(new Set());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Broadcast form state
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastError, setBroadcastError] = useState("");
  const [broadcastSuccess, setBroadcastSuccess] = useState("");

  const fetchUsers = useCallback(async () => {
    try {
      const data = await apiFetch<{ users: UserEntry[] }>("/api/auth/users");
      setUsers(data.users);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const toggleRole = (role: RoleName) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError("");
    if (selectedRoles.size === 0) {
      setCreateError("Select at least one role");
      return;
    }
    setCreating(true);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          roles: [...selectedRoles],
        }),
      });
      setNewUsername("");
      setNewPassword("");
      setSelectedRoles(new Set());
      await fetchUsers();
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleBroadcast = async (e: FormEvent) => {
    e.preventDefault();
    setBroadcastError("");
    setBroadcastSuccess("");
    if (!broadcastMsg.trim()) return;
    setBroadcasting(true);
    try {
      await apiFetch("/api/broadcast", {
        method: "POST",
        body: JSON.stringify({ message: broadcastMsg.trim() }),
      });
      setBroadcastSuccess("Message sent!");
      setBroadcastMsg("");
      setTimeout(() => setBroadcastSuccess(""), 3000);
    } catch (err: any) {
      setBroadcastError(err.message);
    } finally {
      setBroadcasting(false);
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <h1>Vugraph Admin</h1>
        <div className="topbar-right">
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: connected ? "#4caf50" : "#f44336",
              marginRight: 6,
            }}
            title={connected ? "WebSocket connected" : "WebSocket disconnected"}
          />
          <span>{user?.username}</span>
          <button onClick={logout} className="btn-link">
            Log out
          </button>
        </div>
      </header>

      <main className="content">
        <section>
          <h2>Users</h2>
          {loadingUsers ? (
            <p>Loading...</p>
          ) : error ? (
            <p className="error-msg">{error}</p>
          ) : (
            <table className="users-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Roles</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.roles.join(", ")}</td>
                    <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2>Create User</h2>
          <form className="create-form" onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="new-username">Username</label>
              <input
                id="new-username"
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="new-password">Password</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <fieldset className="roles-fieldset">
              <legend>Roles</legend>
              <div className="roles-grid">
                {ALL_ROLES.map((role) => (
                  <label key={role} className="role-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedRoles.has(role)}
                      onChange={() => toggleRole(role)}
                    />
                    {role}
                  </label>
                ))}
              </div>
            </fieldset>
            {createError && <div className="error-msg">{createError}</div>}
            <button type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create User"}
            </button>
          </form>
        </section>

        <section>
          <h2>Broadcast Message</h2>
          <p style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>
            Send a message to all connected users via WebSocket.
            {!connected && (
              <span style={{ color: "#f44336", marginLeft: 8 }}>
                (WebSocket not connected)
              </span>
            )}
          </p>
          <form className="create-form" onSubmit={handleBroadcast}>
            <div className="field">
              <label htmlFor="broadcast-msg">Message</label>
              <textarea
                id="broadcast-msg"
                value={broadcastMsg}
                onChange={(e) => setBroadcastMsg(e.target.value)}
                rows={3}
                required
                style={{ width: "100%", resize: "vertical" }}
              />
            </div>
            {broadcastError && <div className="error-msg">{broadcastError}</div>}
            {broadcastSuccess && (
              <div style={{ color: "#4caf50", fontSize: 13 }}>{broadcastSuccess}</div>
            )}
            <button type="submit" disabled={broadcasting || !broadcastMsg.trim()}>
              {broadcasting ? "Sending..." : "Send Broadcast"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
