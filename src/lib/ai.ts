import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getSetting } from "./db";

// Optional AI gift ideas. Every provider returns plain suggestions that are stored for
// review; nothing is ever added to a list automatically.

export type AiProvider = "none" | "anthropic" | "openai" | "gemini" | "meta" | "local";

export const PROVIDERS: { id: AiProvider; label: string; defaultModel: string; defaultBaseUrl?: string; needsKey: boolean }[] = [
  { id: "none", label: "Off", defaultModel: "", needsKey: false },
  { id: "anthropic", label: "Claude (Anthropic)", defaultModel: "claude-opus-5-5", needsKey: true },
  { id: "openai", label: "OpenAI", defaultModel: "gpt-5-mini", defaultBaseUrl: "https://api.openai.com/v1", needsKey: true },
  { id: "gemini", label: "Google Gemini", defaultModel: "gemini-2.5-flash", needsKey: true },
  { id: "meta", label: "Meta Llama API", defaultModel: "Llama-4-Maverick-17B-128E-Instruct-FP8", defaultBaseUrl: "https://api.llama.com/compat/v1", needsKey: true },
  { id: "local", label: "Local LLM (Ollama, LM Studio, any OpenAI-compatible)", defaultModel: "llama3.2", defaultBaseUrl: "http://ollama:11434/v1", needsKey: false },
];

export type AiConfig = { provider: AiProvider; model: string; apiKey: string; baseUrl: string };

export function aiConfig(): AiConfig {
  const provider = (getSetting("ai_provider") || process.env.AI_PROVIDER || "none") as AiProvider;
  const meta = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];
  return {
    provider: meta.id,
    model: getSetting("ai_model") || process.env.AI_MODEL || meta.defaultModel,
    apiKey: getSetting("ai_api_key") || process.env.AI_API_KEY || "",
    baseUrl: (getSetting("ai_base_url") || process.env.AI_BASE_URL || meta.defaultBaseUrl || "").replace(/\/$/, ""),
  };
}

export function aiEnabled(): boolean {
  const c = aiConfig();
  const meta = PROVIDERS.find((p) => p.id === c.provider)!;
  return c.provider !== "none" && (!meta.needsKey || !!c.apiKey);
}

export type Idea = { title: string; reason: string; est_price?: number };

export type IdeaContext = {
  listTitle: string;
  occasion: string;
  forName: string;
  age?: number;
  existing: string[];
  hint?: string;
};

function prompt(ctx: IdeaContext): string {
  return [
    `Suggest 6 gift ideas for ${ctx.forName}${ctx.age ? ` (age ${ctx.age})` : ""}.`,
    `Their wishlist is called "${ctx.listTitle}"${ctx.occasion ? ` for ${ctx.occasion}` : ""}.`,
    ctx.existing.length ? `Items already on the list:\n- ${ctx.existing.slice(0, 40).join("\n- ")}` : "The list is empty so far.",
    ctx.hint ? `Extra guidance from the user: ${ctx.hint}` : "",
    "Suggest things that fit their tastes but are not duplicates. Be specific (brand or product line when helpful).",
    'Reply with only JSON in this shape: {"ideas":[{"title":"...","reason":"one short sentence","est_price":25}]}',
  ]
    .filter(Boolean)
    .join("\n\n");
}

function parseIdeas(text: string): Idea[] {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("The AI reply wasn't in the expected format.");
  const data = JSON.parse(m[0]) as { ideas?: Idea[] };
  return (data.ideas ?? [])
    .filter((i) => i && typeof i.title === "string" && i.title.trim())
    .slice(0, 10)
    .map((i) => ({ title: i.title.trim().slice(0, 200), reason: String(i.reason ?? "").slice(0, 400), est_price: Number(i.est_price) || undefined }));
}

async function openAiCompatible(c: AiConfig, text: string): Promise<string> {
  const res = await fetch(`${c.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {}) },
    body: JSON.stringify({ model: c.model, messages: [{ role: "user", content: text }] }),
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

async function gemini(c: AiConfig, text: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": c.apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseMimeType: "application/json" } }),
    },
  );
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

async function claude(c: AiConfig, text: string): Promise<string> {
  const client = new Anthropic({ apiKey: c.apiKey });
  const response = await client.messages.create({
    model: c.model,
    max_tokens: 16000,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: text }],
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined this request.");
  return response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

export async function generateIdeas(ctx: IdeaContext): Promise<{ ideas: Idea[]; source: string }> {
  const c = aiConfig();
  const text = prompt(ctx);
  let reply: string;
  switch (c.provider) {
    case "anthropic":
      reply = await claude(c, text);
      break;
    case "gemini":
      reply = await gemini(c, text);
      break;
    case "openai":
    case "meta":
    case "local":
      reply = await openAiCompatible(c, text);
      break;
    default:
      throw new Error("AI suggestions are turned off. An admin can enable them in Admin settings.");
  }
  return { ideas: parseIdeas(reply), source: `${c.provider}:${c.model}` };
}
