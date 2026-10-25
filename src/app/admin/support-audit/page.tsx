import { redirect } from "next/navigation";

export default function AdminSupportAuditRedirect() {
  redirect("/admin/audit-log");
}
