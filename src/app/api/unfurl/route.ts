import { NextResponse } from "next/server";

// Server-side OpenGraph fetcher. Reads a page's <meta> tags so the client can
// build a link "card" without hitting CORS. Best-effort: many sites
// (Instagram, Pinterest) hide OG behind login — we degrade to a bare URL card.

export const runtime = "nodejs";

type Unfurled = {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
};

function metaContent(html: string, names: string[]): string {
  for (const name of names) {
    // property="og:image" content="..."  OR  content="..." property="og:image"
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`,
        "i"
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`,
        "i"
      ),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) return decodeEntities(m[1].trim());
    }
  }
  return "";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function absolutize(maybeRelative: string, base: string): string {
  if (!maybeRelative) return "";
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

export async function POST(req: Request) {
  let target: string;
  try {
    const body = (await req.json()) as { url?: string };
    target = (body.url ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Unsupported protocol" }, { status: 400 });
  }

  const fallback: Unfurled = {
    url: target,
    title: parsed.hostname.replace(/^www\./, ""),
    description: "",
    image: "",
    siteName: parsed.hostname.replace(/^www\./, ""),
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(target, {
      headers: {
        // A browser-ish UA coaxes OG tags out of more sites.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.includes("text/html")) {
      return NextResponse.json(fallback);
    }

    // Only need the <head>; cap the read so huge pages don't blow memory.
    const full = await res.text();
    const html = full.slice(0, 600_000);

    const title =
      metaContent(html, ["og:title", "twitter:title"]) ||
      decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "") ||
      fallback.title;
    const image = absolutize(
      metaContent(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]),
      res.url || target
    );
    const description = metaContent(html, ["og:description", "twitter:description", "description"]);
    const siteName = metaContent(html, ["og:site_name"]) || fallback.siteName;

    return NextResponse.json({ url: target, title, description, image, siteName });
  } catch {
    return NextResponse.json(fallback);
  }
}
