"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { MemberPicker, type Member } from "@/components/MemberPicker";
import { SubmitButton } from "@/components/ui";
import type { ActionState } from "@/lib/types";

// 대체 점검자 명단 : 점검자가 없을 때 어느 점검 단위든 대신 점검할 수 있는 사람
export function SubstituteEditor({ people, ids, action }: { people: Member[]; ids: string[]; action: (prev: ActionState, fd: FormData) => Promise<ActionState> }) {
  const [picked, setPicked] = useState<string[]>(ids);
  return (
    <ActionForm action={action} className="space-y-2">
      <MemberPicker members={people} picked={picked} onToggle={(id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))} />
      {picked.map((id) => (
        <input key={id} type="hidden" name="member" value={id} />
      ))}
      <SubmitButton>대체 점검자 저장 ({picked.length}명)</SubmitButton>
    </ActionForm>
  );
}
