import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import BoardClient from "@/components/BoardClient";
import type { Board, Profile } from "@/lib/types";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: board } = await supabase
    .from("boards")
    .select("id, title, created_by, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (!board) notFound(); // RLS hides boards you're not a member of

  const { data: memberRows } = await supabase
    .from("board_members")
    .select("user_id")
    .eq("board_id", id);

  const memberIds = (memberRows ?? []).map((m) => m.user_id);

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", memberIds.length ? memberIds : [user.id]);

  const { data: snapshotRow } = await supabase
    .from("board_snapshots")
    .select("snapshot_json")
    .eq("board_id", id)
    .maybeSingle();

  return (
    <BoardClient
      board={board as Board}
      userId={user.id}
      members={(profiles as Profile[]) ?? []}
      initialSnapshot={snapshotRow?.snapshot_json ?? null}
    />
  );
}
