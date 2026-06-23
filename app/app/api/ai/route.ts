// Server-side proxy for the Arken Insights API fallback (Path 2 of the hybrid AI).
//
// The Anthropic key MUST stay on the server — calling api.anthropic.com directly
// from the browser would leak it to every user. The client posts { input, context,
// history } here; we attach the key and forward to Anthropic. If ANTHROPIC_API_KEY
// isn't set, this returns 503 and the client shows its offline fallback message.
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";
const UPSTREAM_TIMEOUT_MS = 8000;

interface ChatMessage { role: "user" | "assistant"; content: string }
interface Body { input?: string; context?: string; history?: ChatMessage[] }

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI is not configured." }, { status: 503 });

  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const input = (body.input ?? "").trim();
  const context = body.context ?? "";
  if (!input || !context) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // Conversation history: last 4 pairs, trimmed to start on a user turn (Anthropic
  // requires the first message to be from the user).
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  while (history.length && history[0].role !== "user") history.shift();
  const messages = [...history, { role: "user" as const, content: input }];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1000, system: context, messages }),
      signal: controller.signal,
    });
    if (!r.ok) return NextResponse.json({ error: `Upstream ${r.status}` }, { status: 502 });
    const data = (await r.json()) as { content?: { text?: string }[] };
    const text = data.content?.[0]?.text ?? "No response received.";
    return NextResponse.json({ text });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return NextResponse.json({ error: aborted ? "timeout" : "fetch failed" }, { status: 504 });
  } finally {
    clearTimeout(timer);
  }
}
