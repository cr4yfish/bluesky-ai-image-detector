import { NextResponse } from "next/server";
import { runMainBotFeature } from "../../../../functions/bsky";

export async function GET(req: Request) {
    if(process.env.NODE_ENV == "production" && req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET!}`) {
        return NextResponse.json({ ok: false })
    }

    await runMainBotFeature();

    return NextResponse.json({ ok: true })
}