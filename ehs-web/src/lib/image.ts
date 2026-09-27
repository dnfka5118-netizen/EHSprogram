// 사진 처리 : 고르는 즉시 JPEG 로 변환·압축하고 목록용 썸네일도 만든다
//  - 원본 : 긴 변 1600px, 품질 0.8 (휴대폰 3~5MB → 약 200~400KB)
//  - 썸네일 : 긴 변 360px, 품질 0.7
//  - 아이폰/갤럭시 HEIC 사진은 브라우저가 못 읽으면 heic-to 로 변환 (필요할 때만 불러옴)

const MAIN = { side: 1600, quality: 0.8 };
const THUMB = { side: 360, quality: 0.7 };

export type ProcessedPhoto = { main: Blob; thumb: Blob; preview: string; name: string };

type Drawable = { source: CanvasImageSource; width: number; height: number; close: () => void };

const looksHeic = (file: File) => /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

async function fromBitmap(blob: Blob): Promise<Drawable> {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
}

async function fromImgElement(blob: Blob): Promise<Drawable> {
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

async function heicToJpeg(file: File): Promise<Blob> {
  const { heicTo } = await import("heic-to/next");
  return heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
}

async function decode(file: File): Promise<Drawable> {
  const attempts: (() => Promise<Drawable>)[] = [];
  if (looksHeic(file)) attempts.push(async () => fromBitmap(await heicToJpeg(file)));
  attempts.push(() => fromBitmap(file), () => fromImgElement(file));
  if (!looksHeic(file)) attempts.push(async () => fromBitmap(await heicToJpeg(file))); // 확장자 없는 HEIC 대비

  for (const attempt of attempts) {
    try {
      const d = await attempt();
      if (d.width > 0 && d.height > 0) return d;
      d.close();
    } catch {
      // 다음 방법 시도
    }
  }
  throw new Error(`'${file.name}' 사진을 읽을 수 없습니다. 다른 사진을 선택하거나 카메라 버튼으로 다시 촬영해 주세요.`);
}

function render(d: Drawable, side: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, side / Math.max(d.width, d.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(d.width * scale));
  canvas.height = Math.max(1, Math.round(d.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 처리할 수 없습니다.");
  ctx.fillStyle = "#fff"; // PNG 투명 배경 → 흰색
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(d.source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지 변환에 실패했습니다."))), "image/jpeg", quality),
  );
}

export async function processPhoto(file: File): Promise<ProcessedPhoto> {
  const d = await decode(file);
  try {
    const main = await render(d, MAIN.side, MAIN.quality);
    const thumb = await render(d, THUMB.side, THUMB.quality);
    return { main, thumb, preview: URL.createObjectURL(thumb), name: file.name };
  } finally {
    d.close();
  }
}

export { thumbPathOf } from "./photo-path";
