import type { SupabaseClient } from "@supabase/supabase-js";
import type { TLAsset, TLAssetStore } from "tldraw";

// We store a private storage path inside each asset's `src`, prefixed so we can
// tell our managed assets apart from ordinary URLs / data URLs. On display we
// mint a short-lived signed URL and cache it until shortly before it expires.
//
// Must use the `asset:` scheme: tldraw's asset-src validator only accepts
// http/https/data/asset protocols, and `asset:` is the one reserved for custom
// asset stores (it's routed straight to our resolve() below).
export const SUPABASE_SRC_PREFIX = "asset:";

// Legacy prefix used before the asset: scheme fix. Still present in any
// snapshots saved before that change — we must keep resolving them.
const LEGACY_PREFIX = "supabase://";

const BUCKET = "uploads";
const SIGNED_TTL_SECONDS = 60 * 60; // 1 hour
const CACHE_MARGIN_MS = 5 * 60 * 1000; // refresh 5 min early

export function toSupabaseSrc(storagePath: string) {
  return `${SUPABASE_SRC_PREFIX}${storagePath}`;
}

export function isSupabaseSrc(src: string | null | undefined): src is string {
  return !!src && (src.startsWith(SUPABASE_SRC_PREFIX) || src.startsWith(LEGACY_PREFIX));
}

export function pathFromSrc(src: string) {
  if (src.startsWith(LEGACY_PREFIX)) return src.slice(LEGACY_PREFIX.length);
  return src.slice(SUPABASE_SRC_PREFIX.length);
}

export function createAssetStore(supabase: SupabaseClient): TLAssetStore {
  const cache = new Map<string, { url: string; expiresAt: number }>();

  async function sign(path: string): Promise<string | null> {
    const cached = cache.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.url;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_TTL_SECONDS);
    if (error || !data) return null;

    cache.set(path, {
      url: data.signedUrl,
      expiresAt: Date.now() + SIGNED_TTL_SECONDS * 1000 - CACHE_MARGIN_MS,
    });
    return data.signedUrl;
  }

  return {
    // Fallback path: if tldraw itself uploads an asset (e.g. paste), stash it in
    // storage under a loose prefix so it still renders. Reviewable uploads go
    // through our own drop handler instead.
    async upload(asset: TLAsset, file: File) {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const path = `pasted/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file);
      if (error) throw error;
      return { src: toSupabaseSrc(path) };
    },

    async resolve(asset: TLAsset) {
      const src = asset.props.src as string | undefined;
      if (!src) return null;
      if (isSupabaseSrc(src)) return await sign(pathFromSrc(src));
      return src; // ordinary URL / data URL
    },
  };
}
