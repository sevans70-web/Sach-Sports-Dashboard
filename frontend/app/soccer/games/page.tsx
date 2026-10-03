import { GameSlatePage } from "@/components/game-slate-page";
export default async function Page({searchParams}:{searchParams:Promise<{league?:string}>}){const params=await searchParams;return <GameSlatePage sport="soccer" league={params.league||"eng.1"}/>}
