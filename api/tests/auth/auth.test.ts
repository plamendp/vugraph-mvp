import { describe, it, expect, beforeEach } from "vitest";
import { hashPassword, verifyPassword } from "../../src/auth/password.js";
import { signToken, verifyToken } from "../../src/auth/jwt.js";
import type { JwtPayload, RoleName } from "../../src/auth/types.js";
import { MockDB } from "../../src/db/mock-database.js";

describe("Password hashing", () => {
  it("hashes and verifies a password correctly", async () => {
    const hash = await hashPassword("my-secret");
    expect(hash).not.toBe("my-secret");
    expect(await verifyPassword("my-secret", hash)).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("correct");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("produces different hashes for same password (salted)", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2);
  });
});

describe("JWT", () => {
  it("signs and verifies a token", () => {
    const payload = { sub: 1, username: "alice", roles: ["admin" as RoleName] };
    const token = signToken(payload);
    const decoded = verifyToken(token);
    expect(decoded.sub).toBe(1);
    expect(decoded.username).toBe("alice");
    expect(decoded.roles).toEqual(["admin"]);
    expect(decoded.iat).toBeDefined();
    expect(decoded.exp).toBeDefined();
  });

  it("rejects a tampered token", () => {
    const token = signToken({ sub: 1, username: "alice", roles: ["admin"] });
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(() => verifyToken(tampered)).toThrow();
  });

  it("rejects a completely invalid token", () => {
    expect(() => verifyToken("not.a.jwt")).toThrow();
  });
});

describe("Auth flow with MockDB", () => {
  let db: MockDB;

  beforeEach(async () => {
    db = new MockDB();
    await db.init();
  });

  it("creates a user and retrieves by username", async () => {
    const hash = await hashPassword("pass123");
    const user = await db.createUser("bob", hash);
    expect(user.id).toBe(1);
    expect(user.username).toBe("bob");

    const found = await db.getUserByUsername("bob");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(user.id);
  });

  it("returns null for unknown username", async () => {
    const found = await db.getUserByUsername("nobody");
    expect(found).toBeNull();
  });

  it("assigns and retrieves roles", async () => {
    const hash = await hashPassword("pass");
    const user = await db.createUser("carol", hash);
    await db.assignRole(user.id, "operator");
    await db.assignRole(user.id, "commentator");

    const roles = await db.getUserRoles(user.id);
    expect(roles).toContain("operator");
    expect(roles).toContain("commentator");
    expect(roles).toHaveLength(2);
  });

  it("does not duplicate roles on re-assign", async () => {
    const hash = await hashPassword("pass");
    const user = await db.createUser("dave", hash);
    await db.assignRole(user.id, "admin");
    await db.assignRole(user.id, "admin");

    const roles = await db.getUserRoles(user.id);
    expect(roles).toEqual(["admin"]);
  });

  it("returns empty roles for user with none", async () => {
    const hash = await hashPassword("pass");
    const user = await db.createUser("eve", hash);
    const roles = await db.getUserRoles(user.id);
    expect(roles).toEqual([]);
  });

  it("full login flow: create user, verify password, issue JWT", async () => {
    const password = "secure-pass";
    const hash = await hashPassword(password);
    const user = await db.createUser("operator1", hash);
    await db.assignRole(user.id, "operator");

    // Simulate login
    const found = await db.getUserByUsername("operator1");
    expect(found).not.toBeNull();
    expect(await verifyPassword(password, found!.passwordHash)).toBe(true);

    const roles = await db.getUserRoles(found!.id);
    const token = signToken({ sub: found!.id, username: found!.username, roles });

    // Verify token contains correct data
    const decoded = verifyToken(token);
    expect(decoded.sub).toBe(user.id);
    expect(decoded.username).toBe("operator1");
    expect(decoded.roles).toEqual(["operator"]);
  });

  it("lists all users ordered by id", async () => {
    const h = await hashPassword("pass");
    await db.createUser("zara", h);
    await db.createUser("alice", h);
    await db.createUser("mike", h);

    const all = await db.listUsers();
    expect(all).toHaveLength(3);
    expect(all[0].username).toBe("zara");
    expect(all[1].username).toBe("alice");
    expect(all[2].username).toBe("mike");
    expect(all[0].id).toBeLessThan(all[1].id);
  });

  it("rejects login with wrong password", async () => {
    const hash = await hashPassword("correct");
    await db.createUser("locked", hash);

    const found = await db.getUserByUsername("locked");
    expect(found).not.toBeNull();
    expect(await verifyPassword("wrong", found!.passwordHash)).toBe(false);
  });
});
