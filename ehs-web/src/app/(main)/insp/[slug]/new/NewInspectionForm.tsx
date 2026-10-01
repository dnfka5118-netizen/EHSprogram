"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerFinding } from "../../actions";
import { uploadPhotos, removePhotos } from "@/lib/upload";
import { fmtDate } from "@/lib/format";
import { Button, FormMessage } from "@/components/ui";
import { FindingFields, draftError, draftPayload, emptyDraft, type FindingDraft, type LocationWithSubs } from "../../FindingFields";
import type { ActionState, Department, FindingType } from "@/lib/types";
import { ParticipantPicker, type Person } from "./ParticipantPicker";

// 점검 등록 = 지적사항 1건 등록. 사업장·점검일·점검자는 고정, 점검 회차는 DB 가 자동으로 묶음
export function NewInspectionForm({ slug, moduleCode, siteName, today, inspector, people, locations, types, departments }: {
  slug: string;
  moduleCode: string;
  siteName: string;
  today: string;
  inspector: string;
  people: Person[];
  locations: LocationWithSubs[];
  types: FindingType[];
  departments: Department[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>();
  const [draft, setDraft] = useState<FindingDraft>(() => emptyDraft());
  const [count, setCount] = useState(0);
  const [inspectors, setInspectors] = useState("");
  const [pickerKey, setPickerKey] = useState(0);

  function submit(next: "continue" | "done") {
    setState(undefined);
    const err = draftError(draft);
    if (err) return setState({ error: err });

    start(async () => {
      let paths: string[] = [];
      try {
        paths = await uploadPhotos(draft.key, "before", draft.photos);
      } catch (e) {
        return setState({ error: (e as Error).message });
      }
      const result = await registerFinding(moduleCode, inspectors, draftPayload(draft, paths));
      if ("error" in result) {
        await removePhotos(paths);
        return setState({ error: result.error });
      }
      if (next === "done") {
        router.push(`/insp/${slug}`);
        return;
      }
      // 같은 곳에서 이어서 점검 : 장소·세부장소·부서는 그대로, 사진·유형·문제점만 비움 (참여자는 이미 회차에 저장됨)
      setDraft((d) => emptyDraft(d));
      setInspectors("");
      setPickerKey((k) => k + 1);
      setCount((c) => c + 1);
      setState({ message: `등록되었습니다 (오늘 ${count + 1}건). 다음 지적사항의 사진을 찍어 주세요.` });
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const fixed = (
    <dl className="grid grid-cols-3 gap-2 rounded-md bg-gray-50 p-3 text-sm">
      <Fixed label="사업장" value={siteName} />
      <Fixed label="점검일" value={fmtDate(today)} />
      <Fixed label="점검자" value={inspector} />
    </dl>
  );

  return (
    <div className="space-y-4">
      <FormMessage state={state} />
      <FindingFields
        value={draft}
        onPatch={(p) => setDraft((d) => ({ ...d, ...p }))}
        fixed={fixed}
        locations={locations}
        types={types}
        departments={departments}
      />

      <details className="rounded-md border border-gray-200 px-3 py-2">
        <summary className="cursor-pointer text-sm text-gray-700">
          점검 참여자 <span className="text-xs text-gray-500">(선택 · 함께 점검한 사람, 오늘 회차에 한 번만 넣으면 됩니다)</span>
        </summary>
        <div className="pt-3">
          <ParticipantPicker key={pickerKey} people={people} onChange={setInspectors} />
        </div>
      </details>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:flex-row lg:-mx-6 lg:px-6">
        <Button type="button" disabled={pending} onClick={() => submit("continue")} className="flex-1 py-3 text-base">
          {pending ? "저장 중…" : "등록하고 다음 지적사항"}
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => submit("done")} className="flex-1 py-3 text-base">
          등록하고 마치기
        </Button>
      </div>
    </div>
  );
}

function Fixed({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="truncate font-medium text-gray-900">{value || "-"}</dd>
    </div>
  );
}
