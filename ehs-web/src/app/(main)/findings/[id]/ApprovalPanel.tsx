"use client";

import { useState, useTransition } from "react";
import { approveFinding, rejectFinding } from "../actions";
import { Button, Card, FormMessage, Textarea } from "@/components/ui";
import type { ActionState } from "@/lib/types";

export function ApprovalPanel({ findingId }: { findingId: string }) {
  const [comment, setComment] = useState("");
  const [state, setState] = useState<ActionState>();
  const [pending, start] = useTransition();

  return (
    <Card title="종결 승인" className="border-violet-300">
      <p className="mb-3 text-sm text-gray-600">아래 개선 후 사진과 조치 내용을 확인한 뒤 승인 또는 반려하세요. 반려하면 조치담당자에게 되돌아갑니다.</p>
      <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="승인 의견 (선택) / 반려 사유 (필수)" />
      <div className="mt-3 space-y-2">
        <FormMessage state={state} />
        <div className="flex gap-2">
          <Button disabled={pending} onClick={() => start(async () => setState(await approveFinding(findingId, comment)))}>
            승인 (종결)
          </Button>
          <Button
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (!comment.trim()) return setState({ error: "반려 사유를 입력해 주세요." });
              start(async () => setState(await rejectFinding(findingId, comment)));
            }}
          >
            반려
          </Button>
        </div>
      </div>
    </Card>
  );
}
