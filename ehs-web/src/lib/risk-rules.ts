// AI 위험성평가 작성 : 작업 조건(고소 · 밀폐 · 화기 …)별 기본 안전조치 · 빠지기 쉬운 단계 (근거 = KOSHA GUIDE)
//   - 절차서가 없을 때 : 단계는 우리 JSA 그대로, 빠진 조치만 해당 단계의 감소대책에 [보완] 으로 덧붙임
//   - 절차서가 있을 때 : 위 + 절차서에 없는 단계(LOTO · 가스 측정 …)를 "빠진 단계"로 제안 (채택/제외 선택)
//   조건은 사용자가 고른 칩 + 작업 설명·장비·물질·절차서 글에서 찾은 낱말

export type ControlCheck = "제거" | "대체" | "공학적" | "관리적" | "보호구";
export type RuleMeasure = {
  text: string;
  check: ControlCheck;
  ref: string; // "KOSHA B-M-25-2026"
  when?: RegExp; // 이 낱말이 있을 때만 (예: 지게차)
  covered: RegExp; // 평가서에 이미 이런 글이 있으면 덧붙이지 않음
};
export type RuleStep = {
  name: string;
  safe: string;
  hazards: { type: string; content: string }[];
  before: RegExp; // 이런 단계 앞에 넣음
  covered: RegExp; // 이미 이런 단계가 있으면 제안하지 않음
  ref: string;
};
export type WorkCondition = {
  key: string;
  label: string;
  desc: string;
  detect: RegExp; // 작업 설명 · 장비 · 물질 · 절차서 글에서 찾는 낱말
  attach: RegExp; // 조치를 붙일 단계 (없으면 첫 단계)
  measures: RuleMeasure[];
  step?: RuleStep;
};

export const WORK_CONDITIONS: WorkCondition[] = [
  {
    key: "height",
    label: "고소",
    desc: "2m 이상 높이 · 사다리 · 고소작업대 · 지붕·탱크 상부",
    detect: /고소|사다리|비계|지붕|상부|고소작업대|렌탈|작업대|난간|2\s*m\s*이상/,
    attach: /상부|고소|사다리|비계|지붕|작업대|설치|해체/,
    measures: [
      { text: "작업발판·안전난간 확보, 안전대 착용 후 안전대 부착설비에 체결", check: "공학적", ref: "KOSHA B-M-24-2026", covered: /안전대|안전난간|작업발판/ },
      {
        text: "이동식 사다리는 아웃트리거·고정 또는 2인 1조로 지지, 최상부 발판 사용 금지",
        check: "관리적",
        ref: "KOSHA A-G-4-2025",
        when: /사다리/,
        covered: /사다리.*(고정|지지|2인)|아웃트리거/,
      },
      {
        text: "고소작업대는 작업 전 아웃트리거·과상승방지장치·작업대 난간 점검",
        check: "관리적",
        ref: "KOSHA X-44-2016",
        when: /고소작업대|렌탈|작업대/,
        covered: /고소작업대.*점검|과상승/,
      },
      { text: "하부 출입통제 및 공구·자재 낙하 방지 (공구 끈 · 낙하물 방지망)", check: "관리적", ref: "KOSHA A-G-1-2025", covered: /하부.*(통제|출입)|낙하.*방지/ },
    ],
    step: {
      name: "고소작업 전 작업발판·안전대 부착설비 확인 및 하부 출입통제",
      safe: "",
      hazards: [{ type: "떨어짐", content: "작업발판 불량·안전대 미체결로 인한 추락" }],
      before: /상부|고소|사다리|비계|지붕|작업대/,
      covered: /안전대|작업발판|난간|하부.*통제/,
      ref: "KOSHA B-M-24-2026",
    },
  },
  {
    key: "confined",
    label: "밀폐공간",
    desc: "탱크·반응기·맨홀·피트·집수조 내부 출입",
    detect: /밀폐|맨홀|탱크\s*내부|내부\s*(진입|출입|청소|점검|세척)|피트|집수조|반응기\s*내부|맨웨이/,
    attach: /진입|출입|내부|맨홀|청소|세척/,
    measures: [
      {
        text: "출입 전·작업 중 산소(18~23.5%)·유해가스·가연성가스 농도 측정, 적정 공기 확인 후 출입",
        check: "공학적",
        ref: "KOSHA X-68-2015",
        covered: /산소|가스\s*(농도\s*)?측정|농도\s*측정/,
      },
      { text: "강제 환기 실시, 외부 감시인 배치 및 상시 연락 유지", check: "관리적", ref: "KOSHA X-68-2015", covered: /환기|감시인/ },
      { text: "송기마스크 등 호흡용 보호구·구명줄·구조장비 비치, 밀폐공간 작업허가 후 출입", check: "보호구", ref: "KOSHA X-68-2015", covered: /송기|공기호흡기|SCBA|구명줄/i },
      {
        text: "질소 등 불활성가스로 치환한 설비는 공기로 재치환 후 출입",
        check: "공학적",
        ref: "KOSHA C-C-85-2026",
        when: /질소|N2|불활성|퍼지|purge/i,
        covered: /공기.*치환|재치환/,
      },
    ],
    step: {
      name: "밀폐공간 출입 전 환기 및 산소·유해가스 농도 측정, 감시인 배치",
      safe: "",
      hazards: [{ type: "질식", content: "산소결핍·유해가스로 인한 질식·중독" }],
      before: /진입|출입|내부|맨홀/,
      covered: /산소|가스\s*(농도\s*)?측정|농도\s*측정|환기/,
      ref: "KOSHA X-68-2015",
    },
  },
  {
    key: "hot",
    label: "화기",
    desc: "용접 · 용단 · 그라인더 · 토치 등 불꽃 작업",
    detect: /용접|용단|절단|그라인더|화기|토치|가스\s*절단|산소\s*절단|브레이징/,
    attach: /용접|용단|절단|그라인더|화기/,
    measures: [
      { text: "화기작업 허가 후 작업, 주변 가연물 제거 및 불티 비산 방지(용접방화포) 설치", check: "관리적", ref: "KOSHA A-G-14-2026", covered: /방화포|가연물|불티/ },
      { text: "작업 전·중 가연성가스 농도 측정, 소화기 비치 및 화재감시자 배치", check: "관리적", ref: "KOSHA A-G-14-2026", covered: /화재감시|소화기|가연성\s*가스/ },
      { text: "드럼·소형 탱크는 내부 잔류물 제거·세정 후 화기작업", check: "제거", ref: "KOSHA G-1-2023", when: /드럼|탱크|용기/, covered: /세정|잔류물/ },
    ],
    step: {
      name: "화기작업 전 가연물 제거·방화포 설치 및 가연성가스 측정",
      safe: "",
      hazards: [{ type: "화재/폭발", content: "용접 불티로 인한 주변 가연물 화재" }],
      before: /용접|용단|절단|그라인더|화기/,
      covered: /가연성\s*가스|방화포|가연물|화재감시/,
      ref: "KOSHA A-G-14-2026",
    },
  },
  {
    key: "power",
    label: "전기",
    desc: "전원 차단 · 판넬 · 모터 · 케이블 · 활선 근접",
    detect: /전기|전원|판넬|panel|분전반|수전반|차단기|케이블|cable|모터|motor|활선|배선|결선|MCC/i,
    attach: /전원|전기|판넬|panel|모터|motor|케이블|cable|결선|배선|분해|교체/i,
    measures: [
      { text: "전원 차단 후 검전기로 정전 확인, 차단기에 잠금장치·표지 부착 (LOTO)", check: "공학적", ref: "KOSHA B-E-10-2026", covered: /검전|LOTO|잠금|시건/i },
      { text: "절연장갑 등 절연용 보호구 착용, 활선 근접 시 절연용 방호구 설치", check: "보호구", ref: "KOSHA E-189-2022", covered: /절연/ },
    ],
    step: {
      name: "전원 차단·검전 및 잠금·표지 (LOTO)",
      safe: "",
      hazards: [{ type: "감전", content: "전원 미차단·오조작으로 인한 감전" }],
      before: /분해|해체|교체|철거|결선|배선|수리|정비/,
      covered: /차단|LOTO|잠금|시건|검전|정전/i,
      ref: "KOSHA B-M-25-2026",
    },
  },
  {
    key: "energy",
    label: "설비 정비",
    desc: "펌프 · 밸브 · 배관 · 교반기 등 분해 · 교체 · 청소",
    detect: /분해|해체|교체|정비|수리|보수|청소|개방|분리/,
    attach: /분해|해체|교체|개방|분리|정비|수리/,
    measures: [
      { text: "에너지원(전기·유압·공압·스팀) 차단 후 잠금·표지(LOTO), 잔류 에너지 방출 확인", check: "공학적", ref: "KOSHA B-M-25-2026", covered: /LOTO|잠금|시건|에너지\s*차단/i },
      {
        text: "배관·설비 개방 전 잔압 제거, 내부 물질 배출·세정, 필요 시 맹판으로 격리",
        check: "제거",
        ref: "KOSHA D-56-2016",
        when: /배관|밸브|펌프|pump|탱크|반응기|열교환기|라인|line/i,
        covered: /잔압|드레인|drain|배출|세정|퍼지|purge|맹판/i,
      },
      { text: "운전부서와 작업 범위·격리 상태 확인 후 작업허가", check: "관리적", ref: "KOSHA C-C-2-2025", covered: /운전부서|작업허가|허가서/ },
    ],
    step: {
      name: "에너지 차단·잠금(LOTO) 및 잔압·잔류물 제거 확인",
      safe: "",
      hazards: [
        { type: "끼임", content: "설비 불시 가동으로 인한 끼임" },
        { type: "누출", content: "잔압·잔류 물질 분출" },
      ],
      before: /분해|해체|교체|개방|분리/,
      covered: /차단|LOTO|잠금|시건|잔압|드레인|drain|배출|퍼지|purge|맹판/i,
      ref: "KOSHA B-M-25-2026",
    },
  },
  {
    key: "heavy",
    label: "중량물·인양",
    desc: "크레인 · 호이스트 · 체인블록 · 지게차 · 슬링",
    detect: /크레인|호이스트|체인\s*블록|인양|중량물|지게차|슬링|줄걸이|양중|하역|crane|hoist/i,
    attach: /인양|운반|하역|이동|들어|설치|반입|반출|적재/,
    measures: [
      {
        text: "인양 전 와이어로프·슬링·훅 해지장치 점검, 정격하중 확인",
        check: "관리적",
        ref: "KOSHA B-M-12-2025",
        when: /크레인|호이스트|체인\s*블록|인양|슬링|줄걸이|양중|crane|hoist/i,
        covered: /와이어|슬링|훅|줄걸이\s*점검/,
      },
      {
        text: "인양물 하부 출입통제, 신호수 배치 및 신호 통일",
        check: "관리적",
        ref: "KOSHA B-M-34-2026",
        when: /크레인|호이스트|인양|양중|crane|hoist/i,
        covered: /신호수|하부.*통제|출입\s*통제/,
      },
      {
        text: "이동식 크레인은 지반 확인 후 아웃트리거 완전 전개·받침목 설치",
        check: "공학적",
        ref: "KOSHA B-M-8-2025",
        when: /이동식\s*크레인|카고|크레인\s*차|기중기/,
        covered: /아웃트리거|받침/,
      },
      { text: "지게차 운행경로 확보·유도자 배치, 허용하중·화물 고정 확인", check: "관리적", ref: "KOSHA B-M-11-2025", when: /지게차/, covered: /유도자|운행\s*경로|허용\s*하중/ },
    ],
    step: {
      name: "인양 전 줄걸이 용구 점검 및 하부 출입통제·신호수 배치",
      safe: "",
      hazards: [{ type: "맞음", content: "줄걸이 불량·인양물 낙하로 인한 맞음" }],
      before: /인양|운반|하역|들어|양중/,
      covered: /슬링|와이어|줄걸이|신호수|출입\s*통제/,
      ref: "KOSHA B-M-12-2025",
    },
  },
  {
    key: "chem",
    label: "화학물질",
    desc: "질산 · 황산 · 과산화수소 · 가성소다 등 취급",
    detect: /질산|황산|염산|불산|과산화수소|H2O2|가성소다|NaOH|약품|산\s*\(|알칼리|용제|화학물질|HNO3|H2SO4|HCl/i,
    attach: /약품|투입|충전|하역|이송|배관|분리|개방|교체|분해|샘플/,
    measures: [
      { text: "취급 물질 MSDS 확인, 보안면·내산 장갑·화학보호복 등 내화학 보호구 착용", check: "보호구", ref: "KOSHA K-1-2023", covered: /MSDS|내산|보안면|화학\s*보호복/i },
      { text: "비상 샤워·세안설비 위치 확인, 흡착포·중화제 비치", check: "관리적", ref: "KOSHA D-55-2016", covered: /세안|샤워|흡착포|중화/ },
      { text: "과산화수소는 이물질·유기물·금속 접촉 금지 (분해·발열·폭발)", check: "관리적", ref: "KOSHA D-53-2013", when: /과산화수소|H2O2/i, covered: /이물질|유기물/ },
      {
        text: "산화성 물질(질산·과산화수소)은 가연물과 분리, 누출 시 가연물 접촉 방지",
        check: "관리적",
        ref: "KOSHA C-C-28-2026",
        when: /질산|과산화|HNO3|H2O2/i,
        covered: /산화성|가연물.*분리/,
      },
    ],
    step: {
      name: "작업 전 MSDS 확인 및 설비 내 약품 배출·세정",
      safe: "",
      hazards: [{ type: "누출", content: "잔류 약품 비산·접촉으로 인한 화학 화상" }],
      before: /분해|해체|교체|개방|분리|연결/,
      covered: /MSDS|배출|세정|드레인|drain|퍼지|purge|수세/i,
      ref: "KOSHA K-1-2023",
    },
  },
  {
    key: "excavation",
    label: "굴착",
    desc: "깊이 30cm 이상 땅파기",
    detect: /굴착|굴토|터파기|땅\s*파기/,
    attach: /굴착|굴토|터파기/,
    measures: [{ text: "굴착 전 지하매설물(전선·배관) 위치 확인, 굴착면 붕괴·토사 낙하 방지", check: "관리적", ref: "", covered: /매설물|붕괴|흙막이/ }],
    step: {
      name: "굴착 전 지하매설물 확인",
      safe: "",
      hazards: [{ type: "감전", content: "지하 매설 전선 손상으로 인한 감전" }],
      before: /굴착|굴토|터파기/,
      covered: /매설물/,
      ref: "",
    },
  },
  {
    key: "contractor",
    label: "협력업체",
    desc: "도급 · 협력업체 작업자 참여",
    detect: /협력업체|도급|외주|용역/,
    attach: /준비|교육|TBM|허가/,
    measures: [
      { text: "작업 전 협력업체 안전교육·TBM, 작업 구역·위험요인 공동 확인", check: "관리적", ref: "KOSHA C-C-50-2026", covered: /TBM|안전교육|협력업체/ },
      { text: "안전작업허가서 발행 후 작업, 작업 중 관리감독자 입회", check: "관리적", ref: "KOSHA C-C-49-2026", covered: /작업허가|허가서|입회/ },
    ],
  },
];

export const conditionByKey = (k: string) => WORK_CONDITIONS.find((c) => c.key === k);

// 고른 칩 + 글에서 찾은 조건 (화면에 "자동 감지" 로 함께 보여 줌)
export function detectConditions(text: string, chosen: string[]) {
  const picked = new Set(chosen.filter((k) => conditionByKey(k)));
  const auto = WORK_CONDITIONS.filter((c) => !picked.has(c.key) && c.detect.test(text)).map((c) => c.key);
  return { picked: [...picked], auto, all: [...picked, ...auto] };
}
