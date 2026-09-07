import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Home() {
  redirect((await getSession()) ? "/automations" : "/login");
}
