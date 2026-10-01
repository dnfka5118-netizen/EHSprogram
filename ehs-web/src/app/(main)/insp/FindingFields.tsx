"use client";

import type { ReactNode } from "react";
import { PhotoPicker } from "@/components/PhotoPicker";
import type { ProcessedPhoto } from "@/lib/image";
import { Field, Input, Select, Textarea } from "@/components/ui";
import type { Department, FindingType, Location, SubLocation } from "@/lib/types";

export const DIRECT = "__direct__";

export type LocationWithSubs = Location & { sub_locations: SubLocation[] };

// 지적사항 1건 입력값
export type FindingDraft = {
  key: string; // 화면용 구분값 = 저장 시 지적사항 ID (사진 경로 {ID}/ 로 사용)
  locationId: string;
  subId: string;
  subText: string;
  typeId: string;
  problem: string;
  deptId: string;
  photos: ProcessedPhoto[];
};

export const emptyDraft = (keep?: Pick<FindingDraft, "locationId" | "subId" | "subText" | "deptId">): FindingDraft => ({
  key: crypto.randomUUID(),
  locationId: keep?.locationId ?? "",
  subId: keep?.subId ?? "",
  subText: keep?.subText ?? "",
  typeId: "",
  problem: "",
  deptId: keep?.deptId ?? "",
  photos: [],
});

export function draftError(d: FindingDraft): string | null {
  if (!d.locationId) return "장소를 선택해 주세요.";
  if (!d.typeId) return "유형을 선택해 주세요.";
  if (!d.problem.trim()) return "문제점을 입력해 주세요.";
  if (!d.deptId) return "조치 요청 부서를 선택해 주세요.";
  if (d.photos.length === 0) return "개선 전 사진을 1장 이상 등록해 주세요.";
  return null;
}

// DB 함수(create_finding / create_inspection_with_findings)에 넘길 형태
export const draftPayload = (d: FindingDraft, photos: string[]) => ({
  id: d.key,
  location_id: d.locationId,
  sub_location_id: d.subId && d.subId !== DIRECT ? d.subId : "",
  sub_location_text: d.subId === DIRECT ? d.subText : "",
  type_id: d.typeId,
  problem: d.problem,
  department_id: d.deptId,
  photos,
});

// onPatch 는 바뀐 항목만 넘긴다 (사진 변환 중 다른 칸을 입력해도 덮어쓰지 않도록 부모가 최신 값에 합침)
export type FindingPayload = ReturnType<typeof draftPayload>;

// 현장 순서 : 사진 촬영 → (고정 정보) → 장소 → 세부장소 → 유형 → 문제점 → 조치 요청 부서
export function FindingFields({ value, onPatch, locations, types, departments, fixed }: {
  fixed?: ReactNode; // 사진 바로 아래에 보여 줄 고정 정보 (사업장·점검일·점검자)
  value: FindingDraft;
  onPatch: (patch: Partial<FindingDraft>) => void;
  locations: LocationWithSubs[];
  types: FindingType[];
  departments: Department[];
}) {
  const set = onPatch;
  const subs = locations.find((l) => l.id === value.locationId)?.sub_locations ?? [];

  return (
    <div className="space-y-4">
      <Field label="개선 전 사진" required>
        <PhotoPicker photos={value.photos} onChange={(photos) => set({ photos })} />
      </Field>

      {fixed}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="장소" required>
          <Select value={value.locationId} onChange={(e) => set({ locationId: e.target.value, subId: "" })}>
            <option value="">선택</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="세부장소">
          <Select value={value.subId} onChange={(e) => set({ subId: e.target.value })} disabled={!value.locationId}>
            <option value="">{subs.length ? "선택" : "없음"}</option>
            {subs.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
            <option value={DIRECT}>직접 입력</option>
          </Select>
          {value.subId === DIRECT && (
            <Input className="mt-2" value={value.subText} onChange={(e) => set({ subText: e.target.value })} placeholder="세부장소 입력" />
          )}
        </Field>
      </div>

      <Field label="유형" required>
        <div className="flex flex-wrap gap-2">
          {types.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => set({ typeId: t.id })}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                value.typeId === t.id ? "border-brand-800 bg-brand-800 text-white" : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </Field>

      <Field label="문제점" required>
        <Textarea rows={3} value={value.problem} onChange={(e) => set({ problem: e.target.value })} placeholder="발견된 문제점과 개선 필요사항" />
      </Field>

      <Field label="조치 요청 부서" required>
        <Select value={value.deptId} onChange={(e) => set({ deptId: e.target.value })}>
          <option value="">선택</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
