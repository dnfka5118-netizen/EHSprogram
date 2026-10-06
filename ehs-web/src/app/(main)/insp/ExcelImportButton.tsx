"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { readImportFile, type ImportRow } from "@/lib/excel-import";
import { processPhoto } from "@/lib/image";
import { uploadPhotos, removePhotos } from "@/lib/upload";
import { finishImport, importFinding } from "./actions";
import type { LocationWithSubs } from "./FindingFields";
import type { Department, FindingType } from "@/lib/types";

const key = (s: string) => s.replace(/\s+/g, "").toLowerCase();

type Checked = ImportRow & {
  locationId?: string;
  subId?: string;
  typeId?: string;
  deptId?: string;
  error?: string; // 등록할 수 없는 이유 (여러 개면 " · " 로 이어 붙임)
  skip?: boolean; // 이미 프로그램에 있는 건 (다운로드한 엑셀의 기존 행) → 건너뜀
  result?: "done" | "dup" | "fail";
  message?: string;
};

// 인터넷이 안 될 때 엑셀(프로그램 다운로드 양식)에 적어 둔 지적사항을 한 번에 등록
export function ExcelImportButton({ moduleCode, moduleName, locations, types, departments, today }: {
  moduleCode: string;
  moduleName: string;
  locations: LocationWithSubs[];
  types: FindingType[];
  departments: Department[];
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Checked[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [finished, setFinished] = useState(false);
  const [dragging, setDragging] = useState(false);

  // 정합성 검사 : 행마다 모든 문제를 모아서 보여 줌 (한 행이라도 있으면 등록하지 않음)
  const check = (r: ImportRow): Checked => {
    if (r.existingId) return { ...r, skip: true };
    const loc = locations.find((l) => key(l.name) === key(r.location));
    const sub = loc?.sub_locations.find((s) => key(s.name) === key(r.sub));
    const type = types.find((t) => key(t.name) === key(r.type));
    const dept = departments.find((d) => key(d.name) === key(r.department));
    const minDate = new Date(Date.parse(today) - 366 * 86400000).toISOString().slice(0, 10);
    const errs: string[] = [];
    if (r.dateError) errs.push(`시행일 : ${r.dateError}`);
    else if (r.date && r.date > today) errs.push(`시행일 ${r.date} 이 오늘 이후입니다`);
    else if (r.date && r.date < minDate) errs.push(`시행일 ${r.date} 은 1년이 지난 날짜입니다`);
    if (!r.location) errs.push("장소가 비어 있습니다");
    else if (!loc) errs.push(`장소 '${r.location}' 이(가) 환경설정 장소 목록에 없습니다`);
    if (!r.type) errs.push("유형이 비어 있습니다");
    else if (!type) errs.push(`유형 '${r.type}' 이(가) 환경설정 유형 목록에 없습니다`);
    if (!r.problem) errs.push("문제점이 비어 있습니다");
    else if (r.problem.length > 2000) errs.push(`문제점이 너무 깁니다 (${r.problem.length}자, 2000자까지)`);
    if (!r.department) errs.push("담당부서가 비어 있습니다");
    else if (!dept) errs.push(`담당부서 '${r.department}' 이(가) 부서 목록에 없습니다`);
    if (r.photos.length === 0) errs.push("개선 전 사진이 없습니다 (H열에 사진을 넣어 주세요)");
    return { ...r, locationId: loc?.id, subId: sub?.id, typeId: type?.id, deptId: dept?.id, error: errs.length ? errs.join(" · ") : undefined };
  };

  // 같은 파일 안에 같은 지적사항(시행일·장소·세부장소·문제점)이 두 번 있으면 오류
  const checkAll = (list: ImportRow[]): Checked[] => {
    const out = list.map(check);
    const seen = new Map<string, number>();
    for (const c of out) {
      if (c.skip) continue;
      const k = [c.date ?? c.dateText, key(c.location), key(c.sub), key(c.problem)].join("|");
      const first = seen.get(k);
      if (first !== undefined) c.error = [c.error, `${first}행과 같은 내용이 중복됩니다`].filter(Boolean).join(" · ");
      else seen.set(k, c.excelRow);
    }
    return out;
  };

  const problems = useMemo(() => (rows ?? []).filter((r) => r.error && !r.result), [rows]);
  const blocked = problems.length > 0;
  const ok = useMemo(() => (rows ?? []).filter((r) => !r.error && !r.skip && !r.result), [rows]);

  const pick = async (file: File) => {
    setError("");
    setRows(null);
    setFinished(false);
    setFileName(file.name);
    setBusy("엑셀 읽는 중…");
    try {
      setRows(checkAll(await readImportFile(file)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const run = async () => {
    if (!rows || blocked) return;
    const list = [...rows];
    let n = 0;
    for (const [i, r] of list.entries()) {
      if (r.error || r.skip || r.result) continue;
      n++;
      setBusy(`등록 중… ${n}/${ok.length}`);
      const id = crypto.randomUUID();
      let paths: string[] = [];
      try {
        // 사진 개수 제한 없음 (용량을 줄이며 한 장씩)
        const processed = [];
        for (const [j, b] of r.photos.entries()) processed.push(await processPhoto(new File([b], `excel-${j}.jpg`, { type: b.type })));
        paths = processed.length ? await uploadPhotos(id, "before", processed) : [];
        const ref = `xlsx-up:${moduleCode}:${r.date}:${key(r.location)}:${key(r.sub)}:${key(r.problem)}`.slice(0, 300);
        const res = await importFinding(
          moduleCode,
          r.date!,
          {
            id,
            location_id: r.locationId!,
            sub_location_id: r.subId ?? "",
            sub_location_text: r.subId ? "" : r.sub,
            type_id: r.typeId ?? "",
            problem: r.problem,
            department_id: r.deptId!,
            photos: paths,
          },
          ref,
        );
        if ("error" in res) {
          await removePhotos(paths);
          list[i] = { ...r, result: res.duplicate ? "dup" : "fail", message: res.error };
        } else list[i] = { ...r, result: "done" };
      } catch (e) {
        if (paths.length) await removePhotos(paths);
        list[i] = { ...r, result: "fail", message: (e as Error).message };
      }
      setRows([...list]);
    }
    await finishImport();
    setBusy("");
    setFinished(true);
    router.refresh();
  };

  const close = () => {
    if (busy) return;
    setOpen(false);
    setRows(null);
    setFinished(false);
  };
  const count = (f: (r: Checked) => boolean) => (rows ?? []).filter(f).length;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        엑셀로 추가
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={close}>
          <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-full flex-col rounded-t-xl bg-white shadow-xl sm:max-w-4xl sm:rounded-xl">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-4">
              <div>
                <h3 className="font-semibold text-gray-900">{moduleName} · 엑셀로 추가</h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  인터넷이 안 될 때 <b>이 화면의 &quot;엑셀 다운로드&quot; 양식</b>에 적어 둔 지적사항을 등록합니다. 시행일(C) · 장소(D) · 세부장소(E) · 유형(F) · 문제점(G) · 개선 전 사진(H) · 담당부서(N) 를 읽고, 담당자 지정 단계로 들어갑니다.
                </p>
              </div>
              <button onClick={close} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="닫기">
                ✕
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto p-4">
              {/* 파일 선택 또는 컴퓨터에서 끌어다 놓기 */}
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!busy) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = [...e.dataTransfer.files].find((x) => /\.xlsx$/i.test(x.name));
                  if (busy) return;
                  if (!f) return setError("엑셀 파일(.xlsx)을 끌어다 놓아 주세요.");
                  pick(f);
                }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
                  dragging ? "border-brand-700 bg-brand-50" : "border-gray-300 bg-gray-50 hover:border-brand-500"
                }`}
              >
                <span className="text-2xl" aria-hidden>
                  📂
                </span>
                <span className="text-sm font-medium text-gray-800">엑셀 파일을 여기로 끌어다 놓거나 눌러서 선택하세요</span>
                <span className="text-xs text-gray-500">{fileName || ".xlsx (프로그램 다운로드 양식)"}</span>
                <input
                  type="file"
                  accept=".xlsx"
                  disabled={!!busy}
                  onChange={(e) => {
                    if (e.target.files?.[0]) pick(e.target.files[0]);
                    e.target.value = "";
                  }}
                  className="sr-only"
                />
              </label>
              {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
              {busy && <p className="animate-pulse text-sm text-gray-600">{busy}</p>}

              {rows && (
                <>
                  <p className="text-sm text-gray-700">
                    <b>{fileName}</b> · 읽은 행 {rows.length}건 → 등록할 건 <b className="text-brand-800">{ok.length}</b>건
                    {count((r) => !!r.skip) > 0 && ` · 이미 프로그램에 있어 건너뜀 ${count((r) => !!r.skip)}건`}
                    {blocked && <b className="text-red-700"> · 문제 있는 행 {problems.length}건</b>}
                    {finished && (
                      <span className="ml-2">
                        → 등록 <b className="text-emerald-700">{count((r) => r.result === "done")}</b> · 이미 있음 {count((r) => r.result === "dup")} · 실패{" "}
                        {count((r) => r.result === "fail")}
                      </span>
                    )}
                  </p>
                  {blocked && (
                    <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                      <p className="font-semibold">엑셀 내용에 문제가 있어 등록할 수 없습니다. 아래 행을 고친 뒤 파일을 다시 올려 주세요.</p>
                      <ul className="mt-2 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs">
                        {problems.map((p) => (
                          <li key={p.excelRow}>
                            <b>{p.excelRow}행</b> : {p.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="overflow-x-auto rounded-md border border-gray-200">
                    <table className="w-full min-w-[720px] text-xs">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          {["행", "시행일", "장소 / 세부장소", "유형", "문제점", "사진", "담당부서", "상태"].map((h) => (
                            <th key={h} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.map((r) => (
                          <tr key={r.excelRow} className={r.error && !r.result ? "bg-red-50" : r.skip ? "bg-gray-50 text-gray-400" : ""}>
                            <td className="px-2 py-1.5">{r.excelRow}</td>
                            <td className={`px-2 py-1.5 whitespace-nowrap ${r.dateError ? "font-medium text-red-700" : ""}`}>{r.date ?? (r.dateText || "-")}</td>
                            <td className="px-2 py-1.5">
                              {r.location || "-"}
                              {r.sub && ` / ${r.sub}`}
                              {r.sub && !r.subId && !r.error && <span className="ml-1 text-[10px] text-gray-400">(직접입력)</span>}
                            </td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{r.type || "-"}</td>
                            <td className="max-w-64 truncate px-2 py-1.5" title={r.problem}>{r.problem}</td>
                            <td className="px-2 py-1.5 text-center">{r.photos.length}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{r.department || "-"}</td>
                            <td className="px-2 py-1.5">
                              {r.result === "done" ? (
                                <span className="text-emerald-700">✔ 등록</span>
                              ) : r.result === "dup" ? (
                                <span className="text-gray-500">이미 있음</span>
                              ) : r.result === "fail" ? (
                                <span className="text-red-600">실패 : {r.message}</span>
                              ) : r.error ? (
                                <span className="text-red-700">{r.error}</span>
                              ) : r.skip ? (
                                <span className="text-gray-500">이미 있음 (건너뜀)</span>
                              ) : (
                                <span className="text-brand-800">등록 예정</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-500">
                    검사 항목 : 시행일(없는 날짜·오늘 이후·1년 경과), 장소·유형·담당부서(환경설정 목록과 같은 이름), 문제점, 개선 전 사진, 같은 파일 안 중복. 세부장소는 목록에 없으면 직접입력으로 들어갑니다. 같은 파일을 다시 올려도 이미 등록된 건은 두 번 등록되지 않습니다.
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
              <button onClick={close} disabled={!!busy} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                {finished ? "닫기" : "취소"}
              </button>
              {!finished && (
                <button onClick={run} disabled={!!busy || blocked || ok.length === 0} className="rounded-md bg-brand-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
                  {blocked ? "문제를 고친 뒤 다시 올려 주세요" : `${ok.length}건 등록`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
