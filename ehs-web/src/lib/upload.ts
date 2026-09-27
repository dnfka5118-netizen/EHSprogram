"use client";

import { createClient } from "./supabase/client";
import type { ProcessedPhoto } from "./image";
import { thumbPathOf } from "./photo-path";

// 처리된 사진(원본+썸네일)을 findings 버킷의 {지적사항ID}/ 경로로 올리고 원본 경로 목록을 돌려준다
export async function uploadPhotos(findingId: string, kind: "before" | "after", photos: ProcessedPhoto[]): Promise<string[]> {
  const supabase = createClient();
  const uploaded: string[] = [];
  const paths: string[] = [];
  try {
    for (const [i, p] of photos.entries()) {
      const path = `${findingId}/${kind}-${Date.now()}-${i}.jpg`;
      for (const [target, blob] of [[path, p.main], [thumbPathOf(path), p.thumb]] as const) {
        const { error } = await supabase.storage.from("findings").upload(target, blob, { contentType: "image/jpeg" });
        if (error) throw error;
        uploaded.push(target);
      }
      paths.push(path);
    }
    return paths;
  } catch (e) {
    if (uploaded.length) await supabase.storage.from("findings").remove(uploaded);
    throw new Error(`사진 업로드 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function removePhotos(paths: string[]) {
  if (paths.length) await createClient().storage.from("findings").remove([...paths, ...paths.map(thumbPathOf)]);
}
