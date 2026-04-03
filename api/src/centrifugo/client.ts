import { CENTRIFUGO_API_URL, CENTRIFUGO_API_KEY } from "../config.js";

/**
 * Publish a message to a Centrifugo channel via its HTTP API.
 */
export async function publish(channel: string, data: unknown): Promise<void> {
  const res = await fetch(`${CENTRIFUGO_API_URL}/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": CENTRIFUGO_API_KEY,
    },
    body: JSON.stringify({ channel, data }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Centrifugo publish failed (${res.status}): ${body}`);
  }
}

/**
 * Broadcast a message to a match channel.
 */
export async function broadcastToMatch(matchId: string, data: unknown): Promise<void> {
  await publish(`match:${matchId}`, data);
}

/**
 * Broadcast a notification to all connected clients.
 */
export async function broadcastNotification(data: unknown): Promise<void> {
  await publish("notifications:global", data);
}
