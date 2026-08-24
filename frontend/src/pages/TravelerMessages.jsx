import React, { useState, useEffect } from "react";
import { MessageSquare, Send, Clock, User, ShieldCheck, CheckCheck } from "lucide-react";
import api from "../lib/api";
import Avatar from "../components/ui/Avatar";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";

export function TravelerMessages() {
  const [conversations, setConversations] = useState([
    {
      id: "conv-1",
      supplier_name: "Heritage Rajasthan Tours",
      last_message: "Your private chauffeur will meet you at Terminal 2 Gate 4.",
      time: "10:30 AM",
      unread: 1,
      booking_ref: "IH-2026-882",
    },
    {
      id: "conv-2",
      supplier_name: "Taj Mahal Luxury Transfers",
      last_message: "Taj Sunrise ticket slot confirmed for 5:30 AM.",
      time: "Yesterday",
      unread: 0,
      booking_ref: "IH-2026-741",
    },
  ]);

  const [activeConv, setActiveConv] = useState(conversations[0]);
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: "supplier",
      text: "Namaste! We are preparing your private airport transfer for tomorrow.",
      time: "10:15 AM",
    },
    {
      id: 2,
      sender: "user",
      text: "Great, will the driver hold a name signboard?",
      time: "10:22 AM",
    },
    {
      id: 3,
      sender: "supplier",
      text: "Your private chauffeur will meet you at Terminal 2 Gate 4 with an Idea Holiday sign.",
      time: "10:30 AM",
    },
  ]);

  const [inputMsg, setInputMsg] = useState("");

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputMsg.trim()) return;

    const newMsg = {
      id: Date.now(),
      sender: "user",
      text: inputMsg.trim(),
      time: "Just now",
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputMsg("");
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-stone-900 dark:text-stone-100 font-display">
          Host Messages & Trip Inquiries
        </h1>
        <p className="text-xs sm:text-sm text-stone-500 mt-1">
          Direct communication with your local operators and tour guides.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[600px] rounded-3xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden shadow-sm">
        {/* Conversation List */}
        <div className="border-r border-stone-200 dark:border-stone-800 flex flex-col">
          <div className="p-4 border-b border-stone-100 dark:border-stone-800">
            <span className="text-xs font-bold text-stone-900 dark:text-stone-100">
              Active Conversations
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setActiveConv(conv)}
                className={`p-4 cursor-pointer transition-colors ${
                  activeConv.id === conv.id
                    ? "bg-amber-50/60 dark:bg-amber-950/30"
                    : "hover:bg-stone-50 dark:hover:bg-stone-800/50"
                }`}
              >
                <div className="flex items-start justify-between">
                  <span className="text-xs font-bold text-stone-900 dark:text-stone-100 truncate">
                    {conv.supplier_name}
                  </span>
                  <span className="text-[10px] text-stone-400">{conv.time}</span>
                </div>
                <p className="text-xs text-stone-500 truncate mt-1">{conv.last_message}</p>
                <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 font-bold block mt-1">
                  Ref: {conv.booking_ref}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Thread */}
        <div className="md:col-span-2 flex flex-col justify-between h-full bg-stone-50/40 dark:bg-stone-950/40">
          {/* Thread Header */}
          <div className="p-4 border-b border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar name={activeConv.supplier_name} size="md" />
              <div>
                <h4 className="text-xs font-bold text-stone-900 dark:text-stone-100">
                  {activeConv.supplier_name}
                </h4>
                <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-semibold">
                  <ShieldCheck className="w-3 h-3" /> Verified Host · Online
                </span>
              </div>
            </div>
            <span className="text-xs font-mono font-bold text-stone-500">
              Trip #{activeConv.booking_ref}
            </span>
          </div>

          {/* Messages list */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`max-w-sm rounded-2xl p-3.5 text-xs shadow-xs ${
                    msg.sender === "user"
                      ? "bg-amber-500 text-white rounded-br-none"
                      : "bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-200 rounded-bl-none"
                  }`}
                >
                  <p>{msg.text}</p>
                </div>
                <span className="text-[10px] text-stone-400 mt-1 px-1">{msg.time}</span>
              </div>
            ))}
          </div>

          {/* Input box */}
          <form
            onSubmit={handleSend}
            className="p-3 bg-white dark:bg-stone-900 border-t border-stone-200 dark:border-stone-800 flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Type your message to host..."
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              className="flex-1 rounded-xl border border-stone-200 dark:border-stone-700 px-3.5 py-2 text-xs bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
            <Button size="sm" variant="primary" icon={Send} type="submit">
              Send
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default TravelerMessages;
