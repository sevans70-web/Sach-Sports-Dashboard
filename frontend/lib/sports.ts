export type Sport = {
  slug: string;
  name: string;
  league: string;
  icon: string;
  status: "active" | "foundation" | "planned";
};

export const sports: Sport[] = [
  { slug: "mlb", name: "Baseball", league: "MLB", icon: "⚾", status: "active" },
  { slug: "nfl", name: "Football", league: "NFL", icon: "🏈", status: "active" },
  { slug: "cfb", name: "College Football", league: "CFB", icon: "🏈", status: "active" },
  { slug: "wnba", name: "Women’s Basketball", league: "WNBA", icon: "🏀", status: "foundation" },
  { slug: "nba", name: "Basketball", league: "NBA", icon: "🏀", status: "active" },
  { slug: "ncaab", name: "College Basketball", league: "NCAAB", icon: "🏀", status: "planned" },
  { slug: "nhl", name: "Hockey", league: "NHL", icon: "🏒", status: "active" },
  { slug: "soccer", name: "World Football", league: "Soccer", icon: "⚽", status: "active" },
  { slug: "tennis", name: "Tennis", league: "ATP · WTA", icon: "🎾", status: "planned" },
  { slug: "golf", name: "Golf", league: "PGA · LPGA", icon: "⛳", status: "planned" },
];
