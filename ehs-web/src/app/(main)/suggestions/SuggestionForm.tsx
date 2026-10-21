"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PhotoPicker } from "@/components/PhotoPicker";
import { VoiceButton } from "@/components/VoiceButton";
import { Button, Field, FormMessage, Input, Select, Textarea } from "@/components/ui";
import type { ProcessedPhoto } from "@/lib/image";
import type { ActionState } from "@/lib/types";
import { SUGGESTION_CATEGORIES, suggestionPhotoPath } from "@/lib/suggestion";
import { createSuggestion, updateSuggestion } from "./actions";

type Initial = { id: string; category: string; title: string; body: string; anonymous: boolean; photos: { path: string; url: string | null }[] };

// 의견 쓰기 / 수정 (수정은 접수 대기일 때 작성자만)
export function SuggestionForm({ initial }: { initial?: Initial }) {
  const router = useRouter();
  const [id] = useState(() => initial?.id ?? crypto.randomUUID());
  const [category, setCategory] = useState(initial?.category ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [anonymous, setAnonymous] = useState(initial?.anonymous ?? false);
  const [kept, setKept] = useState(initial?.photos ?? []);
  const [photos, setPhotos] = useState<ProcessedPhoto[]>([]);
  const [state, setState] = useState<ActionState>();
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      if (!category) return setState({ error: "관련 메뉴를 선택해 주세요." });
      if (!title.trim()) return setState({ error: "제목을 입력해 주세요." });
      if (!body.trim()) return setState({ error: "내용을 입력해 주세요." });
      if (kept.length + photos.length > 6) return setState({ error: "사진은 6장까지 첨부할 수 있습니다." });
      const supabase = createClient();
      const stamp = Date.now();
      const paths = photos.map((_, i) => suggestionPhotoPath(id, stamp, i));
      const up = await Promise.all(photos.map((p, i) => supabase.storage.from("docs").upload(paths[i], p.main, { contentType: "image/jpeg" })));
      const failed = up.find((r) => r.error);
      if (failed) {
        await supabase.storage.from("docs").remove(paths.filter((_, i) => !up[i].error));
        return setState({ error: `사진 업로드 실패 : ${failed.error!.message}` });
      }
      const input = { id, category, title, body, anonymous, photos: [...kept.map((k) => k.path), ...paths] };
      const r = initial ? await updateSuggestion(input) : await createSuggestion(input);
      if (r?.error) {
        if (paths.length) await supabase.storage.from("docs").remove(paths);
        return setState(r);
      }
      // 수정 때 뺀 사진은 저장소에서도 지움
      const removed = (initial?.photos ?? []).filter((p) => !kept.some((k) => k.path === p.path)).map((p) => p.path);
      if (removed.length) await supabase.storage.from("docs").remove(removed);
      router.push(`/suggestions/${id}`);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <FormMessage state={state} />
      <Field label="관련 메뉴" required>
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">선택</option>
          {SUGGESTION_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      </Field>
      <Field label="제목" required>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="예: 점검 등록 때 사진을 여러 장 한 번에 고르고 싶어요" />
      </Field>
      <div className="relative">
        <VoiceButton className="absolute top-0 right-0 z-10" value={body} onChange={setBody} />
        <Field label="내용" required>
          <Textarea rows={7} value={body} onChange={(e) => setBody(e.target.value)} placeholder={"불편한 점, 바라는 점, 어떻게 바뀌면 좋을지 (🎤 말로 입력 가능)"} />
        </Field>
      </div>
      <Field label="사진·화면 캡처" hint="선택 · 최대 6장">
        {kept.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {kept.map((k) => (
              <div key={k.path} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {k.url && <img src={k.url} alt="첨부 사진" className="h-20 w-20 rounded-md object-cover" />}
                <button
                  type="button"
                  onClick={() => setKept((p) => p.filter((x) => x.path !== k.path))}
                  className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full bg-gray-800 text-xs text-white"
                  aria-label="사진 빼기"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <PhotoPicker photos={photos} onChange={setPhotos} />
      </Field>
      <label className="flex items-start gap-2 rounded-md border border-gray-200 px-3 py-2.5 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        <span>
          <b>익명으로 올리기</b>
          <span className="block text-xs text-gray-500">목록과 글에 이름 대신 &lsquo;익명&rsquo;으로 보입니다. (답변 알림은 그대로 받습니다)</span>
        </span>
      </label>
      <div className="flex gap-2">
        <Button className="flex-1" disabled={pending} onClick={submit}>
          {pending ? "올리는 중…" : initial ? "수정 저장" : "의견 올리기"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => router.back()}>
          취소
        </Button>
      </div>
    </div>
  );
}
