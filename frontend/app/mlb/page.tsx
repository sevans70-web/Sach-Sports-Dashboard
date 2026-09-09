import { PlatformHeader } from "@/components/platform-header";
import { MlbDashboard } from "@/components/mlb-dashboard";

export default function MlbPage() {
  return (
    <main className="pageShell mlbPage">
      <PlatformHeader league="MLB" />
      <MlbDashboard />
    </main>
  );
}
