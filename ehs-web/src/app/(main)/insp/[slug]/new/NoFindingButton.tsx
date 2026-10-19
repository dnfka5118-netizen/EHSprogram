"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@/components/ui";
import { recordNoFinding } from "../../actions";

// 지적사항 없이 점검 완료 : 점검 주기가 정해진 사람이 '점검 미진행' 으로 잡히지 않도록 오늘 점검했다고 기록
export function NoFindingButton({ moduleCode, doneToday }: { moduleCode: string; doneToday: boolean }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(doneToday ? "오늘 '지적사항 없이 점검 완료' 가 기록되어 있습니다." : null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      {msg && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}
      {open ? (
        <div className="flex flex-wrap gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="점검한 곳 (선택, 예 : 2동 전체)" className="min-w-0 flex-1" />
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await recordNoFinding(moduleCode, note);
                if ("error" in r) return alert(r.error);
                setMsg("'지적사항 없이 점검 완료' 를 기록했습니다.");
                setOpen(false);
                setNote("");
              })
            }
          >
            {pending ? "기록 중…" : "기록"}
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            취소
          </Button>
        </div>
      ) : (
        <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
          지적사항 없이 점검 완료
        </Button>
      )}
    </div>
  );
}
