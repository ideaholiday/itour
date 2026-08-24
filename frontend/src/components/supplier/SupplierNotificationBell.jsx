import React, { useState, useEffect } from "react";
import { Bell, CheckCheck, ExternalLink, Clock } from "lucide-react";
import { Dropdown } from "../ui/Dropdown";
import api from "../../lib/api";

export function SupplierNotificationBell({ supplierId }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = async () => {
    if (!supplierId) return;
    try {
      const res = await api.get(`/suppliers/${supplierId}/notifications`);
      if (res?.notifications) {
        setNotifications(res.notifications);
        setUnreadCount(res.notifications.filter((n) => !n.is_read).length);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [supplierId]);

  const markAllRead = async () => {
    try {
      await api.post(`/suppliers/${supplierId}/notifications/read-all`);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch {}
  };

  const markOneRead = async (notifId) => {
    try {
      await api.patch(`/suppliers/${supplierId}/notifications/${notifId}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: 1 } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {}
  };

  const trigger = (
    <button
      type="button"
      className="relative p-2 rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:text-amber-600 transition-colors shadow-sm"
      aria-label="Notifications"
    >
      <Bell className="w-4 h-4" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white font-mono font-bold text-[10px] flex items-center justify-center animate-bounce">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );

  return (
    <Dropdown trigger={trigger} align="right" className="relative">
      <div className="w-80 p-2">
        <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800 px-2">
          <div className="flex items-center gap-1.5 font-bold text-xs text-stone-900 dark:text-stone-100">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
            >
              <CheckCheck className="w-3 h-3" />
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-72 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800/60 my-1">
          {notifications.length === 0 ? (
            <div className="text-center py-6 text-xs text-stone-400">
              No notifications yet.
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => markOneRead(n.id)}
                className={`p-2.5 rounded-xl transition-colors cursor-pointer text-left ${
                  !n.is_read
                    ? "bg-amber-50/50 dark:bg-amber-950/20"
                    : "hover:bg-stone-50 dark:hover:bg-stone-800/50"
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <h5 className="text-xs font-bold text-stone-900 dark:text-stone-100">{n.title}</h5>
                  <span className="text-[10px] text-stone-400 whitespace-nowrap flex items-center gap-0.5">
                    <Clock className="w-2.5 h-2.5" />
                    {new Date(n.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                  </span>
                </div>
                <p className="text-[11px] text-stone-600 dark:text-stone-400 mt-0.5 leading-snug">
                  {n.message}
                </p>
                {n.action_url && (
                  <a
                    href={n.action_url}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-1 hover:underline"
                  >
                    <span>View details</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </Dropdown>
  );
}

export default SupplierNotificationBell;
