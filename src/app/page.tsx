import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import BoardList from "@/components/BoardList";
import type { Board } from "@/lib/types";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", user.id)
    .single();

  const { data: boards } = await supabase
    .from("boards")
    .select("id, title, created_by, created_at, updated_at")
    .order("updated_at", { ascending: false });

  const displayName = profile?.display_name || user.email?.split("@")[0] || "you";

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your boards</h1>
          <p className="mt-1 text-sm text-muted">Signed in as {displayName}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted transition hover:text-foreground"
          >
            Sign out
          </button>
        </form>
      </header>

      <BoardList initialBoards={(boards as Board[]) ?? []} userId={user.id} />
    </main>
  );
}
