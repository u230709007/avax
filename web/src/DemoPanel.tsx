// docs: docs/accounts.md
import { useState } from "react";
import { Shell, type Page } from "./components/Shell";
import { GridBackground } from "./components/GridBackground";
import { Button, Card, Empty, Mono, Badge } from "./components/ui";
import { Overview } from "./pages/Overview";
import { Decisions } from "./pages/Decisions";
import type { State } from "./store";
const ts = Date.UTC(2026,9,17,9);
const bills = [9700,9820,9760,9940,10000,10120,10080,10240].map((bal,i)=>({ts:ts-(7-i)*86400000,bal}));
const state: State = {
 wsOpen:false,agentBusy:false,approvals:[],anchors:[],chat:[],pendingTraffic:[],
 portfolio:{volume24h:120,limit24h:500,snapshot:{ts,totalEqUsd:10240,dayStartEqUsd:10000,dailyPnlPct:2.4,holdings:[{ccy:"USDT",eq:8240,avail:8240,eqUsd:8240},{ccy:"AVAX",eq:100,avail:100,eqUsd:2000}],positions:[]}},
 decisions:[
 {seq:3,ts,source:"llm",tool:"propose_trade",input:{pair:"P_AVAX",market:"spot",side:"buy",size_pct:20},outcome:"REJECTED",code:"DEMO_LIMIT_EXCEEDED",detail:{rules:[{rule:"Örnek işlem limiti",ok:false,detail:"İstek örnek limiti aşıyor."}]},prevHash:"demo-previous",hash:"demo-record-3"},
 {seq:2,ts:ts-60000,source:"llm",tool:"propose_trade",input:{pair:"P_AVAX",market:"spot",side:"buy",size_pct:1,sl_pct:3},outcome:"PENDING_APPROVAL",code:"DEMO_REVIEW",detail:{rules:[{rule:"Örnek limit kontrolü",ok:true}]},prevHash:"demo-previous",hash:"demo-record-2"},
 {seq:1,ts:ts-120000,source:"llm",tool:"get_portfolio",input:{},outcome:"OK",code:"DEMO_MASKED",detail:{text:"Ajan yalnızca maskeli bağlamı görür."},prevHash:"demo-previous",hash:"demo-record-1"}
 ]
};
export function DemoPanel({onBack,onLogin}:{onBack:()=>void;onLogin:()=>void}) {
 const [page,setPage]=useState<Page>("overview");
 return <><GridBackground/><div className="relative z-10"><Shell state={state} page={page} setPage={setPage} demo><div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-4"><Badge tone="idle">Ziyaretçi demosu</Badge><p className="mr-auto text-xs text-muted">Tüm tutarlar ve kayıtlar örnektir. Canlı hesaba bağlı değildir.</p><Button onClick={onBack}>Tanıtıma dön</Button><Button onClick={onLogin}>Giriş yap</Button></div>
 {page==="overview"&&<Overview state={state} demoBills={bills} goDecisions={()=>setPage("decisions")}/>}
 {page==="decisions"&&<Decisions state={state} readOnly/>}
 {page==="chat"&&<div className="grid gap-6 xl:grid-cols-[2fr_1fr]"><Card title="Ajan sohbeti · örnek"><div className="flex flex-col gap-5 p-5"><div><div className="label mb-2">Sen</div><p className="text-sm">Bakiyemin %1'i ile AVAX al, stop-loss %3.</p></div><div className="border-t border-line pt-5"><div className="label mb-2">Ajan · örnek yanıt</div><p className="text-sm text-muted">Öneri Guardian denetimine iletildi. Bu örnekte insan onayı bekleniyor.</p></div><textarea disabled className="min-h-24 rounded border border-line bg-bg p-3 text-sm" placeholder="Demo modunda mesaj gönderilemez."/><Button disabled>Gönder</Button></div></Card><Card title="LLM'e giden · örnek"><div className="p-5"><Mono>P_AVAX · size_pct: 1 · sl_pct: 3</Mono><p className="mt-4 text-sm text-muted">Gerçek hesap tutarları ajana iletilmez.</p></div></Card><Card title="Onay bekleyen · örnek"><div className="flex flex-wrap items-center gap-3 p-5"><span className="mr-auto text-sm">AVAX / spot / alış</span><Button disabled>Onayla</Button><Button disabled>Reddet</Button></div></Card></div>}
 {page==="audit"&&<div className="flex flex-col gap-6"><Card title="Avalanche anchor kayıtları" action={<Button disabled>Şimdi zincire yaz</Button>}><Empty>Demo kayıtları zincire yazılmaz; gerçek işlem hash'i yok.</Empty></Card><Card title="Doğrulama akışı"><ol className="list-decimal space-y-3 px-9 py-5 text-sm text-muted"><li>Guardian kararının denetim kaydı oluşturulur.</li><li>Kayıtların Merkle kökü Avalanche Fuji'ye yazılır.</li><li>Gerçek panelde kararın zincir kanıtı doğrulanır.</li></ol></Card></div>}
 {page==="connect"&&<div className="grid gap-6 xl:grid-cols-2"><Card title="Bağlantı adresi" action={<Badge tone="idle">Demo · bağlı değil</Badge>}><div className="p-5 text-sm text-muted">Kendi ajanını Guardian'ın MCP adresine bağlayabilirsin. Gerçek adres ve anahtar yönetici panelinde gösterilir.</div></Card><Card title="Ajan anahtarı oluştur"><div className="flex flex-col gap-4 p-5"><label className="label" htmlFor="demo-agent">Ajan adı</label><input id="demo-agent" disabled placeholder="Örnek: Piyasa ajanım" className="rounded border border-line bg-bg p-3 text-sm"/><Button disabled>Anahtar oluştur</Button><p className="text-xs text-muted">Ziyaretçi demosu erişim anahtarı üretmez.</p></div></Card></div>}
 {page==="security"&&<Card title="Güvenlik testleri"><Empty>Ziyaretçi demosunda canlı test raporu yüklenmez. Gerçek sonuçlar yönetici panelinde görüntülenir.</Empty></Card>}
 {page==="settings"&&<div className="grid gap-6 xl:grid-cols-2"><Card title="Otonom mod"><div className="flex items-center justify-between gap-4 p-5"><span className="text-sm text-muted">Demo modunda kapalı</span><Button disabled>Etkinleştir</Button></div><div className="px-5 pb-5"><Button disabled>Şimdi bir tur çalıştır</Button></div></Card><Card title="Bağlantı durumu"><div className="flex flex-col gap-4 p-5 text-sm"><p>OKX ATK <Badge tone="idle">Bağlı değil</Badge></p><p>Avalanche Fuji <Badge tone="idle">Bağlı değil</Badge></p><p className="text-muted">Bu ekran yalnızca arayüz önizlemesidir.</p></div></Card><Card title="Politika · örnek"><div className="space-y-3 p-5 text-sm text-muted"><p>İzinli varlık: AVAX</p><p>24 saatlik örnek işlem limiti: 500 USDT</p><p>İnsan onayı: gerektiğinde</p><p>Gerçek politika yönetici panelinden okunur.</p></div></Card></div>}
 </Shell></div></>;
}

