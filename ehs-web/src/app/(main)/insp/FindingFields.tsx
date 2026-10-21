"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SimilarSuggestions } from "./SimilarSuggestions";
import { VoiceButton } from "@/components/VoiceButton";
import { PhotoPicker } from "@/components/PhotoPicker";
import type { ProcessedPhoto } from "@/lib/image";
import { Field, Input, Select, Textarea } from "@/components/ui";
import type { Department, FindingType, Location, SubLocation } from "@/lib/types";
import { AUTO_SHARE, suggestTypes, type TypeSuggestion } from "@/lib/type-suggest";

export const DIRECT = "__direct__";

export type LocationWithSubs = Location & { sub_locations: SubLocation[] };

// 지적사항 1건 입력값
export type FindingDraft = {
  key: string; // 화면용 구분값 = 저장 시 지적사항 ID (사진 경로 {ID}/ 로 사용)
  locationId: string;
  subId: string;
  subText: string;
  typeId: string;
  typeAuto?: boolean; // 유형을 문제점 추천으로 자동 선택했는지 (직접 고르면 false → 더는 바꾸지 않음)
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

// 현장 순서 : 사진 촬영 → (고정 정보) → 장소 → 세부장소 → 문제점 → 유형(문제점으로 추천) → 조치 요청 부서
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
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  });
  const [sugg, setSugg] = useState<{ text: string; items: TypeSuggestion[] }>({ text: "", items: [] });

  // 문제점을 쓰면 (잠깐 멈췄을 때) 과거 기록으로 유형 추천 → 확신이 높고 직접 고른 적 없으면 자동 선택
  useEffect(() => {
    const text = value.problem;
    const timer = setTimeout(() => {
      suggestTypes(text, types)
        .then((items) => {
          setSugg({ text, items });
          const best = items[0];
          const cur = latest.current;
          if (cur.problem !== text) return;
          if ((!cur.typeId || cur.typeAuto) && best && best.share >= AUTO_SHARE && best.typeId !== cur.typeId) {
            set({ typeId: best.typeId, typeAuto: true });
          }
        })
        .catch(() => setSugg({ text, items: [] }));
    }, 500);
    return () => clearTimeout(timer);
    // 문제점이 바뀔 때만 다시 계산
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.problem]);
  const shown = value.problem.trim() && sugg.text === value.problem ? sugg.items : [];
  const rank = (id: string) => shown.findIndex((x) => x.typeId === id);

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

      <SimilarSuggestions
        photo={value.photos[0]?.main ?? null}
        location={locations.find((l) => l.id === value.locationId)?.name}
        types={types}
        onPick={(p) => set({ problem: p.problem, ...(p.typeId ? { typeId: p.typeId, typeAuto: false } : {}) })}
      />

      <div className="relative">
        {/* 말로 입력 : 받아쓴 글은 이미 적은 내용 뒤에 이어 붙음 */}
        <VoiceButton className="absolute top-0 right-0 z-10" value={value.problem} onChange={(problem) => set({ problem })} />
        <Field label="문제점" required>
          <Textarea rows={3} value={value.problem} onChange={(e) => set({ problem: e.target.value })} placeholder="발견된 문제점과 개선 필요사항 (🎤 말로 입력 가능)" />
        </Field>
      </div>

      <Field label="유형" required>
        {shown.length > 0 && (
          <p className="mb-2 text-xs text-gray-500">
            문제점으로 추천 : {shown.map((x, i) => (
              <span key={x.typeId} className={i === 0 ? "font-semibold text-brand-800" : ""}>{i > 0 && " · "}{x.name}</span>
            ))}
            {value.typeAuto && <span className="ml-1 text-brand-700">(자동 선택됨 — 다르면 눌러서 바꾸세요)</span>}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {types.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => set({ typeId: t.id, typeAuto: false })}
              className={`rounded-full border px-3 py-1.5 text-sm ${
                value.typeId === t.id
                  ? "border-brand-800 bg-brand-800 text-white"
                  : rank(t.id) >= 0
                    ? "border-brand-500 border-dashed bg-brand-50 text-brand-800"
                    : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              {rank(t.id) === 0 && value.typeId !== t.id && "★ "}{t.name}
            </button>
          ))}
        </div>
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
