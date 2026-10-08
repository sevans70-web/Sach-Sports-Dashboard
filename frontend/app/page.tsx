import Image from "next/image";
import Link from "next/link";

const activeSports = [
  { slug: "nfl", label: "NFL", image: "/hero/nfl.webp", detail: "Football intelligence" },
  { slug: "cfb", label: "CFB", image: "/hero/cfb.webp", detail: "College football" },
  { slug: "nba", label: "NBA", image: "/hero/nba.webp", detail: "Basketball intelligence" },
  { slug: "wnba", label: "WNBA", image: "/hero/wnba.webp", detail: "Women's basketball" },
  { slug: "nhl", label: "NHL", image: "/hero/nhl.webp", detail: "Hockey intelligence" },
] as const;

export default function HomePage() {
  return (
    <main className="sachHome">
      <div className="sachHomeInner">
        <header className="sachHomeHeader">
          <Link href="/" className="sachBrand" aria-label="Sach Sports home">
            <Image src="/brand/sach-sports-crown-logo.png" width={64} height={64} alt="Sach Sports crowned S logo" priority />
            <span><strong>SACH SPORTS</strong><small>THE INTELLIGENCE EDGE</small></span>
          </Link>
          <span className="sachHeaderTag">GAME DAY INTELLIGENCE</span>
        </header>
        <nav className="sachHomeNav" aria-label="Active sports">
          <Link className="current" href="/">HOME</Link>
          {activeSports.map(sport => <Link key={sport.slug} href={`/${sport.slug}`}>{sport.label}</Link>)}
        </nav>

        <section className="sachHomeHero">
          <div className="sachHeroGlow" />
          <div className="sachHeroCopy">
            <span className="sachKicker">SPORTS INTELLIGENCE PLATFORM</span>
            <h1>YOUR <em>GAME.</em><br />OUR INTELLIGENCE.</h1>
            <p>Player data · Game context · Smarter predictions</p>
            
          </div>
        </section>

        <section id="active-sports" className="sachHomeSection">
          <div className="sachSectionHeading"><div><span className="sachKicker"></span><h2>ACTIVE INTELLIGENCE CENTERS</h2></div><span className="sachSectionMeta">5 INTELLIGENCE CENTERS</span></div>
          <div className="sachSportTiles">
            {activeSports.map(sport => (
              <Link href={`/${sport.slug}`} key={sport.slug} className="sachSportTile" aria-label={sport.detail}>
                <Image src={sport.image} alt="" fill sizes="(max-width: 600px) 20vw, 220px" className="sachSportImage" />
                <span className="sachSportShade" /><span className="sachTileLabel"><strong>{sport.label}</strong><small>Intelligence Center</small></span><span className="sachTileArrow" aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="sachHomeSection">
          <div className="sachSectionHeading"><div><span className="sachKicker">YOUR COMMAND CENTER</span><h2>TODAY’S INTELLIGENCE</h2></div><span className="sachSectionMeta">LIVE DATA ONLY</span></div>
          <div className="sachIntelligenceGrid">
            <div><small>TODAY'S GAMES</small><strong>—</strong><span>See league slates below</span></div>
            <div><small>LIVE GAMES</small><strong>—</strong><span>Awaiting live summary</span></div>
            <div><small>PLAYER PROPS</small><strong>—</strong><span>Open sport rankings</span></div>
            <div><small>HIT RATE</small><strong>—</strong><span>Verified results only</span></div>
          </div>
          <p className="sachDataNote">Cross-sport totals will appear when the live summary feed is connected. No estimated or sample statistics are shown.</p>
        </section>

        <section className="sachHomeSection sachHomeBottom">
          <div className="sachSectionHeading"><div><span className="sachKicker">FIND THE MATCHUP</span><h2>TODAY’S GAMES</h2></div></div>
          <div className="sachHomePanel"><p>Choose a sport to view its real game slate, live status and matchup intelligence.</p><div className="sachQuickLinks">{activeSports.map(sport => <Link href={`/${sport.slug}`} key={sport.slug}>{sport.label} SLATE ↗</Link>)}</div></div>
        </section>
        <section className="sachHomeSection sachHomeBottom">
          <div className="sachSectionHeading"><div><span className="sachKicker">THE INTELLIGENCE EDGE</span><h2>TOP PREDICTIONS TODAY</h2></div></div>
          <div className="sachHomePanel"><p>Player rankings and model projections are available in each intelligence center. A verified cross-sport feed will populate this panel.</p><Link href="/nfl" className="sachOutlineButton">EXPLORE PLAYER RANKINGS ↗</Link></div>
        </section>
        <footer className="sachHomeFooter">© SACH SPORTS · BUILT FOR THE EDGE</footer>
      </div>
      <style>{`
        .sachHome{min-height:100vh;color:#f7f3e9;background:radial-gradient(ellipse at 50% 4%,#32250f 0%,#090909 36%,#050505 80%);font-family:Arial,Helvetica,sans-serif}
        .sachHome *{box-sizing:border-box}.sachHome a{text-decoration:none;color:inherit}
        .sachHomeInner{width:min(1080px,100%);margin:auto;padding:12px 18px 54px}
        .sachHomeHeader{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 0 14px;border-bottom:1px solid #534019}
        .sachBrand{display:flex;align-items:center;gap:9px}.sachBrand img{width:58px;height:58px;object-fit:contain}
        .sachBrand strong{display:block;color:#f6d87e;font-size:clamp(17px,4.4vw,28px);letter-spacing:.09em;font-weight:950;white-space:nowrap}
        .sachBrand small{display:block;color:#c5a55b;font-size:9px;letter-spacing:.18em;margin-top:3px}
        .sachHeaderTag{font-size:9px;letter-spacing:.15em;color:#cbb36e;text-align:right}
        .sachHomeNav{display:flex;gap:5px;overflow-x:auto;padding:11px 0 14px;scrollbar-width:none}
        .sachHomeNav a{flex:1;text-align:center;min-width:45px;border:1px solid #58441c;border-radius:5px;background:#100e0a;padding:10px 7px;font-size:11px;font-weight:900;color:#e7d7ad}
        .sachHomeNav a.current{background:linear-gradient(130deg,#f3d47c,#a67823);color:#0b0906;border-color:#e4bb5b}
        .sachHomeHero{position:relative;isolation:isolate;min-height:330px;border:1px solid #b78b36;border-radius:12px;overflow:hidden;display:flex;align-items:center;background:linear-gradient(90deg,rgba(0,0,0,.96),rgba(0,0,0,.55)),url('/hero/nfl.webp') center 40%/cover}
        .sachHeroGlow{position:absolute;inset:0;z-index:-1;background:radial-gradient(circle at 75% 30%,rgba(226,166,45,.23),transparent 58%),linear-gradient(0deg,#080807,transparent 40%)}
        .sachHeroCopy{padding:36px clamp(20px,5vw,60px);max-width:650px}
        .sachKicker{color:#d8af4d;letter-spacing:.18em;font-size:10px;font-weight:900}
        .sachHomeHero h1{font-size:clamp(35px,7vw,73px);line-height:1.04;letter-spacing:-.045em;margin:17px 0 14px;font-weight:950}
        .sachHomeHero h1 em{font-style:normal;color:#f4d16f}
        .sachHomeHero p{font-size:clamp(12px,2.7vw,16px);color:#e3d8bd;line-height:1.5;max-width:370px}
        .sachGoldButton,.sachOutlineButton{display:inline-flex;align-items:center;gap:14px;margin-top:18px;padding:13px 18px;background:linear-gradient(135deg,#f7d982,#bb8a32);color:#130d05!important;border-radius:6px;font-size:11px;font-weight:950;letter-spacing:.04em}
        .sachHomeSection{margin-top:32px}.sachSectionHeading{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-bottom:14px}
        .sachSectionHeading h2{margin:6px 0 0;font-size:clamp(20px,4.4vw,29px);letter-spacing:.03em}
        .sachSectionMeta{color:#b59c60;font-size:10px;white-space:nowrap;letter-spacing:.08em}
        .sachSportTiles{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px}
        .sachSportTile{position:relative;isolation:isolate;min-height:clamp(105px,20vw,180px);border:1px solid #bb8d38;border-radius:9px;overflow:hidden;display:flex;align-items:end;justify-content:center;padding:13px 3px;background:#16120d}
        .sachSportImage{object-fit:cover;z-index:-2}.sachSportShade{position:absolute;inset:0;z-index:-1;background:linear-gradient(0deg,rgba(0,0,0,.94),transparent 75%)}
        .sachSportTile strong{font-size:clamp(12px,2.6vw,24px);font-weight:950;color:#f4d27a;text-shadow:0 2px 8px #000}
        .sachTileArrow{position:absolute;right:7px;top:6px;color:#f6d57b;font-size:14px}
        .sachIntelligenceGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
        .sachIntelligenceGrid>div{min-height:118px;padding:16px 11px;border:1px solid #8d6c2c;border-radius:9px;background:linear-gradient(140deg,#211b10,#0c0c0b)}
        .sachIntelligenceGrid small,.sachIntelligenceGrid span{display:block;color:#bfae89;font-size:10px}
        .sachIntelligenceGrid strong{display:block;color:#f5d47d;font-size:32px;margin:7px 0}
        .sachDataNote{color:#978d76;font-size:11px;line-height:1.5}
        .sachHomePanel{border:1px solid #745b2d;border-radius:10px;background:linear-gradient(135deg,#19160f,#0d0d0c);padding:22px;color:#d2c8b1;line-height:1.6;font-size:14px}
        .sachQuickLinks{display:flex;flex-wrap:wrap;gap:9px;margin-top:16px}
        .sachQuickLinks a,.sachOutlineButton{border:1px solid #a7833c;border-radius:6px;padding:10px 13px;font-size:11px;font-weight:900;color:#f1d17b!important;background:#14110b;margin-top:0}
        .sachOutlineButton{margin-top:8px}.sachHomeFooter{text-align:center;color:#85724a;letter-spacing:.15em;font-size:10px;padding-top:45px}
        @media(max-width:600px){.sachHomeInner{padding:8px 11px 40px}.sachBrand img{width:46px;height:46px}.sachHeaderTag{font-size:7px;max-width:76px}.sachHomeNav{gap:4px}.sachHomeNav a{padding:9px 3px;font-size:10px}.sachHomeHero{min-height:300px}.sachHeroCopy{padding:27px 18px}.sachHomeHero h1{font-size:clamp(31px,8vw,47px)}.sachHomeSection{margin-top:26px}.sachSectionMeta{font-size:8px}.sachSportTiles{gap:5px}.sachSportTile{min-height:112px;border-radius:6px}.sachSportTile strong{font-size:12px}.sachTileArrow{font-size:10px;right:4px}.sachIntelligenceGrid{gap:6px}.sachIntelligenceGrid>div{min-height:110px;padding:12px 6px}.sachIntelligenceGrid small,.sachIntelligenceGrid span{font-size:9px}.sachIntelligenceGrid strong{font-size:25px}}
.sachHome{background:#030303}
.sachHomeHeader{justify-content:center;position:relative;min-height:85px}
.sachBrand img{width:78px;height:78px}
.sachBrand strong{font-size:clamp(23px,4vw,40px)}
.sachHeaderTag{position:absolute;right:4px}
.sachHomeNav{justify-content:center}
.sachHomeNav a{background:transparent;border:0;color:#fff;font-size:14px}
.sachHomeNav a.current{border-radius:30px}
.sachHomeHero{min-height:295px;background:linear-gradient(90deg,#000 0%,rgba(0,0,0,.95) 44%,rgba(0,0,0,.5) 100%),url('/hero/nfl.webp') center/cover}
.sachHomeHero h1{font-size:clamp(30px,5.7vw,60px)}
.sachSportTile{min-height:185px;justify-content:flex-start;padding:12px}
.sachSportImage{filter:brightness(.55)}
.sachSportShade{background:linear-gradient(0deg,#000 0%,rgba(0,0,0,.85) 32%,rgba(0,0,0,.5) 100%)}
.sachTileLabel{position:relative;z-index:1;display:flex;flex-direction:column;gap:5px}
.sachTileLabel strong{font-size:24px;color:#fff}
.sachTileLabel small{font-size:12px;color:#f0d18b}
.sachTileArrow{top:auto;bottom:10px;right:8px;border:2px solid #e6ba61;border-radius:50%;height:30px;width:30px;display:grid;place-items:center;font-size:23px}
.sachHomeSection:has(.sachIntelligenceGrid){border:2px solid #caa04e;border-radius:13px;padding:15px;background:#110e08}
@media(max-width:600px){.sachHomeHeader{min-height:65px}.sachBrand img{width:55px;height:55px}.sachBrand strong{font-size:22px}.sachHomeNav a{font-size:11px}.sachHomeHero{min-height:245px}.sachHeroCopy{padding:19px}.sachHomeHero h1{font-size:clamp(27px,6vw,38px)}.sachSportTile{min-height:135px;padding:6px}.sachTileLabel strong{font-size:15px}.sachTileLabel small{font-size:9px}.sachTileArrow{width:18px;height:18px;font-size:13px;right:4px;bottom:5px;border-width:1px}}
      `}</style>
    </main>
  );
}
