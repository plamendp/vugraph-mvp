import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useAuth, apiFetch } from "@vugraph/ui";
import { type RoleName, ALL_ROLES, type UserInfo } from "@vugraph/types/auth";

interface UserEntry extends UserInfo {
  createdAt: string;
}

export function UsersPage() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState("");

  // Create form state
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Set<RoleName>>(new Set());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

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

  return (
    <div className="page">
      <header className="topbar">
        <h1>Vugraph Admin</h1>
        <div className="topbar-right">
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
      </main>
    </div>
  );
}
