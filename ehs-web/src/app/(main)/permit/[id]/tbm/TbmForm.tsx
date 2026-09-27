"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { savePermitTbm, type TbmInput } from "../../actions";
import { PhotoPicker } from "@/components/PhotoPicker";
import { Button, FormMessage } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { fmtDateTime } from "@/lib/format";
import type { ProcessedPhoto } from "@/lib/image";
import type { ActionState } from "@/lib/types";
import { F, INPUT, Panel } from "../../ui";

const plus = (dt: string, min: number) => (dt ? new Date(Date.parse(`${dt}:00Z`) + min * 60000).toISOString().slice(0, 16) : "");

export function TbmForm({ permitId, start, savedAt, photoUrl, initial }: { permitId: string; start: string; savedAt: string | null; photoUrl: string | null; initial: TbmInput }) {
  const router = useRouter();
  const [t, setT] = useState<TbmInput>(initial);
  const [photos, setPhotos] = useState<ProcessedPhoto[]>([]);
  const [removeOld, setRemoveOld] = useState(false);
  const [state, setState] = useState<ActionState>();
  const [pending, begin] = useTransition();
  const set = (patch: Partial<TbmInput>) => setT((x) => ({ ...x, ...patch }));

  function save() {
    setState(undefined);
    if (!t.tbm_dt) return setState({ error: "TBM 일시를 입력하세요." });
    begin(async () => {
      let photo_path = removeOld ? null : t.photo_path;
      if (photos[0]) {
        const path = `permit/${permitId}/tbm-${Date.now()}.jpg`;
        const { error } = await createClient().storage.from("docs").upload(path, photos[0].main, { contentType: "image/jpeg" });
        if (error) return setState({ error: `사진 업로드 실패: ${error.message}` });
        photo_path = path;
      }
      const res = await savePermitTbm(permitId, { ...t, photo_path });
      if (res.error) return setState({ error: res.error });
      setState({ message: res.message });
      router.push(`/permit/${permitId}`);
      router.refresh();
    });
  }

  return (
    <Panel num="TBM" title="📋 TBM(Tool Box Meeting) 실시 기록">
      {savedAt && <p className="text-xs text-emerald-700">✓ 이전에 저장된 TBM 기록입니다 ({fmtDateTime(savedAt)}) — 수정 후 다시 저장하면 갱신됩니다.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <F label="TBM 일시" required>
          <input type="datetime-local" className={INPUT} value={t.tbm_dt} onChange={(e) => set({ tbm_dt: e.target.value })} />
          <span className="mt-1 flex gap-1">
            {[10, 15].map((m) => (
              <button key={m} type="button" className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-50" onClick={() => set({ tbm_dt: plus(start, m) })}>
                작업시작 +{m}분
              </button>
            ))}
          </span>
        </F>
        <F label="작업 일시 (허가서 연동)"><input type="datetime-local" className={INPUT} value={t.work_dt} onChange={(e) => set({ work_dt: e.target.value })} /></F>
        <div className="md:col-span-2">
          <F label="작업명 (허가서 연동)"><input className={INPUT} value={t.work_name} onChange={(e) => set({ work_name: e.target.value })} /></F>
        </div>
        <div className="md:col-span-2">
          <F label="작업내용 및 주의사항">
            <textarea rows={7} className={INPUT} value={t.content} onChange={(e) => set({ content: e.target.value })} placeholder="연동된 위험성평가의 유해위험요인·안전조치를 바탕으로 현장에서 강조할 내용을 작성하세요." />
          </F>
        </div>
        <F label="TBM 장소 (허가서 연동)"><input className={INPUT} value={t.place} onChange={(e) => set({ place: e.target.value })} /></F>
        <F label="TBM 리더 (작업관리자 연동)"><input className={INPUT} value={t.leader} onChange={(e) => set({ leader: e.target.value })} /></F>
      </div>
      <F label="TBM 실시 사진">
        {photoUrl && !removeOld && photos.length === 0 && (
          <span className="mb-2 block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="TBM 사진" className="max-h-64 rounded-md border" />
            <button type="button" className="mt-1 text-xs text-red-600 hover:underline" onClick={() => setRemoveOld(true)}>사진 삭제</button>
          </span>
        )}
        <PhotoPicker photos={photos} onChange={(p) => setPhotos(p.slice(-1))} />
      </F>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <Button disabled={pending} onClick={save}>{pending ? "저장 중…" : "💾 TBM 저장"}</Button>
        <Button variant="ghost" onClick={() => router.push(`/permit/${permitId}`)}>취소</Button>
      </div>
    </Panel>
  );
}
