import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin-auth";
export const dynamic = "force-dynamic";
export const metadata = { title: "Admin | Sach Sports", robots: { index: false, follow: false } };
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!await currentAdmin()) redirect("/admin/login");
  return children;
}
