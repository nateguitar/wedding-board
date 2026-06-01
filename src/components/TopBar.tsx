"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizeUrl } from "@/lib/link";
import type { Profile } from "@/lib/types";
import type { SaveStatus } from "@/components/Canvas";

export default function TopBar({
  boardId,
  title,
  saveStatus,
  members,
  userId,
  search,
  onSearch,
  onUpload,
  onAddLink,
}: {
  boardId: string;
  title: string;
  saveStatus: SaveStatus;
  members: Profile[];
  userId: string;
  search: string;
  onSearch: (value: string) => void;
  onUpload: () => void;
  onAddLink: (url: string) => void;
}) {
  const supabase = createClient();
  const [shareOpen, setShareOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkErr, setLinkErr] = useState<string | null>(null);

  void userId;

  function submitLink(e: React.FormEvent) {
    e.preventDefault();
    const url = normalizeUrl(linkUrl);
    if (!url) {
      setLinkErr("That doesn't look like a link.");
      return;
    }
    onAddLink(url);
    setLinkUrl("");
    setLinkErr(null);
    setLinkOpen(false);
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setShareMsg(null);
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();
    if (!profile) {
      setShareMsg("No account with that email yet — ask them to sign up first.");
      return;
    }
    const { error } = await supabase
      .from("board_members")
      .insert({ board_id: boardId, user_id: profile.id });
    setShareMsg(error ? error.message : "Added! They'll see the board on refresh.");
    if (!error) setEmail("");
  }

  const saveLabel =
    saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : "—";

  return (
    <header className="z-10 flex items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
      <h1 className="shrink-0 truncate text-sm font-medium">{title}</h1>
      <span className="shrink-0 text-xs text-muted">{saveLabel}</span>

      <div className="mx-2 max-w-md flex-1">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search items & links…"
          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setLinkOpen((v) => !v)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:text-foreground"
          >
            Add link
          </button>
          {linkOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-border bg-surface p-3 shadow-lg">
              <p className="mb-2 text-xs text-muted">
                Paste a link (Etsy, Pinterest, a shop, an article…). We&apos;ll grab a preview.
              </p>
              <form onSubmit={submitLink} className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://…"
                  className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                />
                <button type="submit" className="rounded-lg bg-accent px-3 text-sm font-medium text-white">
                  Add
                </button>
              </form>
              {linkErr && <p className="mt-2 text-xs text-accent">{linkErr}</p>}
              <p className="mt-2 text-[11px] text-muted">
                Tip: you can also paste a link straight onto the canvas.
              </p>
            </div>
          )}
        </div>

        <button
          onClick={onUpload}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          Upload
        </button>

        <div className="relative">
          <button
            onClick={() => setShareOpen((v) => !v)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:text-foreground"
          >
            Share
          </button>
          {shareOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-border bg-surface p-3 shadow-lg">
              <p className="mb-2 text-xs text-muted">
                Invite by email (they must have an account).
              </p>
              <form onSubmit={invite} className="flex gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="partner@email.com"
                  className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                />
                <button type="submit" className="rounded-lg bg-accent px-3 text-sm font-medium text-white">
                  Add
                </button>
              </form>
              {shareMsg && <p className="mt-2 text-xs text-muted">{shareMsg}</p>}
              <div className="mt-3 border-t border-border pt-2">
                <p className="mb-1 text-xs text-muted">Members</p>
                {members.map((m) => (
                  <p key={m.id} className="text-xs">
                    {m.display_name}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
