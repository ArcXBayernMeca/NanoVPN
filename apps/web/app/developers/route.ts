import { permanentRedirect } from "next/navigation";
export const dynamic = "force-static";
export function GET() { permanentRedirect("/use-with-agent"); }
