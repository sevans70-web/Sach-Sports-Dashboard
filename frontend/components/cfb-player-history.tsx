"use client";

import { useState } from "react";

type WindowSize = 5 | 10 | 20;

export function CfbPlayerHistory({
  playerName,
  market,
}: {
  playerName: string;
  market: string;
}) {
  const [windowSize, setWindowSize] = useState<WindowSize>(10);

  return (
    <section className="historyBlock">
      <div className="history">
        {[5, 10, 20].map((value) => (
          <button
            key={value}
            type="button"
            className={windowSize === value ? "active" : ""}
            onClick={() => setWindowSize(value as WindowSize)}
          >
            Last {value}
          </button>
        ))}
      </div>

      <p className="historyTitle">
        Last {windowSize} Games · {market}
      </p>
      <p className="note">
        Verified game-by-game history for {playerName} will appear here when the
        CFB history feed is available for this market.
      </p>

      <style jsx>{`
        .historyBlock{margin-top:18px}
        .history{display:flex;overflow-x:auto}
        .history button{background:#111319;color:#fff;border:1px solid #383b42;padding:12px 18px;white-space:nowrap;cursor:pointer}
        .history button:first-child{border-radius:10px 0 0 10px}
        .history button:last-child{border-radius:0 10px 10px 0}
        .history .active{color:#d9b85d;border-color:#20df7f;background:#0c1711}
        .historyTitle{margin:12px 0 4px;color:#fff;font-weight:850}
        .note{margin-top:4px;color:#9da1a8;line-height:1.45}
      `}</style>
    </section>
  );
}
