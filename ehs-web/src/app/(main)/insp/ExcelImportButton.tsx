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
  error?: string; // 등록할 수 없는 이유
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

  const check = (r: ImportRow): Checked => {
    if (r.existingId) return { ...r, error: "이미 프로그램에 있는 건 (다운로드한 엑셀)" };
    const loc = locations.find((l) => key(l.name) === key(r.location));
    const sub = loc?.sub_locations.find((s) => key(s.name) === key(r.sub));
    const type = types.find((t) => key(t.name) === key(r.type));
    const dept = departments.find((d) => key(d.name) === key(r.department));
    const minDate = new Date(Date.parse(today) - 366 * 86400000).toISOString().slice(0, 10);
    const error = !r.date
      ? "시행일을 읽을 수 없음 (예: 26.10.05)"
      : r.date > today
        ? "시행일이 오늘 이후"
        : r.date < minDate
          ? "1년이 지난 점검"
          : !r.problem
            ? "문제점 없음"
            : !loc
              ? `장소 '${r.location || "(빈칸)"}' 가 목록에 없음`
              : !dept
                ? `담당부서 '${r.department || "(빈칸)"}' 가 목록에 없음`
                : r.type && !type
                  ? `유형 '${r.type}' 이 목록에 없음`
                  : undefined;
    return { ...r, locationId: loc?.id, subId: sub?.id, typeId: type?.id, deptId: dept?.id, error };
  };

  const ok = useMemo(() => (rows ?? []).filter((r) => !r.error && !r.result), [rows]);

  const pick = async (file: File) => {
    setError("");
    setRows(null);
    setFinished(false);
    setFileName(file.name);
    setBusy("엑셀 읽는 중…");
    try {
      setRows((await readImportFile(file)).map(check));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const run = async () => {
    if (!rows) return;
    const list = [...rows];
    let n = 0;
    for (const [i, r] of list.entries()) {
      if (r.error || r.result) continue;
      n++;
      setBusy(`등록 중… ${n}/${ok.length}`);
      const id = crypto.randomUUID();
      let paths: string[] = [];
      try {
        const processed = await Promise.all(r.photos.slice(0, 6).map((b, j) => processPhoto(new File([b], `excel-${j}.jpg`, { type: b.type }))));
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
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">엑셀 파일</span>
                <input
                  type="file"
                  accept=".xlsx"
                  disabled={!!busy}
                  onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-800 file:px-3 file:py-2 file:text-white"
                />
              </label>
              {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
              {busy && <p className="animate-pulse text-sm text-gray-600">{busy}</p>}

              {rows && (
                <>
                  <p className="text-sm text-gray-700">
                    <b>{fileName}</b> · 읽은 행 {rows.length}건 → 등록 가능 <b className="text-brand-800">{count((r) => !r.error)}</b>건 · 제외{" "}
                    {count((r) => !!r.error)}건
                    {finished && (
                      <span className="ml-2">
                        → 등록 <b className="text-emerald-700">{count((r) => r.result === "done")}</b> · 이미 있음 {count((r) => r.result === "dup")} · 실패{" "}
                        {count((r) => r.result === "fail")}
                      </span>
                    )}
                  </p>
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
                          <tr key={r.excelRow} className={r.error ? "bg-gray-50 text-gray-400" : ""}>
                            <td className="px-2 py-1.5">{r.excelRow}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{r.date ?? "-"}</td>
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
                                <span className="text-amber-700">{r.error}</span>
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
                    제외된 행은 엑셀을 고쳐 다시 올리시면 됩니다. 같은 파일을 다시 올려도 이미 등록된 건은 두 번 등록되지 않습니다. 장소·부서·유형은 환경설정의 이름과 같아야 합니다.
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
              <button onClick={close} disabled={!!busy} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                {finished ? "닫기" : "취소"}
              </button>
              {!finished && (
                <button onClick={run} disabled={!!busy || ok.length === 0} className="rounded-md bg-brand-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
                  {ok.length}건 등록
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
