import { NextResponse } from "next/server";
import { runMainBotFeature } from "../../../../functions/bsky";

export async function GET(req: Request) {
    if(req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET!}`) {
        return NextResponse.error()
    }

    await runMainBotFeature();

    return NextResponse.json({ ok: true })
}