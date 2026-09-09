import { MlbGame } from "@/components/mlb-game";
export default async function Page({params}:{params:Promise<{gamePk:string}>}){const {gamePk}=await params; return <main className="pageShell mlbPage"><MlbGame gamePk={gamePk}/></main>}
