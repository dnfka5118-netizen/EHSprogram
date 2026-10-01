"use client";

// 비슷한 과거 지적 찾기 (브라우저 안에서만 계산 — 사진은 외부로 보내지 않음)
//   1) 사진 → CLIP 사진 특징값 (onnxruntime-web, 모델은 처음 한 번 내려받아 브라우저에 저장)
//   2) finding_examples (과거 점검 엑셀에서 만든 사례) 와 비교해 가장 비슷한 순으로
// scripts/build-examples.mjs 와 모델·전처리가 같아야 한다.

import { createClient } from "@/lib/supabase/client";

const ORT_VERSION = "1.30.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const MODEL_URL = "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model_quantized.onnx";
const MODEL_CACHE = "ehs-clip-v1";
const SIZE = 224;
const MEAN = [0.48145466, 0.4578275, 0.40821073];
const STD = [0.26862954, 0.26130258, 0.27577711];
const DIM = 512;

export type Example = { id: number; location: string | null; sub_location: string | null; type_name: string | null; problem: string };
export type Suggestion = Example & { score: number };

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ort = any;
// 번들러가 CDN 주소를 건드리지 않도록 런타임 import
const importUrl = new Function("u", "return import(u)") as (u: string) => Promise<Ort>;

let ortP: Promise<Ort> | null = null;
let sessionP: Promise<any> | null = null;
let examplesP: Promise<{ list: Example[]; vecs: Int8Array }> | null = null;

async function modelBytes(onProgress?: (msg: string) => void): Promise<ArrayBuffer> {
  try {
    const cache = await caches.open(MODEL_CACHE);
    const hit = await cache.match(MODEL_URL);
    if (hit) return hit.arrayBuffer();
    onProgress?.("사진 인식 프로그램 내려받는 중 (처음 한 번, 약 89MB)…");
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error("모델을 내려받지 못했습니다.");
    await cache.put(MODEL_URL, res.clone());
    return res.arrayBuffer();
  } catch {
    onProgress?.("사진 인식 프로그램 내려받는 중 (약 89MB)…");
    return (await fetch(MODEL_URL)).arrayBuffer();
  }
}

function getSession(onProgress?: (msg: string) => void) {
  sessionP ??= (async () => {
    ortP ??= importUrl(`${ORT_BASE}ort.wasm.min.mjs`);
    const ort = await ortP;
    ort.env.wasm.wasmPaths = ORT_BASE;
    ort.env.wasm.numThreads = 1;
    const bytes = await modelBytes(onProgress);
    onProgress?.("사진 인식 준비 중…");
    return ort.InferenceSession.create(new Uint8Array(bytes), { executionProviders: ["wasm"] });
  })().catch((e) => {
    sessionP = null;
    throw e;
  });
  return sessionP;
}

function getExamples() {
  examplesP ??= (async () => {
    const supabase = createClient();
    const list: Example[] = [];
    const embs: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("finding_examples")
        .select("id, location, sub_location, type_name, problem, emb")
        .order("id")
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const { emb, ...e } of data ?? []) {
        list.push(e as Example);
        embs.push(emb as string);
      }
      if (!data || data.length < 1000) break;
    }
    const vecs = new Int8Array(list.length * DIM);
    embs.forEach((b64, i) => {
      const bin = atob(b64);
      for (let j = 0; j < DIM; j++) vecs[i * DIM + j] = (bin.charCodeAt(j) << 24) >> 24;
    });
    return { list, vecs };
  })().catch((e) => {
    examplesP = null;
    throw e;
  });
  return examplesP;
}

// 짧은 변을 224 로 맞추고 가운데를 잘라 224×224 (sharp fit:cover 와 같음)
async function pixels(blob: Blob): Promise<Float32Array> {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, SIZE, SIZE);
  bmp.close();
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const px = new Float32Array(3 * SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) for (let c = 0; c < 3; c++) px[c * SIZE * SIZE + i] = (data[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  return px;
}

// 사례가 없으면 빈 목록
export async function findSimilar(photo: Blob, opts: { limit?: number; location?: string; onProgress?: (msg: string) => void } = {}): Promise<Suggestion[]> {
  const [session, ex] = await Promise.all([getSession(opts.onProgress), getExamples()]);
  if (ex.list.length === 0) return [];
  opts.onProgress?.("비슷한 과거 지적 찾는 중…");
  const ort = await ortP;
  const out = await session.run({ pixel_values: new ort.Tensor("float32", await pixels(photo), [1, 3, SIZE, SIZE]) });
  const q = out.image_embeds.data as Float32Array;
  const len = Math.hypot(...q);

  const scores = new Float32Array(ex.list.length);
  for (let i = 0; i < ex.list.length; i++) {
    let dot = 0;
    for (let j = 0; j < DIM; j++) dot += q[j] * ex.vecs[i * DIM + j];
    // 같은 장소에서 나온 사례는 조금 우선
    const sameLoc = opts.location && ex.list[i].location && ex.list[i].location!.replace(/\s/g, "") === opts.location.replace(/\s/g, "");
    scores[i] = dot / len / 127 + (sameLoc ? 0.02 : 0);
  }
  const order = [...scores.keys()].sort((a, b) => scores[b] - scores[a]);
  const picked: Suggestion[] = [];
  const seen = new Set<string>();
  for (const i of order) {
    const e = ex.list[i];
    const key = e.problem.replace(/\s/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push({ ...e, score: scores[i] });
    if (picked.length >= (opts.limit ?? 5)) break;
  }
  return picked;
}
