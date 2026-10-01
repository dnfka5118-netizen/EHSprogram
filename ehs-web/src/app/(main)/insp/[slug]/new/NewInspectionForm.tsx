"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInspectionWithFindings } from "../../actions";
import { uploadPhotos, removePhotos } from "@/lib/upload";
import { Button, Card, Field, FormMessage, Input, Select, Textarea } from "@/components/ui";
import { FindingFields, draftError, draftPayload, emptyDraft, type FindingDraft, type LocationWithSubs } from "../../FindingFields";
import type { ActionState, Department, FindingType, Site } from "@/lib/types";
import { ParticipantPicker, type Person } from "./ParticipantPicker";

// 점검 등록 : 점검 정보 + 지적사항 여러 건을 한 화면에서 입력하고 한 번에 저장
export function NewInspectionForm({ slug, moduleCode, moduleName, sites, defaultSite, today, people, inspector, locations, types, departments }: {
  slug: string;
  moduleCode: string;
  moduleName: string;
  sites: Site[];
  defaultSite: string;
  today: string;
  people: Person[];
  inspector: string;
  locations: LocationWithSubs[];
  types: FindingType[];
  departments: Department[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>();
  const [progress, setProgress] = useState("");
  const [site, setSite] = useState(defaultSite);
  const [date, setDate] = useState(today);
  const [drafts, setDrafts] = useState<FindingDraft[]>(() => [emptyDraft()]);
  const [y, m] = date.split("-");
  const autoTitle = y && m ? `${y}년 ${Number(m)}월 ${moduleName}` : moduleName;

  const siteLocations = locations.filter((l) => l.site_id === site);
  const siteDepts = departments.filter((d) => d.site_id === site);

  const patch = (key: string, p: Partial<FindingDraft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));
  const add = () => {
    setDrafts((ds) => [...ds, emptyDraft(ds.at(-1))]); // 같은 장소·부서에서 이어서 입력하는 경우가 많아 이전 건 값을 이어받음
    setTimeout(() => document.getElementById("finding-last")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const remove = (key: string) => setDrafts((ds) => ds.filter((d) => d.key !== key));
  const changeSite = (id: string) => {
    setSite(id);
    // 장소·부서는 사업장마다 다르므로 비움
    setDrafts((ds) => ds.map((d) => ({ ...d, locationId: "", subId: "", subText: "", deptId: "" })));
  };

  function submit() {
    setState(undefined);
    const form = formRef.current;
    if (!form?.reportValidity()) return;
    for (const [i, d] of drafts.entries()) {
      const err = draftError(d);
      if (err) {
        document.getElementById(`finding-${d.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        return setState({ error: `지적사항 ${i + 1}번 : ${err}` });
      }
    }
    if (drafts.length === 0 && !confirm("지적사항 없이 점검만 등록할까요?")) return;
    const fd = new FormData(form);

    start(async () => {
      const uploaded: string[] = [];
      const payload = [];
      try {
        for (const [i, d] of drafts.entries()) {
          setProgress(`사진 올리는 중 (${i + 1}/${drafts.length})`);
          const paths = await uploadPhotos(d.key, "before", d.photos);
          uploaded.push(...paths);
          payload.push(draftPayload(d, paths));
        }
      } catch (e) {
        await removePhotos(uploaded);
        setProgress("");
        return setState({ error: (e as Error).message });
      }
      setProgress("저장 중…");
      const result = await createInspectionWithFindings({
        module: moduleCode,
        site,
        date,
        title: String(fd.get("title") ?? ""),
        inspectors: String(fd.get("inspectors") ?? ""),
        note: String(fd.get("note") ?? ""),
        findings: payload,
      });
      if ("error" in result) {
        await removePhotos(uploaded);
        setProgress("");
        return setState({ error: result.error });
      }
      router.push(`/insp/${slug}/${result.id}`);
    });
  }

  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-4">
      <Card title={`${moduleName} · 점검 정보`}>
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="사업장" required>
              <Select value={site} onChange={(e) => changeSite(e.target.value)} required>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="점검일" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
          </div>
          <Field label="점검명" required>
            <Input name="title" key={autoTitle} defaultValue={autoTitle} required />
          </Field>
          <Field label="점검자" hint="점검 종류에 따라 자동으로 정해집니다">
            <Input value={inspector} readOnly disabled className="bg-gray-100 text-gray-700" />
          </Field>
          <ParticipantPicker people={people} name="inspectors" />
          <Field label="비고">
            <Textarea name="note" rows={2} />
          </Field>
        </div>
      </Card>

      {drafts.map((d, i) => (
        <div key={d.key} id={i === drafts.length - 1 ? "finding-last" : undefined} className="scroll-mt-20">
          <Card
            title={
              <span id={`finding-${d.key}`} className="scroll-mt-20">
                지적사항 {i + 1}
              </span>
            }
            actions={
              <button type="button" onClick={() => remove(d.key)} className="text-sm text-red-600 hover:underline">
                이 지적사항 빼기
              </button>
            }
          >
            <FindingFields value={d} onPatch={(p) => patch(d.key, p)} locations={siteLocations} types={types} departments={siteDepts} />
          </Card>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="w-full rounded-lg border-2 border-dashed border-brand-300 bg-white py-3 text-sm font-medium text-brand-800 hover:bg-brand-50"
      >
        ＋ 지적사항 추가
      </button>

      <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
        <FormMessage state={state} />
        <Button type="submit" disabled={pending} className="w-full py-3 text-base">
          {pending ? progress || "저장 중…" : drafts.length ? `점검 + 지적사항 ${drafts.length}건 등록` : "점검만 등록 (지적사항 없음)"}
        </Button>
      </div>
    </form>
  );
}
