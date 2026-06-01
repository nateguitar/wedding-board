"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Todo } from "@/lib/types";
import type { BoardItem } from "@/lib/use-board-items";

const AVATAR_COLORS = ["#c0705f", "#5f8fc0", "#6fae6f", "#b07fc0", "#d09a3c", "#3fae9f"];
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// Tracks who is currently viewing the board via Supabase Realtime presence.
function useOnlineMembers(boardId: string, userId: string, userName: string) {
  const supabase = useMemo(() => createClient(), []);
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    const channel = supabase.channel(`presence-${boardId}`, {
      config: { presence: { key: userId } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name: userName, at: Date.now() });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [boardId, userId, userName, supabase]);

  return online;
}

// Per-board planning checklist, kept in sync via realtime.
function useTodos(boardId: string, userId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [todos, setTodos] = useState<Todo[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("todos")
        .select("*")
        .eq("board_id", boardId)
        .order("created_at");
      if (!cancelled) setTodos((data as Todo[]) ?? []);
    }
    load();
    const channel = supabase
      .channel(`todos-${boardId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "todos", filter: `board_id=eq.${boardId}` }, load)
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [boardId, supabase]);

  async function add(body: string) {
    const text = body.trim();
    if (!text) return;
    await supabase.from("todos").insert({ board_id: boardId, body: text, created_by: userId });
  }
  async function toggle(t: Todo) {
    setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await supabase.from("todos").update({ done: !t.done }).eq("id", t.id);
  }
  async function remove(t: Todo) {
    setTodos((prev) => prev.filter((x) => x.id !== t.id));
    await supabase.from("todos").delete().eq("id", t.id);
  }

  return { todos, add, toggle, remove };
}

export default function RightSidebar({
  boardId,
  userId,
  userName,
  members,
  items,
  onJump,
}: {
  boardId: string;
  userId: string;
  userName: string;
  members: Profile[];
  items: BoardItem[];
  onJump: (shapeId: string) => void;
}) {
  const online = useOnlineMembers(boardId, userId, userName);
  const { todos, add, toggle, remove } = useTodos(boardId, userId);
  const [draft, setDraft] = useState("");
  const links = items.filter((i) => i.kind === "link");
  const ordered = [...members].sort((a) => (a.id === userId ? -1 : 1));

  function submitTodo(e: React.FormEvent) {
    e.preventDefault();
    add(draft);
    setDraft("");
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col overflow-y-auto border-l border-border bg-surface">
      {/* Members */}
      <section className="border-b border-border px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Members
          </h3>
          <span className="text-[11px] text-muted">{online.size} online</span>
        </div>
        <ul className="space-y-2">
          {ordered.map((m) => {
            const isOnline = online.has(m.id);
            return (
              <li key={m.id} className="flex items-center gap-2.5">
                <span className="relative">
                  <span
                    className="grid h-8 w-8 place-items-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: colorFor(m.id) }}
                  >
                    {(m.display_name || "?").charAt(0).toUpperCase()}
                  </span>
                  <span
                    className={[
                      "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface",
                      isOnline ? "bg-green-500" : "bg-border",
                    ].join(" ")}
                    title={isOnline ? "Online" : "Offline"}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {m.display_name}
                    {m.id === userId && <span className="text-muted"> (you)</span>}
                  </span>
                  <span className="block truncate text-[11px] text-muted">{m.email}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* To-dos */}
      <section className="border-b border-border px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            To-dos
          </h3>
          <span className="text-[11px] text-muted">
            {todos.filter((t) => !t.done).length} open
          </span>
        </div>

        <form onSubmit={submitTodo} className="mb-2 flex gap-1.5">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a task…"
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="shrink-0 rounded-lg bg-accent px-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            +
          </button>
        </form>

        {todos.length === 0 ? (
          <p className="text-xs text-muted">No to-dos yet.</p>
        ) : (
          <ul className="space-y-1">
            {todos.map((t) => (
              <li key={t.id} className="group flex items-center gap-2">
                <button
                  onClick={() => toggle(t)}
                  className={[
                    "grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] transition",
                    t.done ? "border-accent bg-accent text-white" : "border-border",
                  ].join(" ")}
                  aria-label={t.done ? "Mark not done" : "Mark done"}
                >
                  {t.done ? "✓" : ""}
                </button>
                <span
                  className={[
                    "min-w-0 flex-1 truncate text-sm",
                    t.done ? "text-muted line-through" : "",
                  ].join(" ")}
                  title={t.body}
                >
                  {t.body}
                </span>
                <button
                  onClick={() => remove(t)}
                  className="shrink-0 text-xs text-muted opacity-0 transition hover:text-accent group-hover:opacity-100"
                  aria-label="Delete to-do"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Saved links */}
      <section className="px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Saved links
          </h3>
          <span className="text-[11px] text-muted">{links.length}</span>
        </div>
        {links.length === 0 ? (
          <p className="text-xs text-muted">
            No links yet. Use <span className="font-medium">Add link</span> in the top bar.
          </p>
        ) : (
          <ul className="space-y-2">
            {links.map((ln) => (
              <li
                key={ln.shapeId}
                className="flex items-center gap-2 rounded-lg border border-border bg-background p-2"
              >
                <button onClick={() => onJump(ln.shapeId)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded border border-border bg-surface">
                    {ln.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ln.thumb} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs">🔗</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{ln.title}</span>
                    <span className="block truncate text-[10px] text-muted">{ln.subtitle}</span>
                  </span>
                </button>
                {ln.url && (
                  <a
                    href={ln.url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-muted transition hover:text-accent"
                    title="Open link"
                  >
                    ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
