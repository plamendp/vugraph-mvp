import { DB } from "./database.js";
import { hashPassword } from "../auth/password.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin";

async function seed() {
  const db = new DB(DATABASE_URL!);
  await db.init();

  const existing = await db.getUserByUsername("admin");
  if (existing) {
    console.log("Admin user already exists, skipping seed.");
    await db.close();
    return;
  }

  const passwordHash = await hashPassword(SEED_ADMIN_PASSWORD);
  const user = await db.createUser("admin", passwordHash);
  await db.assignRole(user.id, "admin");

  console.log(`Seeded admin user (id=${user.id})`);
  await db.close();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
