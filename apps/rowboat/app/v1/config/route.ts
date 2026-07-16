import { NextResponse } from "next/server";

// Unauthenticated public config consumed by the Divinity desktop app.
// The desktop fetches GET /v1/config (no auth) and expects:
//   { appUrl, websocketApiUrl, supabaseUrl, billing }
// This replaces the original Rowboat/Supabase-shaped config. `supabaseUrl` is
// retained only for schema compatibility; the desktop now authenticates against
// our Auth0 tenant directly and no longer derives its OAuth issuer from here.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    appUrl: process.env.APP_PUBLIC_URL || "https://api.divinityworks.ai",
    websocketApiUrl: process.env.WEBSOCKET_API_URL || "",
    supabaseUrl: process.env.AUTH0_ISSUER_BASE_URL || "",
    billing: { plans: [] },
  });
}
