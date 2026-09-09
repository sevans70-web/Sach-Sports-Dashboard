import Link from "next/link";

export function PlatformHeader({ league }: { league?: string }) {
  return (
    <header className="platformHeader">
      <Link className="hubButton" href="/" aria-label="Open Sport Hub">▦</Link>
      <div>
        <div className="eyebrow">Sach Sports</div>
        <div className="headerLeague">{league ?? "Game Intelligence"}</div>
      </div>
      <div className="livePill"><span /> Platform Preview</div>
    </header>
  );
}
