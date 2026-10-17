// docs: docs/ui.md
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, ShieldCheck, GitBranch, LockKeyhole, Pause, Play, X } from "lucide-react";
import type { Page } from "./components/Shell";
import "./landing.css";
import { SecurityTests } from "./pages/SecurityTests";

const features = [
  { title: "Verin sana ait.", label: "01 / MASKELİ BAĞLAM", text: "Ajanın karar vermek için gereken bağlamı görür. Gerçek bakiye, adres ve emir kimlikleri maskeli kalır.", media: "masking", code: "PRIVATE DATA → MASKED CONTEXT" },
  { title: "Her isteğe bir sınır.", label: "02 / KURAL MOTORU", text: "İşlem büyüklüğü, kaldıraç ve zarar sınırları. Modelin önerisi, belirlediğin kurallardan geçer.", media: "detail", code: "INTENT → POLICY → DECISION" },
  { title: "Kontrol sende.", label: "03 / ONAY & DURDURMA", text: "Onay gerektiren işlemleri panelden değerlendir. Gerektiğinde zincir üzerindeki durdurma mekanizmasını kullan.", media: "control", code: "REVIEW → APPROVE / REJECT" },
  { title: "Kararın bir izi var.", label: "04 / AVALANCHE KANITI", text: "Kararlar denetim zincirine kaydedilir. Avalanche Fuji üzerindeki kayıtlarla kanıtları doğrula.", media: "proof", code: "DECISION → AUDIT → ONCHAIN PROOF" },
];
const steps = [
  ["İstek", "Ajan bir niyet oluşturur.", "Ajan, yapmak istediği işlemi MCP üzerinden Guardian'a iletir.", "AGENT → MCP"],
  ["Kontrol", "Guardian kuralları uygular.", "İzin verilen varlıklar, işlem limitleri ve risk koşulları değerlendirilir. Uygun olmayan istek reddedilir.", "POLICY CHECK"],
  ["Onay", "Gerektiğinde son söz sende.", "İnsan onayı gerektiren istek panelde bekler. Ajan kendi isteğini onaylayamaz.", "HUMAN REVIEW"],
  ["İşlem", "İzin verilen emir iletilir.", "Guardian emri oluşturur ve OKX Agent Trade Kit üzerinden demo işlem ortamına gönderir.", "GUARDIAN → ATK"],
  ["Kanıt", "Karar izlenebilir kalır.", "Denetim kaydı oluşturulur; ilgili Merkle kökü Avalanche Fuji'ye yazıldığında zincir üzerinde doğrulanabilir.", "AUDIT → AVALANCHE"],
];
export function Landing({ onLogin, onSecurity }: { onLogin: (page: Page) => void; onSecurity: () => void }) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.querySelectorAll("video").forEach(v => { if (paused) v.pause(); else void v.play().catch(() => {}); });
  }, [paused]);
  return <div className="landing" ref={root}>
    <a className="lp-skip" href="#intro">İçeriğe geç</a>
    <header className="lp-nav"><a href="#" className="lp-brand"><ShieldCheck /> GUARDIAN<span>SEALED INTENT</span></a><nav aria-label="Ana menü"><a href="#protection">Koruma</a><a href="#workflow">Nasıl çalışır?</a><a href="#connect">MCP</a><a href="#security">Güvenlik testleri</a></nav><button className="lp-button light" onClick={() => onLogin("overview")}>Panele giriş <ArrowUpRight size={16}/></button></header>
    <main>
      <section className="lp-hero" id="intro">
        <video className="lp-hero-video" autoPlay={!paused} muted loop playsInline poster="/media/hero-poster.jpg" aria-hidden="true"><source src="/media/hero.mp4" type="video/mp4"/></video><div className="lp-shade"/>
        <div className="lp-hero-content"><span className="lp-eyebrow">AGENT ÖZGÜRLÜĞÜ. TANIMLI SINIRLAR.</span><h1>Ajanın düşünsün.<br/>Guardian<br/><span>sınırları korusun.</span></h1><p>Yapay zekâ ajanı ile işlem arasında bir güvenlik katmanı. MCP ile bağlan, kurallarını uygula, kararların izini Avalanche üzerinde doğrula.</p><div className="lp-actions"><button className="lp-button light" onClick={() => onLogin("connect")}>MCP ile bağlan <ArrowUpRight size={17}/></button><a className="lp-button" href="#security">Gerçek test sonuçları <ArrowDown size={17}/></a></div></div>
        <div className="lp-hero-foot"><span>LLM → MCP → GUARDIAN → ATK</span><button onClick={() => setPaused(!paused)} aria-label={paused ? "Videoları oynat" : "Videoları duraklat"}>{paused ? <Play size={15}/> : <Pause size={15}/>} {paused ? "Oynat" : "Duraklat"}</button></div>
      </section>
      <div className="lp-strip"><span>MCP <b>BAĞLANTI</b></span><span>GUARDIAN <b>KURAL DENETİMİ</b></span><span>OKX ATK <b>DEMO İŞLEM</b></span><span>AVALANCHE FUJI <b>DENETİM KANITI</b></span></div>
      <section className="lp-section" id="protection"><div className="lp-heading"><span className="lp-eyebrow">01 / KORUMA KATMANI</span><h2>Akıllı ajanlar.<br/><span>Net sınırlar.</span></h2><p>Karar verebilen bir ajan için,<br/>kontrol edilebilir bir işlem alanı.</p></div><div className="lp-features">{features.map((f,i) => <article className={`lp-feature feature-${i}`} key={f.title}><video muted autoPlay={!paused} loop playsInline preload="none" poster={`/media/${f.media}-poster.jpg`} aria-hidden="true"><source src={`/media/${f.media}.mp4`} type="video/mp4"/></video><div className="lp-feature-copy"><span className="lp-eyebrow">{f.label}</span><h3>{f.title}</h3><p>{f.text}</p></div><span className="lp-code">{f.code} <span>_</span></span></article>)}</div></section>
      <section className="lp-section" id="workflow"><div className="lp-heading"><span className="lp-eyebrow">02 / BİR İSTEĞİN YOLCULUĞU</span><h2>Üç rol.<br/><span>Kontrollü bir akış.</span></h2></div><div className="lp-explain"><p><b>Ajan nedir?</b> İsteğini yorumlayıp araçları kullanabilen yapay zekâ yazılımı. <b>MCP</b>, bu ajan ile araçların konuşmasını sağlayan bağlantı protokolüdür. <b>Guardian</b> ise bu bağlantıda işlem isteklerini kurallara göre denetler.</p></div>
<div className="lp-flowboard" aria-label="Doğrudan bağlantı ve Guardian akışı karşılaştırması">
  <div className="lp-flow-label"><span className="lp-eyebrow">DOĞRUDAN BAĞLANTI</span><p>Ajanın isteği, bağlı olduğu işlem aracına gider.</p></div>
  <div className="lp-flow-row"><div className="lp-node"><span>01</span><b>Sen</b><small>Hedefi belirle</small></div><div className="lp-edge">İstek<ArrowRight/></div><div className="lp-node"><span>02</span><b>Agent / LLM</b><small>Yorumla ve karar ver</small></div><div className="lp-edge">MCP<ArrowRight/></div><div className="lp-node"><span>03</span><b>İşlem aracı</b><small>Kendi kontrolleriyle yürüt</small></div></div>
  <div className="lp-flow-label guarded"><span className="lp-eyebrow">GUARDIAN İLE</span><p>İşlemden önce bağımsız bir kural denetimi.</p></div>
  <div className="lp-flow-row protected"><div className="lp-node"><span>01</span><b>Sen</b><small>Hedefi belirle</small></div><div className="lp-edge">İstek<ArrowRight/></div><div className="lp-node"><span>02</span><b>Agent / LLM</b><small>İşlem öner</small></div><div className="lp-edge">MCP<ArrowRight/></div><div className="lp-node guardian"><ShieldCheck size={22}/><b>Guardian</b><small>Maskele · denetle · kaydet</small></div><div className="lp-edge">İzinli emir<ArrowRight/></div><div className="lp-node"><span>04</span><b>OKX / ATK</b><small>Demo işlemi yürüt</small></div></div>
  <div className="lp-branches"><div><span>↳ KURALA AYKIRI</span><b>İstek reddedilir</b><small>Emir ATK'ya gönderilmez.</small></div><div><span>↳ ONAY GEREKLİ</span><b>Senin kararın beklenir</b><small>Onaydan sonra yürütme koşulları sağlanmalıdır.</small></div><div><span>↳ DENETİM İZİ</span><b>Avalanche Fuji</b><small>Kural hash'i ve zincire yazılan denetim kanıtları.</small></div></div>
</div><div className="lp-comparison">
  <article><span className="lp-eyebrow">DOĞRUDAN ARAÇ BAĞLANTISI</span><h3>Ajan → işlem aracı</h3><p>Kullanıcı bir hedef verir. Ajan haberleri ve verileri okur, bir işlem seçer ve bağlı olduğu araca gönderir.</p><ol><li>Sen: “AVAX piyasasını takip et.”</li><li>Ajan: Verileri oku, işlemi planla.</li><li>İşlem aracı: Yetkiler ve kendi kontrolleri kapsamında emri yürüt.</li></ol><div className="lp-compare-note">Risk: Dış içerikteki yanıltıcı bir talimat ajanın kararını etkileyebilir. Sonuç, ajana verilen yetkilere ve aracın mevcut kontrollerine bağlıdır.</div></article>
  <article className="lp-guarded"><span className="lp-eyebrow">GUARDIAN İLE</span><h3>Ajan → Guardian → işlem aracı</h3><p>Ajan işlem önerir. Guardian, modelden bağımsız kod kurallarıyla bu isteğin izin verilen sınırlar içinde olup olmadığını kontrol eder.</p><ol><li>Ajan: MCP üzerinden işlem niyetini ilet.</li><li>Guardian: Veriyi maskele; varlık, tutar ve risk sınırlarını kontrol et.</li><li>Gerekirse sen: Panelden onayla veya reddet.</li><li>Guardian: Uygun emri ATK'ya ilet, kararı kaydet.</li></ol><div className="lp-compare-note">Örnek: Ajan izin verilen limiti aşan bir işlem istese bile Guardian isteği reddeder. Onay, kural ihlalini geçerli hale getirmez.</div></article>
</div><p className="lp-explain-foot">Avalanche işlemi yapan borsa değildir. Bu sistemde kural hash'i, durdurma durumu ve denetim kanıtları için kullanılır. İşlem tarafı OKX ATK demo ortamıdır.</p><div className="lp-roles">{[{n:"01",name:"Agent / LLM",sub:"NİYETİ OLUŞTURUR",text:"Bağlamı okur, strateji geliştirir ve işlem önerir. Guardian'a MCP üzerinden bağlanır."},{n:"02",name:"Guardian",sub:"KURALLARI UYGULAR",text:"İsteği denetler, hassas veriyi maskeler ve gerekli onayı bekler. İzin verilen emri oluşturur."},{n:"03",name:"OKX / ATK",sub:"İŞLEMİ YÜRÜTÜR",text:"Guardian'ın izin verdiği emir, Agent Trade Kit üzerinden OKX demo ortamına ulaşır."}].map(r => <article key={r.n}><span className="lp-role-num">{r.n}<ArrowRight/></span><h3>{r.name}</h3><span className="lp-eyebrow">{r.sub}</span><p>{r.text}</p></article>)}</div><div className="lp-proof"><GitBranch size={18}/><span><b>Avalanche Fuji</b> · Kural hash'i, durdurma durumu ve denetim kanıtları.</span></div>
      <div className="lp-how"><h3>HOW IT WORKS</h3><div className="lp-timeline" aria-label="İşlem adımları">{steps.map((s,i) => <button key={s[0]} aria-pressed={step===i} className={step===i ? "selected" : ""} onClick={() => setStep(i)}><span className="lp-dot"/><small>0{i+1}</small>{s[0]}</button>)}</div><div className="lp-step" aria-live="polite"><div><span className="lp-eyebrow">0{step+1} / {steps[step][3]}</span><h4>{steps[step][1]}</h4><p>{steps[step][2]}</p></div><span className="lp-step-num">0{step+1}</span></div></div></section>
      <section className="lp-section" id="security" aria-label="Güvenlik testleri"><div className="lp-heading"><span className="lp-eyebrow">03 / GERÇEK TEST SONUÇLARI</span><h2>Güvenlik testleri.<br/><span>Kararların izini sür.</span></h2></div><SecurityTests /></section>
      <section className="lp-section lp-connect" id="connect"><div className="lp-heading"><span className="lp-eyebrow">04 / BAĞLAN VE YÖNET</span><h2>Senin ajanın.<br/><span>Senin Guardian'ın.</span></h2></div><div className="lp-entry-grid"><button className="lp-entry primary" onClick={() => onLogin("connect")}><span className="lp-eyebrow">GELİŞTİRİCİLER & AJANLAR</span><h3>MCP ile bağlan.</h3><p>Ajanını Guardian'ın MCP kapısına bağla. Bağlantı adresini ve ajan anahtarlarını panelden yönet.</p><div><span>MCP bağlantısını aç<small>BAĞLA · SINIRLA · DOĞRULA</small></span><ArrowUpRight/></div></button><button className="lp-entry" onClick={() => onLogin("overview")}><span className="lp-eyebrow">KONTROL PANELİ</span><h3>Kontrolü elinde tut.</h3><p>UI token'ınla giriş yap. Kararları incele, onayları yönet ve zincir üzerindeki kanıtları takip et.</p><div><span>Panele giriş yap<small>İNCELE · ONAYLA · TAKİP ET</small></span><ArrowUpRight/></div></button></div></section>
    </main><footer className="lp-footer"><a href="#" className="lp-brand"><ShieldCheck/> GUARDIAN</a><span>Sealed Intent Guardian · OKX ATK × Avalanche</span><a href="#intro">Başa dön ↑</a></footer>
  </div>;
}

export function LoginDialog({ onClose, onSubmit, busy, error }: { onClose: () => void; onSubmit: (token: string) => void; busy: boolean; error: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [token, setToken] = useState("");
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => { el?.close(); }; }, []);
  return <dialog className="lp-dialog" ref={dialog} onCancel={e => { e.preventDefault(); onClose(); }}><button className="lp-close" aria-label="Kapat" onClick={onClose}><X/></button><LockKeyhole size={30}/><span className="lp-eyebrow">GUARDIAN / YÖNETİCİ ERİŞİMİ</span><h2>Kontrol sende.</h2><p>Yönetici paneli için arayüz erişim token'ını gir.</p><form onSubmit={e => { e.preventDefault(); onSubmit(token.trim()); }}><label htmlFor="guardian-token">UI token</label><input id="guardian-token" type="password" autoFocus autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Erişim token'ını gir" required disabled={busy}/>{error && <p role="alert" className="lp-login-error">{error}</p>}<button className="lp-button light" disabled={busy || token.trim().length < 16}>{busy ? "Doğrulanıyor…" : "Panele giriş yap"}<ArrowRight size={16}/></button></form></dialog>;
}




