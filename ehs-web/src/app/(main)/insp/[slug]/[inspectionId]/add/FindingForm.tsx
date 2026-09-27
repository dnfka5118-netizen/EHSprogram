"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFinding } from "../../../actions";
import { uploadPhotos, removePhotos } from "@/lib/upload";
import { PhotoPicker } from "@/components/PhotoPicker";
import type { ProcessedPhoto } from "@/lib/image";
import { Button, Field, FormMessage, Input, Select, Textarea } from "@/components/ui";
import type { ActionState, Department, FindingType, Location, SubLocation } from "@/lib/types";

const DIRECT = "__direct__";

export function FindingForm({ inspectionId, backHref, locations, types, departments }: {
  inspectionId: string;
  backHref: string;
  locations: (Location & { sub_locations: SubLocation[] })[];
  types: FindingType[];
  departments: Department[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>();

  const [locationId, setLocationId] = useState("");
  const [subId, setSubId] = useState("");
  const [subText, setSubText] = useState("");
  const [typeId, setTypeId] = useState("");
  const [problem, setProblem] = useState("");
  const [deptId, setDeptId] = useState("");
  const [photos, setPhotos] = useState<ProcessedPhoto[]>([]);

  const subs = locations.find((l) => l.id === locationId)?.sub_locations ?? [];

  function submit(next: "continue" | "back") {
    setState(undefined);
    if (!locationId) return setState({ error: "장소를 선택해 주세요." });
    if (!typeId) return setState({ error: "유형을 선택해 주세요." });
    if (!problem.trim()) return setState({ error: "문제점을 입력해 주세요." });
    if (!deptId) return setState({ error: "조치 요청 부서를 선택해 주세요." });
    if (photos.length === 0) return setState({ error: "개선 전 사진을 1장 이상 등록해 주세요." });

    startTransition(async () => {
      const id = crypto.randomUUID();
      let paths: string[] = [];
      try {
        paths = await uploadPhotos(id, "before", photos);
      } catch (e) {
        return setState({ error: (e as Error).message });
      }
      const result = await createFinding({
        id,
        inspectionId,
        locationId,
        subLocationId: subId && subId !== DIRECT ? subId : null,
        subLocationText: subId === DIRECT ? subText : null,
        typeId,
        problem,
        departmentId: deptId,
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
      setProblem("");
      setPhotos([]);
      setTypeId("");
      setState({ message: "등록되었습니다. 다음 지적사항을 입력하세요." });
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  return (
    <div className="space-y-4">
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="장소" required>
          <Select value={locationId} onChange={(e) => { setLocationId(e.target.value); setSubId(""); }}>
            <option value="">선택</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="세부장소">
          <Select value={subId} onChange={(e) => setSubId(e.target.value)} disabled={!locationId}>
            <option value="">{subs.length ? "선택" : "없음"}</option>
            {subs.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
            <option value={DIRECT}>직접 입력</option>
          </Select>
          {subId === DIRECT && (
            <Input className="mt-2" value={subText} onChange={(e) => setSubText(e.target.value)} placeholder="세부장소 입력" />
          )}
        </Field>
      </div>

      <Field label="유형" required>
        <div className="flex flex-wrap gap-2">
          {types.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTypeId(t.id)}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                typeId === t.id ? "border-emerald-800 bg-emerald-800 text-white" : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </Field>

      <Field label="문제점" required>
        <Textarea rows={4} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="발견된 문제점과 개선 필요사항" />
      </Field>

      <Field label="개선 전 사진" required>
        <PhotoPicker photos={photos} onChange={setPhotos} />
      </Field>

      <Field label="조치 요청 부서" required>
        <Select value={deptId} onChange={(e) => setDeptId(e.target.value)}>
          <option value="">선택</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
      </Field>

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
