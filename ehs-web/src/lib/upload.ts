"use client";

import { createClient } from "./supabase/client";
import { compressImage } from "./image";

// 사진을 압축해 findings 버킷의 {지적사항ID}/ 경로로 업로드하고 경로 목록을 돌려준다
export async function uploadPhotos(findingId: string, kind: "before" | "after", files: File[]): Promise<string[]> {
  const supabase = createClient();
  const paths: string[] = [];
  try {
    for (const [i, file] of files.entries()) {
      const blob = await compressImage(file);
      const path = `${findingId}/${kind}-${Date.now()}-${i}.jpg`;
      const { error } = await supabase.storage.from("findings").upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      paths.push(path);
    }
    return paths;
  } catch (e) {
    if (paths.length) await supabase.storage.from("findings").remove(paths);
    throw new Error(`사진 업로드 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function removePhotos(paths: string[]) {
  if (paths.length) await createClient().storage.from("findings").remove(paths);
}
