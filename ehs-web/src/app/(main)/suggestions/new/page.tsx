import { requireProfile } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui";
import { SuggestionForm } from "../SuggestionForm";

export default async function NewSuggestionPage() {
  await requireProfile();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="의견 쓰기" crumbs={[{ label: "공통" }, { label: "개선 의견", href: "/suggestions" }, { label: "의견 쓰기" }]} />
      <Card>
        <SuggestionForm />
      </Card>
    </div>
  );
}
