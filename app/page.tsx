"use client";
import { useEffect, useState } from "react";
import { COMPANY } from "@/lib/company";
import LiveLab from "@/components/LiveLab";
import ClaudeLab from "@/components/ClaudeLab";

type Tab = "claude" | "live";

export default function Home() {
  const [tab, setTab] = useState<Tab>("claude");

  // Remember the tab in the address (…/#live) so links open the right one
  useEffect(() => {
    if (window.location.hash === "#live") setTab("live");
  }, []);
  const choose = (t: Tab) => {
    setTab(t);
    try { window.history.replaceState(null, "", t === "live" ? "#live" : "#claude"); } catch {}
  };

  return (
    <main className="wrap">
      <h1 className="title pixel">{COMPANY.name}</h1>
      <div className="labtabs">
        <button className={`labtab ${tab === "claude" ? "sel" : ""}`} onClick={() => choose("claude")}>
          🎬 Claude lab <span>replay</span>
        </button>
        <button className={`labtab ${tab === "live" ? "sel" : ""}`} onClick={() => choose("live")}>
          🔴 Gemini lab <span>live</span>
        </button>
      </div>
      {tab === "claude" ? <ClaudeLab /> : <LiveLab />}
    </main>
  );
}
