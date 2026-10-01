"use client";

import { useState, useTransition } from "react";
import { assignFinding } from "../actions";
import { Button, Card, FormMessage } from "@/components/ui";
import type { ActionState } from "@/lib/types";
import { MemberPicker } from "@/components/MemberPicker";

export function AssignPanel({ findingId, members, selected, initialOpen }: {
  findingId: string;
  members: { id: string; name: string; position: string | null }[];
  selected: string[];
  initialOpen: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [picked, setPicked] = useState<string[]>(selected);
  const [state, setState] = useState<ActionState>();
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <div className="text-right">
        <button onClick={() => setOpen(true)} className="text-sm text-brand-800 hover:underline">
          조치담당자 변경
        </button>
      </div>
    );
  }

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Card title={selected.length ? "조치담당자 변경" : "조치담당자 지정"} className="border-brand-300">
      <MemberPicker members={members} picked={picked} onToggle={toggle} />
      <p className="mt-2 text-xs text-gray-500">여러 명을 지정할 수 있습니다.</p>
      <div className="mt-3 space-y-2">
        <FormMessage state={state} />
        <div className="flex gap-2">
          <Button
            disabled={pending || picked.length === 0}
            onClick={() => start(async () => setState(await assignFinding(findingId, picked)))}
          >
            {pending ? "저장 중…" : selected.length ? "담당자 변경" : "담당자 지정"}
          </Button>
          {!initialOpen && (
            <Button variant="ghost" onClick={() => setOpen(false)}>
              닫기
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
