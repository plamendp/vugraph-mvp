import { useNotifications } from "./CentrifugoContext.tsx";

export function NotificationBar() {
  const { notifications, dismissNotification } = useNotifications();

  if (notifications.length === 0) return null;

  return (
    <div style={{
      position: "fixed",
      top: 12,
      right: 12,
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      maxWidth: 400,
    }}>
      {notifications.map((n) => (
        <div
          key={n.id}
          style={{
            background: "#1a1a2e",
            color: "#e0e0e0",
            padding: "12px 16px",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            animation: "fadeIn 0.3s ease",
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>
              {n.from} &middot; {new Date(n.timestamp).toLocaleTimeString()}
            </div>
            <div style={{ fontSize: 14 }}>{n.message}</div>
          </div>
          <button
            onClick={() => dismissNotification(n.id)}
            style={{
              background: "none",
              border: "none",
              color: "#888",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: 0,
            }}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
