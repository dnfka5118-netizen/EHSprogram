import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui";
import type { SuggestionDetail } from "@/lib/suggestion";
import { SuggestionForm } from "../../SuggestionForm";

export default async function EditSuggestionPage({ params }: PageProps<"/suggestions/[id]/edit">) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_suggestion", { p_id: id });
  const s = data as SuggestionDetail | null;
  if (!s) notFound();
  if (!s.can_edit) redirect(`/suggestions/${id}`);
  const urls = s.photos.length ? ((await supabase.storage.from("docs").createSignedUrls(s.photos, 3600)).data ?? []) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="의견 수정" crumbs={[{ label: "공통" }, { label: "개선 의견", href: "/suggestions" }, { label: `#${s.no} 수정` }]} />
      <Card>
        <SuggestionForm
          initial={{
            id: s.id,
            category: s.category,
            title: s.title,
            body: s.body,
            anonymous: s.anonymous,
            photos: s.photos.map((path, i) => ({ path, url: urls[i]?.signedUrl ?? null })),
          }}
        />
      </Card>
    </div>
  );
}
