"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { describeError } from "@/lib/errors";
import type { Board } from "@/lib/types";

export default function BoardList({
  initialBoards,
  userId,
}: {
  initialBoards: Board[];
  userId: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [boards, setBoards] = useState<Board[]>(initialBoards);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createBoard(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data: board, error: bErr } = await supabase
        .from("boards")
        .insert({ title: title.trim() || "Untitled board", created_by: userId })
        .select("id, title, created_by, created_at, updated_at")
        .single();
      if (bErr) throw bErr;

      const { error: mErr } = await supabase
        .from("board_members")
        .insert({ board_id: board!.id, user_id: userId });
      if (mErr) throw mErr;

      setBoards((b) => [board as Board, ...b]);
      setTitle("");
      router.push(`/board/${board!.id}`);
    } catch (err) {
      console.error("createBoard failed", err);
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={createBoard}
        className="mb-8 flex gap-2 rounded-2xl border border-border bg-surface p-3"
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New board title…"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          Create
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-accent">{error}</p>}

      {boards.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-surface/50 p-10 text-center text-sm text-muted">
          No boards yet. Create your first one above.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {boards.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => router.push(`/board/${b.id}`)}
                className="group flex w-full flex-col items-start rounded-2xl border border-border bg-surface p-5 text-left transition hover:border-accent"
              >
                <span className="text-base font-medium group-hover:text-accent">
                  {b.title}
                </span>
                <span className="mt-1 text-xs text-muted">
                  Updated {new Date(b.updated_at).toLocaleDateString()}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
