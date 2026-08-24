import React, { useState } from "react";

export function Tabs({ tabs = [], activeTab: controlledActiveTab, onChange, className = "", contentClassName = "" }) {
  const [internalActiveTab, setInternalActiveTab] = useState(tabs[0]?.id || "");

  const activeTabId = controlledActiveTab !== undefined ? controlledActiveTab : internalActiveTab;

  const handleTabClick = (tabId) => {
    if (controlledActiveTab === undefined) {
      setInternalActiveTab(tabId);
    }
    if (onChange) {
      onChange(tabId);
    }
  };

  const currentTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  return (
    <div className="w-full space-y-6">
      {/* Tab Navigation Buttons */}
      <div className={`flex items-center gap-2 overflow-x-auto hide-scrollbar p-1.5 bg-stone-100 dark:bg-stone-800/80 rounded-2xl border border-stone-200/60 dark:border-stone-700/60 ${className}`}>
        {tabs.map((tab) => {
          const isActive = activeTabId === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-xl whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? "bg-white dark:bg-stone-900 text-amber-700 dark:text-amber-400 shadow-xs font-bold border border-stone-200/80 dark:border-stone-700/80"
                  : "text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-white/50 dark:hover:bg-stone-800/50"
              }`}
            >
              {Icon && <Icon className={`w-4 h-4 ${isActive ? "text-amber-600 dark:text-amber-400" : "text-stone-400"}`} />}
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    isActive
                      ? "bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200"
                      : "bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Render Active Tab Content */}
      {currentTab?.content && (
        <div className={`transition-all duration-200 animate-fadeIn ${contentClassName}`}>
          {currentTab.content}
        </div>
      )}
    </div>
  );
}

export default Tabs;
