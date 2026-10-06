"use client";

import { useState } from "react";
import { Button } from "./ui";
import { exportFindingsExcel, type ExcelOptions } from "@/lib/excel-export";
import type { FindingRow } from "@/lib/finding-rows";

// loadPage 가 있으면 화면에 보이는 건(최근 500건)이 아니라 조건에 맞는 전부를 나눠 불러와서 엑셀로 만든다
export function ExcelButton({ rows, loadPage, ...opts }: { rows: FindingRow[]; loadPage?: (page: number) => Promise<FindingRow[]> } & Omit<ExcelOptions, "onProgress">) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <Button
      variant="secondary"
      disabled={!!busy || rows.length === 0}
      onClick={async () => {
        try {
          let all = rows;
          if (loadPage) {
            all = [];
            for (let page = 0; ; page++) {
              setBusy(`불러오는 중… ${all.length}건`);
              const part = await loadPage(page);
              all.push(...part);
              if (part.length < 300) break;
            }
          }
          await exportFindingsExcel(all, { ...opts, onProgress: setBusy });
        } catch (e) {
          alert(`엑셀 생성 실패: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
          setBusy(null);
        }
      }}
    >
      {busy ?? "엑셀 다운로드"}
    </Button>
  );
}
