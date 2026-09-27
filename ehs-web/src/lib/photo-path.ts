// 사진 저장 경로 규칙 (서버·브라우저 공용)
//   원본   : {지적사항ID}/{before|after}-{시각}-{n}.jpg
//   썸네일 : 같은 이름 + .thumb.jpg
export const thumbPathOf = (path: string) => path.replace(/\.jpg$/i, ".thumb.jpg");
