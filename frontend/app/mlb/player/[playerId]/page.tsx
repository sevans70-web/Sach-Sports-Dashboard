import { MlbPlayer } from "@/components/mlb-player";
export default async function Page({params}:{params:Promise<{playerId:string}>}){const {playerId}=await params; return <main className="pageShell mlbPage"><MlbPlayer playerId={playerId}/></main>}
