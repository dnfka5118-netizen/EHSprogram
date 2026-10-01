"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFinding } from "../../../actions";
import { uploadPhotos, removePhotos } from "@/lib/upload";
import { Button, FormMessage } from "@/components/ui";
import { FindingFields, draftError, draftPayload, emptyDraft, type FindingDraft, type LocationWithSubs } from "../../../FindingFields";
import type { ActionState, Department, FindingType } from "@/lib/types";

// 이미 등록된 점검에 지적사항을 1건씩 추가
export function FindingForm({ inspectionId, backHref, locations, types, departments }: {
  inspectionId: string;
  backHref: string;
  locations: LocationWithSubs[];
  types: FindingType[];
  departments: Department[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>();
  const [draft, setDraft] = useState<FindingDraft>(() => emptyDraft());

  function submit(next: "continue" | "back") {
    setState(undefined);
    const err = draftError(draft);
    if (err) return setState({ error: err });

    startTransition(async () => {
      let paths: string[] = [];
      try {
        paths = await uploadPhotos(draft.key, "before", draft.photos);
      } catch (e) {
        return setState({ error: (e as Error).message });
      }
      const p = draftPayload(draft, paths);
      const result = await createFinding({
        id: p.id,
        inspectionId,
        locationId: p.location_id,
        subLocationId: p.sub_location_id || null,
        subLocationText: p.sub_location_text || null,
        typeId: p.type_id,
        problem: p.problem,
        departmentId: p.department_id,
        photos: paths,
      });
      if (result?.error) {
        await removePhotos(paths);
        return setState(result);
      }
      if (next === "back") {
        router.push(backHref);
        return;
      }
      // 같은 장소에서 연속 등록 : 장소·부서는 유지하고 나머지만 초기화
      setDraft((d) => emptyDraft(d));
      setState({ message: "등록되었습니다. 다음 지적사항을 입력하세요." });
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  return (
    <div className="space-y-4">
      <FormMessage state={state} />
      <FindingFields
        value={draft}
        onPatch={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        locations={locations}
        types={types}
        departments={departments}
      />
      <div className="flex flex-col gap-2 pt-2 sm:flex-row">
        <Button type="button" disabled={pending} onClick={() => submit("continue")} className="flex-1 py-2.5">
          {pending ? "저장 중…" : "저장 후 계속 등록"}
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => submit("back")} className="flex-1 py-2.5">
          저장 후 목록으로
        </Button>
      </div>
    </div>
  );
}
