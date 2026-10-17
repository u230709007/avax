import { useEffect, useState } from "react";
import { ArrowRight, Bot, FileWarning, ShieldCheck, Wallet, RefreshCw } from "lucide-react";
import type { Assessment, SecurityReport } from "../../../src/service/securityTypes";
import { Badge, Button, Card, Metric } from "../components/ui";
import { fmtDateTime } from "../format";
import { guardianUrl } from "../guardianUrl";

const labels: Record<Assessment, { label: string; tone: "ok" | "warn" | "bad" | "idle"; description: string }> = {
  blocked: { label: "Politika reddi", tone: "ok", description: "Guardian bu isteği belirtilen politika kuralıyla reddetti. Bu kayıt, bağımsız OKX emir geçmişi kontrolü içermez." },
  approval: { label: "İnsan onayı", tone: "warn", description: "İstek otomatik yürütülmek yerine kullanıcı onayına alındı. Sonraki onay ve yürütme sonucu bu koşuda izlenmiyor." },
  content: { label: "İçerik tarandı", tone: "idle", description: "Sayfa okunup karantina özeti üretildi. İçerik taraması, bir para hareketinin engellendiğinin kanıtı değildir." },
  inconclusive: { label: "Sonuç belirsiz", tone: "warn", description: "Bağlantı, veri, sinyal veya tanınmayan sonuç nedeniyle güvenlik başarısı çıkarılamaz. Ret kodunu ve koşu ortamını inceleyin." },
  allowed: { label: "İzin verildi", tone: "bad", description: "Guardian isteğe izin verdi. Saldırı senaryosunda bu sonuç incelenmeli; borsadaki gerçekleşme bu raporda doğrulanmıyor." },
};

export function SecurityTests() {
  const [report, setReport] = useState<SecurityReport>();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(0);
  const [filter, setFilter] = useState("all");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError(false);
    void fetch(guardianUrl("/security-tests.json"), { signal: controller.signal, cache: "no-store" })
      .then(async res => {
        if (!res.ok) throw new Error("fetch");
        const data = await res.json() as SecurityReport;
        if (!["ready", "missing", "invalid"].includes(data.state)) throw new Error("format");
        if (!controller.signal.aborted) { setReport(data); setSelected(0); }
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [revision]);
  const run = report?.run;
  const rows = run?.rows ?? [];
  const visible = rows.filter(r => filter === "all" || r.assessment === filter);
  const row = visible.find(r => r.id === selected) ?? visible[0];
  const decision = row ? labels[row.assessment] : undefined;
  const count = (a: Assessment) => rows.filter(r => r.assessment === a).length;

  return <div className="space-y-6" id="security-tests">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2"><Badge tone="idle">OKX demo · kayıtlı koşu</Badge><Badge tone="idle">Salt okunur</Badge></div>
      <Button disabled={busy} onClick={() => setRevision(v => v + 1)}><RefreshCw size={14}/>{busy ? "Yükleniyor…" : "Sonuçları yenile"}</Button>
    </div>
    <Card><div className="p-5 sm:p-7">
      <div className="label">SALDIRI → KARAR → KANIT</div>
      <h2 className="display mt-3 text-2xl sm:text-4xl">Ajan kandırıldığında<br/><span className="text-muted">Guardian ne yaptı?</span></h2>
      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted">Gerçek guardian'a gönderilen saldırı isteklerinin son kayıtlı sonuçları. Bu koşu, LLM kandırılmış varsayımıyla doğrudan istek gönderir; bir LLM'in gerçekten kandırıldığını veya MCP uçtan uca testini kanıtlamaz.</p>
      {run && <p className="mt-4 text-xs text-muted">Koşu: {fmtDateTime(run.ts)} · Policy v{run.policyVersion} · Kaynak: attack-replay.json</p>}
    </div></Card>
    <div aria-live="polite">
      {error && <p role="alert" className="rounded-xl border border-line p-4 text-sm">Sonuçlar alınamadı. {run ? "Aşağıdaki veriler son başarılı yüklemeden kalmıştır." : "Guardian sunucusunun erişilebilir olduğunu kontrol edin."}</p>}
      {!error && !report && <p className="p-4 text-sm text-muted">Kayıtlı koşu yükleniyor…</p>}
      {report?.state === "missing" && <Card><div className="p-6"><h3 className="font-semibold">Henüz gerçek test kaydı yok</h3><p className="mt-2 text-sm text-muted">Bir saldırı koşusu kaydedildiğinde sonuçlar burada görünecek. Örnek başarı verisi gösterilmez.</p></div></Card>}
      {report?.state === "invalid" && <p role="alert" className="rounded-xl border border-line p-5">Koşu dosyası okunamadı veya biçimi geçersiz. Sonuçlar doğrulanamıyor.</p>}
      {run && run.policyVersion !== report?.currentPolicyVersion && <p className="mt-3 rounded-xl border border-line p-4 text-sm">Bu koşu eski bir politikaya ait. Güncel politika: v{report?.currentPolicyVersion}. Yeni kuralların testi olarak kullanılamaz.</p>}
    </div>
    {run && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Politika reddi" value={count("blocked")} hint="Kural nedeniyle reddedilen istek"/>
        <Metric label="İnsan onayı" value={count("approval")} hint="Otomatik yürütülmeyen istek"/>
        <Metric label="Belirsiz" value={count("inconclusive")} hint="Güvenlik başarısı sayılmaz"/>
        <Metric label="İzin verilen" value={count("allowed")} hint="İncelenmesi gereken sonuç"/>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card title={`${rows.length} kayıt · Senaryoyu seç`}>
          <div className="border-b border-line p-4"><label className="text-xs text-muted" htmlFor="security-filter">Sonuca göre filtrele</label><select id="security-filter" value={filter} onChange={e => setFilter(e.target.value)} className="mt-2 w-full rounded-lg border border-line bg-bg p-2 text-sm"><option value="all">Tüm sonuçlar</option>{Object.entries(labels).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></div>
          <div className="max-h-[520px] overflow-y-auto">{visible.length === 0 ? <p className="p-5 text-sm text-muted">Bu filtrede kayıt yok.</p> : visible.map(r => <button key={r.id} aria-pressed={row?.id === r.id} onClick={() => setSelected(r.id)} className={`block w-full border-b border-line p-4 text-left last:border-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${row?.id === r.id ? "bg-accent-soft" : "hover:bg-surface-muted"}`}><span className="text-xs text-muted">{String(r.id + 1).padStart(2, "0")} / {r.group}</span><span className="my-2 block text-sm font-medium">{r.name}</span><Badge tone={labels[r.assessment].tone}>{labels[r.assessment].label}</Badge></button>)}</div>
        </Card>
        <Card title="Seçilen senaryonun akışı">
          {row && decision ? <div className="space-y-5 p-5">
            <h3 className="text-xl font-semibold">{row.name}</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { Icon: FileWarning, title: "01 · Saldırı girdisi", text: row.group },
                { Icon: Bot, title: "02 · Agent / LLM", text: "Kandırılmış varsayılıyor; istek doğrudan gönderildi." },
                { Icon: ShieldCheck, title: "03 · Guardian", text: decision.label },
                { Icon: Wallet, title: "04 · ATK / OKX", text: "Borsa sonucu ölçülmedi." },
              ].map(({ Icon, title, text }, i) => <div key={title} className={`min-w-0 rounded-xl border p-4 ${i === 2 ? "border-accent-line bg-accent-soft" : "border-line"}`}><div className="flex items-center justify-between"><Icon size={20}/>{i < 3 && <ArrowRight size={14} className="text-muted"/>}</div><div className="mt-3 text-sm font-semibold">{title}</div><div className="mt-2 text-xs leading-relaxed text-muted">{text}</div></div>)}
            </div>
            <div><div className="label">Kaydedilen sonuç / kod</div><code className="mt-2 block break-all rounded-lg border border-line bg-bg p-3 text-xs">{row.status} / {row.code}</code></div>
            <p className="text-sm leading-relaxed text-muted">{decision.description}</p>
          </div> : <p className="p-5 text-sm text-muted">Akışı görmek için bir senaryo seçin.</p>}
        </Card>
      </div>
    </>}
    <Card title="Bu ekran neyi kanıtlar?"><div className="grid gap-5 p-5 sm:grid-cols-2"><div><h3 className="text-sm font-semibold">Guardian'ın kaydedilen kararı</h3><p className="mt-2 text-sm leading-relaxed text-muted">Senaryo, ret kodu, onay gereksinimi ve koşu zamanı gösterilir. İçerik taramaları ve altyapı hataları başarılı engelleme sayısına eklenmez.</p></div><div><h3 className="text-sm font-semibold">Henüz ölçülmeyenler</h3><p className="mt-2 text-sm leading-relaxed text-muted">ATK yazma çağrıları, bağımsız OKX emir geçmişi ve gerçek LLM saldırı başarısı bu raporda yok. Akış bu sınırları gösterir; para güvenliği garantisi vermez.</p></div></div></Card>
  </div>;
}
