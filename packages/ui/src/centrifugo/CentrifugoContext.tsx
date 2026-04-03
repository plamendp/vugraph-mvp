import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { Centrifuge, type PublicationContext } from "centrifuge";
import { useAuth } from "../auth/AuthContext.tsx";
import { getToken } from "../auth/api.ts";

export interface Notification {
  id: string;
  message: string;
  from: string;
  timestamp: number;
}

interface CentrifugoState {
  connected: boolean;
  notifications: Notification[];
  dismissNotification: (id: string) => void;
}

const CentrifugoContext = createContext<CentrifugoState | null>(null);

function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/connection/websocket`;
}

export function CentrifugoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const userId = user?.id ?? null;

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    if (userId === null) {
      setConnected(false);
      return;
    }

    const token = getToken();
    if (!token) return;

    let cancelled = false;

    const client = new Centrifuge(getWsUrl(), {
      data: { token },
    });

    client.on("connected", () => {
      if (!cancelled) setConnected(true);
    });
    client.on("disconnected", () => {
      if (!cancelled) setConnected(false);
    });

    const sub = client.newSubscription("notifications:global");
    sub.on("publication", (ctx: PublicationContext) => {
      if (cancelled) return;
      const data = ctx.data as { type: string; message: string; from: string; timestamp: number };
      if (data.type === "notification") {
        setNotifications((prev) => [
          {
            id: `${data.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
            message: data.message,
            from: data.from,
            timestamp: data.timestamp,
          },
          ...prev,
        ]);
      }
    });
    sub.subscribe();

    client.connect();

    return () => {
      cancelled = true;
      client.disconnect();
      setConnected(false);
    };
  }, [userId]);

  return (
    <CentrifugoContext.Provider value={{ connected, notifications, dismissNotification }}>
      {children}
    </CentrifugoContext.Provider>
  );
}

export function useCentrifugo(): CentrifugoState {
  const ctx = useContext(CentrifugoContext);
  if (!ctx) throw new Error("useCentrifugo must be used within CentrifugoProvider");
  return ctx;
}

export function useNotifications() {
  const { notifications, dismissNotification } = useCentrifugo();
  return { notifications, dismissNotification };
}
