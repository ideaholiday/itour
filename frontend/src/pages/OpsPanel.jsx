import React from "react";
import { useLocation } from "react-router-dom";
import OpsLayout from "../components/ops/OpsLayout.jsx";
import LiveTripBoardView from "./ops/LiveTripBoardView.jsx";
import WhatsAppNotificationView from "./ops/WhatsAppNotificationView.jsx";
import SupportCasesView from "./ops/SupportCasesView.jsx";
import { authHeaders } from "../lib/api.js";

function OpsTaskQueueView() {
  const [tasks, setTasks] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/ops/tasks", { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setTasks(d.tasks);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm">
        <h2 className="text-xl font-serif font-bold text-stone-900 mb-4">
          Operations Task Queue & Resolution Audit Log
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500 uppercase">
                <th className="pb-3 px-4">Task Type</th>
                <th className="pb-3 px-4">Assigned Staff</th>
                <th className="pb-3 px-4">Priority</th>
                <th className="pb-3 px-4">Status</th>
                <th className="pb-3 px-4">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-700">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-stone-500">Loading task queue...</td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-stone-500">No active staff tasks logged.</td>
                </tr>
              ) : (
                tasks.map((t) => (
                  <tr key={t.id} className="hover:bg-stone-50">
                    <td className="py-3 px-4 font-bold text-amber-800">{t.task_type}</td>
                    <td className="py-3 px-4 font-semibold text-stone-900">{t.assigned_staff_name}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        t.priority === "CRITICAL" ? "bg-rose-100 text-rose-900 border border-rose-300" : "bg-amber-100 text-amber-900 border border-amber-300"
                      }`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="bg-emerald-100 text-emerald-900 border border-emerald-300 px-2 py-0.5 rounded font-bold">
                        {t.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-stone-600">{t.notes}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function OpsPanel({ view }) {
  const location = useLocation();

  let activeView = view;
  if (!activeView) {
    if (location.pathname.includes("/support")) activeView = "support";
    else if (location.pathname.includes("/notifications")) activeView = "notifications";
    else if (location.pathname.includes("/tasks")) activeView = "tasks";
    else activeView = "live";
  }

  return (
    <OpsLayout>
      {activeView === "live" && <LiveTripBoardView />}
      {activeView === "notifications" && <WhatsAppNotificationView />}
      {activeView === "support" && <SupportCasesView />}
      {activeView === "tasks" && <OpsTaskQueueView />}
    </OpsLayout>
  );
}
