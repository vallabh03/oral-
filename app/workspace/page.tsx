import { requireChatGPTUser } from "@/app/chatgpt-auth";
import Login from "./login";
export const dynamic = "force-dynamic";
export default async function Page() {
  const u = await requireChatGPTUser("/workspace");
  return <Login name={u.displayName} />;
}
