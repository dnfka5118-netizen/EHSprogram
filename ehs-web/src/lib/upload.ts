"use client";

import { createClient } from "./supabase/client";
import type { ProcessedPhoto } from "./image";
import { thumbPathOf } from "./photo-path";

// 처리된 사진(원본+썸네일)을 findings 버킷의 {지적사항ID}/ 경로로 동시에 올리고 원본 경로 목록을 돌려준다
export async function uploadPhotos(findingId: string, kind: "before" | "after", photos: ProcessedPhoto[]): Promise<string[]> {
  const supabase = createClient();
  const stamp = Date.now();
  const paths = photos.map((_, i) => `${findingId}/${kind}-${stamp}-${i}.jpg`);
  const jobs = photos.flatMap((p, i) => [
    { path: paths[i], blob: p.main },
    { path: thumbPathOf(paths[i]), blob: p.thumb },
  ]);
  const results = await Promise.all(
    jobs.map((j) => supabase.storage.from("findings").upload(j.path, j.blob, { contentType: "image/jpeg" })),
  );
  const failed = results.find((r) => r.error);
  if (failed) {
    const ok = jobs.filter((_, i) => !results[i].error).map((j) => j.path);
    if (ok.length) await supabase.storage.from("findings").remove(ok);
    throw new Error(`사진 업로드 실패: ${failed.error!.message}`);
  }
  return paths;
}

export async function removePhotos(paths: string[]) {
  if (paths.length) await createClient().storage.from("findings").remove([...paths, ...paths.map(thumbPathOf)]);
}
