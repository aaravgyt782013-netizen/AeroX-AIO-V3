import { Pool } from "@neondatabase/serverless";
import { logger } from "#utils/logger";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("[Neon] DATABASE_URL is required. Refusing to start without durable persistence.");
}

export const neonPool = new Pool({
  connectionString,
  max: Number.parseInt(process.env.NEON_POOL_MAX || "2", 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

neonPool.on("error", (error) => {
  logger.error("[Neon] Unexpected PostgreSQL pool error", error);
});

export async function neonQuery(text, values = []) {
  try {
    return await neonPool.query(text, values);
  } catch (error) {
    logger.error("[Neon] PostgreSQL query failed", {
      message: error?.message,
      code: error?.code,
    });
    throw error;
  }
}

export async function verifyNeonConnection() {
  const result = await neonQuery(
    "SELECT current_database() AS database, current_user AS role, NOW() AS server_time"
  );
  const row = result.rows[0];
  logger.success("[Neon]", `Connected to PostgreSQL database "${row.database}" as "${row.role}"`);
  return row;
}

export async function closeNeonPool() {
  await neonPool.end();
}
