"use client";

import { useState } from "react";
import { Button } from "./ui";
import { exportFindingsExcel, type ExcelOptions } from "@/lib/excel-export";
import type { FindingRow } from "@/lib/finding-rows";

export function ExcelButton({ rows, ...opts }: { rows: FindingRow[] } & Omit<ExcelOptions, "onProgress">) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <Button
      variant="secondary"
      disabled={!!busy || rows.length === 0}
      onClick={async () => {
        try {
          await exportFindingsExcel(rows, { ...opts, onProgress: setBusy });
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
