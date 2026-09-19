import Workspace from "../../workspace";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requireChatGPTUser("/workspace/demo");
  return <Workspace />;
}
