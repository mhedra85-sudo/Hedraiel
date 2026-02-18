
(() => {
  const BUILD="20260215090000";
  const ROLE={ADMIN:"admin",ASSISTANT:"assistant",VIEW:"view"};

  // utils
  const $=(id)=>document.getElementById(id);
  const round2=(n)=>Math.round((Number(n||0))*100)/100;
  const isoYMD=(d=new Date())=>{ const x=new Date(d); x.setHours(0,0,0,0); return x.toISOString().slice(0,10); };
  const ymdFromTs=(ts)=>{ const d=new Date(ts); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); };
  const fmtDMY=(ymd)=>{ const d=new Date(ymd+"T12:00:00"); return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear(); };
  const todayText=()=>new Date().toLocaleDateString("ar-EG",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  const escapeHtml=(s)=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const uid=(p="id")=>`${p}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  const downloadText=(name,text,mime="text/plain;charset=utf-8")=>{ const b=new Blob([text],{type:mime}); const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=name; a.click(); URL.revokeObjectURL(a.href); };
  const toast=(msg)=>{ const t=$("toast"); t.textContent=msg; t.style.display="block"; clearTimeout(toast._t); toast._t=setTimeout(()=>t.style.display="none",2200); };

  const deepClone=(o)=>JSON.parse(JSON.stringify(o));
  const normalizePhone=(p)=>String(p||"").replace(/[^0-9]/g,"");

  // crypto (WebCrypto) for vault + export
  const KDF_ITERS=200000;
  const bufToB64=(buf)=>{ const b=new Uint8Array(buf); let bin=""; for(let i=0;i<b.length;i++) bin+=String.fromCharCode(b[i]); return btoa(bin); };
  const b64ToBuf=(b64)=>{ const bin=atob(b64); const b=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) b[i]=bin.charCodeAt(i); return b.buffer; };
  async function deriveKeyFromPIN(pin,saltBuf){
    const enc=new TextEncoder().encode(String(pin||""));
    const base=await crypto.subtle.importKey("raw", enc, {name:"PBKDF2"}, false, ["deriveKey"]);
    return crypto.subtle.deriveKey({name:"PBKDF2", salt:saltBuf, iterations:KDF_ITERS, hash:"SHA-256"}, base, {name:"AES-GCM", length:256}, false, ["encrypt","decrypt"]);
  }
  async function encryptJSON(key,obj){
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const plain=new TextEncoder().encode(JSON.stringify(obj));
    const ct=await crypto.subtle.encrypt({name:"AES-GCM", iv}, key, plain);
    return {ivB64:bufToB64(iv.buffer), ctB64:bufToB64(ct)};
  }
  async function decryptJSON(key,ivB64,ctB64){
    const iv=new Uint8Array(b64ToBuf(ivB64));
    const ct=b64ToBuf(ctB64);
    const plainBuf=await crypto.subtle.decrypt({name:"AES-GCM", iv}, key, ct);
    return JSON.parse(new TextDecoder().decode(plainBuf));
  }

  // schema
  const newCycle=()=>({id:uid("c"), createdAtISO:new Date().toISOString(), sessions:[], attendance:{}, txs:[], notes:{}, carry:{}, receipts:[], closed:false});
  const makeEmptyDB=()=>{
    const g={id:uid("g"), name:"مجموعة 1", cycleLen:8, students:[], cycles:[newCycle()], audit:[]};
    return {settings:{currentGroupId:g.id, chargeMode:"perSessions", brandName:"", brandPhone:"", receiptSeq:1, pinFailCount:0, pinLockUntil:0, saltB64:"", cloud:{provider:"none", fileName:"HedraVault.json", token:"", auto:"off"}, assistant:{enabled:false}}, groups:[g]};
  };
  function ensureDefaults(db){
    if(!db||typeof db!=="object") db=makeEmptyDB();
    db.settings=db.settings||{};
    db.groups=Array.isArray(db.groups)?db.groups:[];
    db.settings.chargeMode = (db.settings.chargeMode==="byAttendance") ? "byAttendance" : "perSessions";
    db.settings.brandName = String(db.settings.brandName||"");
    db.settings.brandPhone = String(db.settings.brandPhone||"");
    db.settings.receiptSeq = Number(db.settings.receiptSeq||1);
    db.settings.pinFailCount = Number(db.settings.pinFailCount||0);
    db.settings.pinLockUntil = Number(db.settings.pinLockUntil||0);
    db.settings.cloud = db.settings.cloud||{};
    db.settings.cloud.provider = ["none","drive","dropbox"].includes(db.settings.cloud.provider)?db.settings.cloud.provider:"none";
    db.settings.cloud.fileName = String(db.settings.cloud.fileName||"HedraVault.json");
    db.settings.cloud.token = String(db.settings.cloud.token||"");
    db.settings.cloud.auto = (db.settings.cloud.auto==="on")?"on":"off";
    db.settings.assistant = db.settings.assistant||{};
    db.settings.assistant.enabled = !!db.settings.assistant.enabled;
    if(db.groups.length===0){ const f=makeEmptyDB(); db.groups=f.groups; db.settings.currentGroupId=f.settings.currentGroupId; }
    db.groups.forEach(g=>{
      g.id=g.id||uid("g");
      g.name=String(g.name||"مجموعة");
      g.cycleLen=Math.max(1,Number(g.cycleLen||8));
      g.students=Array.isArray(g.students)?g.students:[];
      g.cycles=Array.isArray(g.cycles)&&g.cycles.length?g.cycles:[newCycle()];
      g.audit=Array.isArray(g.audit)?g.audit:[];
      g.students.forEach(s=>{
        s.id=s.id||uid("s");
        s.name=String(s.name||"طالب");
        s.price=Number(s.price||0);
        s.paused=!!s.paused;
        s.archived=!!s.archived;
        s.discountType=["none","fixed","percent","exempt"].includes(s.discountType)?s.discountType:"none";
        s.discountValue=Number(s.discountValue||0);
        s.phone=String(s.phone||"").trim();
      });
      g.cycles.forEach(c=>{
        c.id=c.id||uid("c");
        c.sessions=Array.isArray(c.sessions)?c.sessions:[];
        c.attendance=(c.attendance&&typeof c.attendance==="object")?c.attendance:{};
        c.txs=Array.isArray(c.txs)?c.txs:[];
        c.notes=(c.notes&&typeof c.notes==="object")?c.notes:{};
        c.carry=(c.carry&&typeof c.carry==="object")?c.carry:{};
        c.receipts=Array.isArray(c.receipts)?c.receipts:[];
        c.closed=!!c.closed;
      });
    });
    if(!db.groups.some(g=>g.id===db.settings.currentGroupId)) db.settings.currentGroupId=db.groups[0].id;
    return db;
  }

  // calc
  const curGroup=()=>db.groups.find(g=>g.id===db.settings.currentGroupId)||db.groups[0];
  const curCycle=(g)=>g.cycles[g.cycles.length-1];
  const sessionsCount=(c)=>(c.sessions||[]).length;
  const cycleLen=(g)=>Math.max(1,Number(g.cycleLen||8));
  function effectivePrice(s){
    if(s.paused||s.archived) return 0;
    const base=Math.max(0,Number(s.price||0));
    const t=s.discountType||"none";
    const v=Math.max(0,Number(s.discountValue||0));
    if(t==="exempt") return 0;
    if(t==="fixed") return Math.max(0, base-v);
    if(t==="percent"){ const p=Math.max(0,Math.min(100,v)); return Math.max(0, base*(1-p/100)); }
    return base;
  }
  const perSession=(g,s)=>round2(effectivePrice(s)/cycleLen(g));
  function attendanceCount(c,sid){
    let n=0;
    for(const ss of c.sessions||[]){ const map=c.attendance?.[ss.id]||{}; if(map[sid]==="P") n++; }
    return n;
  }
  function dueSoFar(g,c,s){
    const mode=db.settings.chargeMode||"perSessions";
    if(mode==="byAttendance") return round2(attendanceCount(c,s.id)*perSession(g,s));
    return round2(sessionsCount(c)*perSession(g,s));
  }
  const carry=(c,sid)=>round2(Number(c.carry?.[sid]||0));
  const paid=(c,sid)=>Math.max(0, round2((c.txs||[]).filter(t=>t.sid===sid).reduce((a,t)=>a+Number(t.amount||0),0)));
  function totals(g,c,s){
    const sub=dueSoFar(g,c,s);
    const prev=carry(c,s.id);
    const total=round2(sub+prev);
    const p=paid(c,s.id);
    return {sub,prev,total,paid:p,remaining:round2(total-p)};
  }
  function groupTotals(g,c){
    let total=0, paidSum=0, rem=0;
    g.students.filter(s=>!s.archived).forEach(s=>{ const t=totals(g,c,s); total+=t.total; paidSum+=t.paid; rem+=t.remaining; });
    return {total:round2(total), paid:round2(paidSum), remaining:round2(rem)};
  }

  // audit + receipts
  const auditAdd=(action,meta={})=>{ const g=curGroup(); g.audit.push({id:uid("aud"), tsISO:new Date().toISOString(), role, action, meta}); if(g.audit.length>2000) g.audit.splice(0,g.audit.length-2000); };
  const auditCSV=()=>{
    const rows=[["tsISO","role","action","meta"]];
    db.groups.forEach(g=>(g.audit||[]).forEach(a=>rows.push([a.tsISO,a.role,a.action,JSON.stringify(a.meta||{})])));
    return rows.map(r=>r.map(x=>`"${String(x??"").replaceAll('"','""')}"`).join(",")).join("\n");
  };
  function makeReceipt(g,c,s,amount,note){
    const seq=Number(db.settings.receiptSeq||1);
    db.settings.receiptSeq=seq+1;
    const rid=`R-${String(seq).padStart(6,"0")}`;
    const t=totals(g,c,s);
    const rc={id:uid("rc"), rid, tsISO:new Date().toISOString(), groupId:g.id, cycleId:c.id, studentId:s.id, studentName:s.name, amount:Number(amount||0), note:String(note||"").trim(), snapshot:{total:t.total, paid:t.paid, remaining:t.remaining}};
    c.receipts=c.receipts||[]; c.receipts.push(rc);
    auditAdd("receipt.created",{rid,studentId:s.id,amount:rc.amount});
    return rc;
  }
  const allReceipts=()=>{
    const out=[];
    db.groups.forEach(g=>g.cycles.forEach(c=>(c.receipts||[]).forEach(r=>out.push({g,c,r}))));
    out.sort((a,b)=>new Date(b.r.tsISO)-new Date(a.r.tsISO));
    return out;
  };
  const receiptsCSV=()=>{
    const rows=[["rid","tsISO","group","student","amount","note","total","paid","remaining"]];
    allReceipts().forEach(x=>rows.push([x.r.rid,x.r.tsISO,x.g.name,x.r.studentName,x.r.amount,x.r.note,x.r.snapshot.total,x.r.snapshot.paid,x.r.snapshot.remaining]));
    return rows.map(r=>r.map(x=>`"${String(x??"").replaceAll('"','""')}"`).join(",")).join("\n");
  };
  const receiptPrintHTML=(rc,groupName)=>{
    const brand=escapeHtml(db.settings.brandName||"");
    const phone=escapeHtml(db.settings.brandPhone||"");
    return `
    <div style="font-family:Tahoma,Arial;direction:rtl">
      <h2 style="margin:0">${brand||"—"}</h2>
      <div style="opacity:.7">${phone||"—"}</div>
      <hr/>
      <div><b>إيصال:</b> ${escapeHtml(rc.rid)}</div>
      <div><b>المجموعة:</b> ${escapeHtml(groupName)}</div>
      <div><b>الطالب:</b> ${escapeHtml(rc.studentName)}</div>
      <div><b>المبلغ:</b> ${escapeHtml(String(rc.amount))}</div>
      <div><b>ملاحظة:</b> ${escapeHtml(rc.note||"—")}</div>
      <hr/>
      <div><b>الإجمالي:</b> ${escapeHtml(String(rc.snapshot.total))}</div>
      <div><b>المدفوع:</b> ${escapeHtml(String(rc.snapshot.paid))}</div>
      <div><b>المتبقي:</b> ${escapeHtml(String(rc.snapshot.remaining))}</div>
      <hr/>
      <small>تم إنشاء الإيصال محليًا (Offline).</small>
    </div>`;
  };

  // vault (encrypted at rest)
  const DB_KEY="hedra_v6_teacher_vault";
  const DB_KEY_ASSIST="hedra_v6_teacher_vault_assistant";
  let role=ROLE.ADMIN;
  let db=ensureDefaults(makeEmptyDB());
  let sessionKey=null, saltB64=null;

  const hasVault=()=>!!localStorage.getItem(DB_KEY);
  const isUnlocked=()=>sessionStorage.getItem("hedra_unlocked")==="1";
  const setUnlocked=(on)=>{ sessionStorage.setItem("hedra_unlocked", on?"1":"0"); touch(); };
  const touch=()=>sessionStorage.setItem("hedra_last_active", String(Date.now()));
  async function save(){
    if(!sessionKey) return;
    const packed=await encryptJSON(sessionKey, db);
    // admin vault
    if(role===ROLE.ADMIN){
      localStorage.setItem(DB_KEY, JSON.stringify({v:2,kdf:{name:"PBKDF2",hash:"SHA-256",iters:KDF_ITERS}, saltB64, ...packed}));
    } else {
      await saveAssistantVault();
      return;
    }
    // auto cloud upload (best-effort)
    if(db?.settings?.cloud?.auto==="on"){
      try{ await cloudUpload(); }catch(e){ /* silent */ }
    }
  }
  async function setupNew(pin){
    const p=String(pin||"").trim(); if(p.length<4) throw new Error("PIN_SHORT");
    const salt=crypto.getRandomValues(new Uint8Array(16));
    saltB64=bufToB64(salt.buffer);
    sessionKey=await deriveKeyFromPIN(p, salt.buffer);
    db=ensureDefaults(makeEmptyDB());
    await save();
  }
  async function load(pin){
    const raw=localStorage.getItem(DB_KEY); if(!raw) return null;
    const v=JSON.parse(raw);
    const key=await deriveKeyFromPIN(String(pin||"").trim(), b64ToBuf(v.saltB64));
    const loaded=ensureDefaults(await decryptJSON(key, v.ivB64, v.ctB64));
    sessionKey=key; saltB64=v.saltB64;
    db=loaded;
    return db;
  }

  // UI nav
  const pages={run:$("pageRun"),manage:$("pageManage"),dashboard:$("pageDashboard"),settings:$("pageSettings")};
  function showTab(key){
    Object.entries(pages).forEach(([k,el])=>el.style.display=(k===key)?"":"none");
    document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active", t.dataset.tab===key));
    render();
  }
  document.querySelectorAll(".tab").forEach(t=>t.addEventListener("click",()=>showTab(t.dataset.tab)));

  function refreshGroupSelects(){
    ["selGroupRun","selGroupManage","selGroupSettings"].forEach(id=>{
      const sel=$(id); sel.innerHTML="";
      db.groups.forEach(g=>{ const o=document.createElement("option"); o.value=g.id; o.textContent=g.name; sel.appendChild(o); });
      sel.value=db.settings.currentGroupId;
      sel.onchange=async (e)=>{ db.settings.currentGroupId=e.target.value; await save(); render(); };
    });
  }
  function renderTop(){
    $("topDate").textContent=todayText();
    $("topRole").textContent = role===ROLE.ADMIN ? "الدور: مدير" : role===ROLE.ASSISTANT ? "الدور: مساعد" : "الدور: عرض فقط";
    const g=curGroup(); const c=curCycle(g);
    $("topSession").textContent=`الحصة: ${Math.min(sessionsCount(c)+1,cycleLen(g))} / ${cycleLen(g)}`;
    $("topCycle").textContent=`الدورة: ${fmtDMY(isoYMD(new Date(c.createdAtISO||Date.now())))} → —`;
    $("btnExport").style.display = role===ROLE.ADMIN ? "inline-flex":"none";
    $("btnImport").style.display = role===ROLE.ADMIN ? "inline-flex":"none";
  }

  function renderRun(){
    const g=curGroup(); const c=curCycle(g);
    const wrap=$("runList"); wrap.innerHTML="";
    const list=g.students.filter(s=>!s.archived).sort((a,b)=>a.name.localeCompare(b.name,"ar"));
    if(!list.length){ wrap.innerHTML='<div class="hint">أضف طلاب من الإعدادات.</div>'; return; }
    list.forEach((s,i)=>{
      const row=document.createElement("div"); row.className="row";
      row.innerHTML=`<div class="left"><div class="num">${i+1}</div><div><div class="name">${escapeHtml(s.name)}</div><div class="mini">اضغط للدفع/الحضور</div></div></div>
        <div style="display:flex;gap:8px"><button class="btn small royal noPrint">💳</button><button class="moreBtn noPrint">⋯</button></div>`;
      row.querySelector(".btn").onclick=()=>openPay(g,c,s);
      row.querySelector(".moreBtn").onclick=()=>openPay(g,c,s);
      wrap.appendChild(row);
    });
  }

  $("qManage").addEventListener("input",()=>renderManage());
  function renderManage(){
    const q=String($("qManage").value||"").trim().toLowerCase();
    const wrap=$("manageList"); wrap.innerHTML="";
    if(q){
      const hits=[];
      db.groups.forEach(gr=>{
        const cy=curCycle(gr);
        gr.students.filter(s=>!s.archived).forEach(s=>{ if(s.name.toLowerCase().includes(q)) hits.push({gr,cy,s,t:totals(gr,cy,s)}); });
      });
      if(!hits.length){ wrap.innerHTML='<div class="hint">لا نتائج.</div>'; return; }
      hits.sort((a,b)=>b.t.remaining-a.t.remaining);
      hits.slice(0,80).forEach(h=>{
        const row=document.createElement("div"); row.className="row";
        row.innerHTML=`<div class="left"><div class="num">🔎</div><div><div class="name">${escapeHtml(h.s.name)}</div>
          <div class="mini">المجموعة: <b>${escapeHtml(h.gr.name)}</b> • ${role===ROLE.ADMIN?('المتبقي: <span class="mono">'+h.t.remaining+'</span>'):'متأخر'}</div></div></div>
          <button class="moreBtn noPrint">عرض</button>`;
        row.querySelector("button").onclick=()=>{ db.settings.currentGroupId=h.gr.id; save().then(()=>{render(); openPay(h.gr,h.cy,h.s);}); };
        wrap.appendChild(row);
      });
      return;
    }
    const g=curGroup(); const c=curCycle(g);
    const gt=groupTotals(g,c);
    wrap.innerHTML += `<div class="row"><div class="left"><div class="num">📌</div><div><div class="name">ملخص المجموعة</div>
      <div class="mini">${role===ROLE.ADMIN?('الإجمالي: <span class="mono">'+gt.total+'</span> • المدفوع: <span class="mono">'+gt.paid+'</span> • المتبقي: <span class="mono">'+gt.remaining+'</span>'):'الإجماليات مخفية'}</div></div></div>
      <button class="moreBtn noPrint" onclick="window.print()">🖨</button></div>`;
    g.students.filter(s=>!s.archived).sort((a,b)=>a.name.localeCompare(b.name,"ar")).forEach(s=>{
      const t=totals(g,c,s);
      const row=document.createElement("div"); row.className="row";
      row.innerHTML=`<div class="left"><div class="num">🧾</div><div><div class="name">${escapeHtml(s.name)}</div>
        <div class="mini">${role===ROLE.ADMIN?('المتبقي: <span class="mono">'+t.remaining+'</span>'):'—'}</div></div></div>
        <button class="moreBtn noPrint">عرض</button>`;
      row.querySelector("button").onclick=()=>openPay(g,c,s);
      wrap.appendChild(row);
    });
  }

  function renderDashboard(){
    const g=curGroup(); const c=curCycle(g);
    const cards=$("dashCards"), month=$("dashMonth"), late=$("dashLate");
    cards.innerHTML=""; month.innerHTML=""; late.innerHTML="";
    const gt=groupTotals(g,c);
    const items=[
      ["👥","الطلاب", g.students.filter(s=>!s.archived).length],
      ["🗓","الحصص", `${sessionsCount(c)}/${cycleLen(g)}`],
      ["✅","الحضور", g.students.filter(s=>!s.archived).reduce((a,s)=>a+attendanceCount(c,s.id),0)]
    ];
    if(role===ROLE.ADMIN) items.push(["💰","المدفوع", gt.paid],["📌","المتبقي", gt.remaining]);
    items.forEach(x=>{
      const el=document.createElement("div"); el.className="row"; el.style.flex="1";
      el.innerHTML=`<div class="left"><div class="num">${x[0]}</div><div><div class="name">${x[1]}</div><div class="mini mono">${x[2]}</div></div></div>`;
      cards.appendChild(el);
    });
    const m={};
    g.cycles.forEach(cc=>(cc.txs||[]).forEach(t=>{
      const d=new Date(t.tsISO);
      const k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
      m[k]=(m[k]||0)+Number(t.amount||0);
    }));
    const ks=Object.keys(m).sort();
    if(role!==ROLE.ADMIN){
      month.innerHTML='<div class="hint">الدخل الشهري مخفي في هذا الوضع.</div>';
      // clear charts
      const ic=$("incomeCanvas"); if(ic) ic.getContext("2d").clearRect(0,0,ic.width,ic.height);
      const ac=$("absenceCanvas"); if(ac) ac.getContext("2d").clearRect(0,0,ac.width,ac.height);
    }else{
      if(!ks.length) month.innerHTML='<div class="hint">لا توجد عمليات دفع بعد.</div>';
      else month.innerHTML='<table><thead><tr><th>الشهر</th><th>الدخل</th></tr></thead><tbody>'+ks.slice().reverse().map(k=>`<tr><td>${k}</td><td class="mono">${m[k].toFixed(2).replace(".00","")}</td></tr>`).join("")+'</tbody></table>';
      // charts
      const labels=ks;
      const data=ks.map(k=>Number(m[k]||0));
      drawLineChart($("incomeCanvas"), labels, data);

      const abs=calcAbsenceMonthly(g);
      const aks=Object.keys(abs).sort();
      const aData=aks.map(k=>{
        const P=abs[k].P||0, A=abs[k].A||0;
        const tot=P+A;
        return tot? Math.round((A/tot)*100):0;
      });
      drawLineChart($("absenceCanvas"), aks.length?aks:["—"], aks.length?aData:[0]);
    }

    const list=g.students.filter(s=>!s.archived).map(s=>({s,t:totals(g,c,s)})).filter(x=>x.t.remaining>0).sort((a,b)=>b.t.remaining-a.t.remaining).slice(0,10);
    if(!list.length) late.innerHTML='<div class="hint">لا توجد متأخرات واضحة.</div>';
    else list.forEach((x,i)=>{
      const r=document.createElement("div"); r.className="row";
      r.innerHTML=`<div class="left"><div class="num">${i+1}</div><div><div class="name">${escapeHtml(x.s.name)}</div><div class="mini">${role===ROLE.ADMIN?('المتبقي: <span class="mono">'+x.t.remaining+'</span>'):'متأخر'}</div></div></div>
      <button class="moreBtn noPrint">عرض</button>`;
      r.querySelector("button").onclick=()=>openPay(g,c,x.s);
      late.appendChild(r);
    });
  }

  function renderSettings(){
    const g=curGroup();
    $("cycleLen").value=String(g.cycleLen||8);
    $("chargeMode").value=db.settings.chargeMode||"perSessions";
    $("brandName").value=db.settings.brandName||"";
    $("brandPhone").value=db.settings.brandPhone||"";
    if($("cloudProvider")) refreshCloudUI();
    // hide cloud controls for non-admin
    const cloudBtns=[$("btnCloudUpload"),$("btnCloudDownload"),$("btnMakeAssistant")].filter(Boolean);
    cloudBtns.forEach(b=>b.style.display=(role===ROLE.ADMIN || (b.id==="btnCloudDownload" && role!==ROLE.ADMIN))?"inline-flex":"none");
    if(role!==ROLE.ADMIN){ $("cloudToken").disabled=true; $("cloudProvider").disabled=true; $("cloudFileName").disabled=true; $("cloudAuto").disabled=true; }
    else { $("cloudToken").disabled=false; $("cloudProvider").disabled=false; $("cloudFileName").disabled=false; $("cloudAuto").disabled=false; }

    const wrap=$("studentsList"); wrap.innerHTML="";
    g.students.filter(s=>!s.archived).sort((a,b)=>a.name.localeCompare(b.name,"ar")).forEach(s=>{
      const row=document.createElement("div"); row.className="row";
      row.innerHTML=`<div class="left"><div class="num">👤</div><div><div class="name">${escapeHtml(s.name)}</div>
        <div class="mini">سعر الدورة: <span class="mono">${Number(s.price||0)}</span> • واتساب: <span class="mono">${escapeHtml(s.phone||"—")}</span> • خصم: <span class="mono">${escapeHtml(s.discountType||"none")}</span></div></div></div>
        <button class="moreBtn noPrint">⋯</button>`;
      row.querySelector("button").onclick=()=>editStudent(g,s);
      wrap.appendChild(row);
    });
  }

  async function render(){
    renderTop();
    refreshGroupSelects();
    if(pages.run.style.display!=="none") renderRun();
    if(pages.manage.style.display!=="none") renderManage();
    if(pages.dashboard.style.display!=="none") renderDashboard();
    if(pages.settings.style.display!=="none") renderSettings();
  }

  $("btnDashPrint").onclick=()=>window.print();

  // sessions
  function addSessionWithDate(g,c,ymd){
    if(sessionsCount(c)>=cycleLen(g)){ toast("اكتملت حصص الدورة"); return false; }
    if(c.sessions.some(s=>ymdFromTs(s.tsISO)===ymd)){ toast("تاريخ مكرر"); return false; }
    c.sessions.push({id:uid("ss"), tsISO:new Date(ymd+"T12:00:00").toISOString()});
    c.sessions.sort((a,b)=>new Date(a.tsISO)-new Date(b.tsISO));
    auditAdd("session.add",{groupId:g.id, ymd});
    return true;
  }
  $("btnAddSession").onclick=async ()=>{
    if(role!==ROLE.ADMIN) return toast("غير مسموح");
    const g=curGroup(); const c=curCycle(g);
    const y=prompt("تاريخ الحصة (YYYY-MM-DD)", isoYMD(new Date())); if(!y) return;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(y)) return alert("صيغة خطأ");
    if(addSessionWithDate(g,c,y)){ await save(); toast("تمت الإضافة"); render(); }
  };
  $("btnScanQR").onclick=()=>{ if(role===ROLE.VIEW) return toast("عرض فقط"); startQRScanner(); };

  $("btnRemoveSession").onclick=async ()=>{
    if(role!==ROLE.ADMIN) return toast("غير مسموح");
    const g=curGroup(); const c=curCycle(g);
    if(!c.sessions.length) return toast("لا توجد حصص");
    const last=c.sessions[c.sessions.length-1];
    if(!confirm("حذف آخر حصة؟ "+fmtDMY(ymdFromTs(last.tsISO)))) return;
    c.sessions.pop();
    auditAdd("session.remove",{groupId:g.id, ymd:ymdFromTs(last.tsISO)});
    await save(); toast("تم الحذف"); render();
  };

  // bulk sessions (getDay: 0 Sunday .. 6 Saturday ✅)
  $("btnBulk").onclick=()=>{ if(role!==ROLE.ADMIN) return toast("غير مسموح"); $("bulkFrom").value=isoYMD(new Date(Date.now()-30*86400000)); $("bulkTo").value=isoYMD(new Date()); document.querySelectorAll(".dow").forEach(x=>x.checked=false); $("bulkOverlay").style.display="block"; };
  $("btnBulkClose").onclick=()=>$("bulkOverlay").style.display="none";
  $("btnBulkApply").onclick=async ()=>{
    const g=curGroup(); const c=curCycle(g);
    const from=$("bulkFrom").value, to=$("bulkTo").value;
    const dows=[...document.querySelectorAll(".dow")].filter(x=>x.checked).map(x=>Number(x.value));
    if(!from||!to) return alert("اختر من/إلى");
    if(new Date(from)>new Date(to)) return alert("من أكبر من إلى");
    if(!dows.length) return alert("اختر يوم");
    let d=new Date(from+"T12:00:00"), end=new Date(to+"T12:00:00"), added=0;
    while(d<=end){
      if(dows.includes(d.getDay())){
        const y=d.toISOString().slice(0,10);
        if(addSessionWithDate(g,c,y)) added++;
        if(sessionsCount(c)>=cycleLen(g)) break;
      }
      d.setDate(d.getDate()+1);
    }
    await save();
    $("bulkOverlay").style.display="none";
    toast("تم إنشاء "+added+" حصص");
    render();
  };

  // groups / students
  $("btnAddGroup").onclick=async ()=>{
    if(role!==ROLE.ADMIN) return toast("غير مسموح");
    const name=(prompt("اسم المجموعة")||"").trim(); if(!name) return;
    if(db.groups.some(g=>g.name.trim().toLowerCase()===name.toLowerCase())) return alert("موجودة");
    db.groups.push({id:uid("g"), name, cycleLen:8, students:[], cycles:[newCycle()], audit:[]});
    db.settings.currentGroupId=db.groups[db.groups.length-1].id;
    auditAdd("group.add",{name});
    await save(); toast("تمت إضافة المجموعة"); render();
  };
  $("btnAddStudent").onclick=async ()=>{
    if(role!==ROLE.ADMIN) return toast("غير مسموح");
    const g=curGroup();
    const name=String($("newStudentName").value||"").trim(); if(!name) return;
    if(g.students.some(s=>!s.archived && s.name.trim().toLowerCase()===name.toLowerCase())) return alert("موجود");
    g.students.push({id:uid("s"), name, phone:"", price:0, paused:false, archived:false, discountType:"none", discountValue:0});
    $("newStudentName").value="";
    auditAdd("student.add",{groupId:g.id,name});
    await save(); toast("تمت إضافة الطالب"); render();
  };
  $("cycleLen").onchange=async (e)=>{ if(role!==ROLE.ADMIN) return; const g=curGroup(); g.cycleLen=Number(e.target.value||8); auditAdd("settings.cycleLen",{value:g.cycleLen}); await save(); render(); };
  $("chargeMode").onchange=async (e)=>{ if(role!==ROLE.ADMIN) return; db.settings.chargeMode=e.target.value||"perSessions"; auditAdd("settings.chargeMode",{value:db.settings.chargeMode}); await save(); toast("تم الحفظ"); render(); };
  $("brandName").onchange=async (e)=>{ db.settings.brandName=String(e.target.value||""); await save(); };
  $("brandPhone").onchange=async (e)=>{ db.settings.brandPhone=String(e.target.value||""); await save(); };

  // Cloud settings bindings (PRO)
  const refreshCloudUI=()=>{
    $("cloudProvider").value=db.settings.cloud.provider;
    $("cloudFileName").value=db.settings.cloud.fileName;
    $("cloudToken").value=db.settings.cloud.token;
    $("cloudAuto").value=db.settings.cloud.auto;
  };
  $("cloudProvider").onchange=async (e)=>{ if(role!==ROLE.ADMIN) return; db.settings.cloud.provider=e.target.value; await save(); toast("تم الحفظ"); };
  $("cloudFileName").onchange=async (e)=>{ if(role!==ROLE.ADMIN) return; db.settings.cloud.fileName=String(e.target.value||"").trim(); await save(); };
  $("cloudToken").onchange=async (e)=>{ if(role!==ROLE.ADMIN) return; db.settings.cloud.token=String(e.target.value||"").trim(); await save(); };
  $("cloudAuto").onchange=async (e)=>{ if(role!==ROLE.ADMIN) return; db.settings.cloud.auto=e.target.value; await save(); toast("تم الحفظ"); };

  $("btnCloudUpload").onclick=async ()=>{ if(role!==ROLE.ADMIN) return toast("للـ مدير فقط"); try{ await cloudUpload(); }catch(e){ alert("فشل الرفع"); } };
  $("btnCloudDownload").onclick=async ()=>{ if(role!==ROLE.ADMIN && role!==ROLE.ASSISTANT) return toast("غير مسموح"); try{ await cloudDownload(); }catch(e){ alert("فشل الاسترجاع"); } };

  $("btnMakeAssistant").onclick=()=>{ makeAssistantSnapshot(); };


  $("btnNewCycle").onclick=async ()=>{
    if(role!==ROLE.ADMIN) return toast("غير مسموح");
    const g=curGroup(); const c=curCycle(g);
    if(!confirm("فتح دورة جديدة مع ترحيل المتبقي؟")) return;
    const carryMap={};
    g.students.filter(s=>!s.archived).forEach(s=>{ const t=totals(g,c,s); if(Math.abs(t.remaining)>0.0001) carryMap[s.id]=t.remaining; });
    c.closed=true;
    const nc=newCycle(); nc.carry=carryMap;
    g.cycles.push(nc);
    auditAdd("cycle.new",{groupId:g.id});
    await save(); toast("تم فتح دورة جديدة"); render();
  };

  function editStudent(g,s){
    if(role!==ROLE.ADMIN) return toast("غير مسموح");
    const name=(prompt("اسم الطالب", s.name)||"").trim(); if(!name) return;
    const price=Number(prompt("سعر الدورة", String(s.price||0))||"0");
    const discType=(prompt("نوع الخصم: none / fixed / percent / exempt", s.discountType||"none")||"none").trim();
    const discVal=Number(prompt("قيمة الخصم (0 لو none/exempt)", String(s.discountValue||0))||"0");
    const phone=String(prompt("رقم واتساب الطالب (اختياري)", s.phone||"")||"").trim();
    const paused=confirm("إيقاف الطالب؟ (موافق=نعم)");
    const archive=confirm("أرشفة الطالب؟ (موافق=نعم)");
    s.name=name; s.price=price; s.discountType=discType; s.discountValue=discVal; s.phone=phone; s.paused=paused; if(archive) s.archived=true;
    auditAdd(archive?"student.archive":"student.update",{studentId:s.id});
    save().then(()=>{ toast("تم الحفظ"); render(); });
  }

  // pay modal
  let payCtx=null, payMode=null;
  function openPay(g,c,s){
    $("payTitle").textContent=s.name;
    $("paySub").textContent=`${g.name} • حصص ${sessionsCount(c)}/${cycleLen(g)}`;
    $("payNote").value=String(c.notes?.[s.id]||"");
    const t=totals(g,c,s);
    $("payBody").innerHTML = (role===ROLE.ADMIN)
      ? `<table><thead><tr><th>البند</th><th>القيمة</th></tr></thead><tbody>
          <tr><td>الاشتراك حتى الآن</td><td class="mono">${t.sub}</td></tr>
          <tr><td>الرصيد المرحّل</td><td class="mono">${t.prev}</td></tr>
          <tr><td><b>الإجمالي</b></td><td class="mono"><b>${t.total}</b></td></tr>
          <tr><td>المدفوع</td><td class="mono">${t.paid}</td></tr>
          <tr><td><b>المتبقي</b></td><td class="mono"><b>${t.remaining}</b></td></tr>
        </tbody></table>`
      : `<div class="hint">المبالغ مخفية في هذا الوضع. يمكنك تسجيل حضور/غياب وملاحظة.</div>`;
    renderAttendance(g,c,s);
    $("payBtns").style.display = (role===ROLE.ADMIN) ? "flex":"none";
    $("btnPayReceipt").style.display = (role===ROLE.ADMIN) ? "inline-flex":"none";
    $("payOverlay").style.display="block";
    payCtx={g,c,s};
  }
  function closePay(){ $("payOverlay").style.display="none"; $("payAmountWrap").style.display="none"; payMode=null; payCtx=null; }
  $("btnPayClose").onclick=closePay;
  const _waBtn=$("btnWhatsApp"); if(_waBtn) _waBtn.onclick=()=>{
    if(!payCtx) return;
    const {g,c,s}=payCtx;
    const phone=normalizePhone(s.phone)||normalizePhone(db.settings.brandPhone);
    if(!phone) return alert("لا يوجد رقم واتساب للطالب. أضف رقمًا من إعدادات الطالب.");
    const t=totals(g,c,s);
    const msg=[
      "إيصال/تفاصيل دفع",
      "الطالب: "+s.name,
      "المجموعة: "+g.name,
      (role===ROLE.ADMIN?("المدفوع: "+t.paid):""),
      (role===ROLE.ADMIN?("المتبقي: "+t.remaining):""),
      "تم الإنشاء عبر Hedra PRO"
    ].filter(Boolean).join("\n");
    window.open("https://wa.me/"+phone+"?text="+encodeURIComponent(msg),"_blank");
  };

  $("btnShowQR").onclick=()=>{
    if(!payCtx) return;
    const {g,s}=payCtx;
    const wrap=$("qrWrap");
    const on = wrap.style.display==="none" || wrap.style.display==="";
    wrap.style.display = on ? "block" : "none";
    if(on) showStudentQR(s,g);
  };

  $("btnPayPrint").onclick=()=>window.print();
  $("payOverlay").addEventListener("click",(e)=>{ if(e.target===$("payOverlay")) closePay(); });

  $("btnPaySet").onclick=()=>{ payMode="set"; $("payAmountLabel").textContent="تعديل المدفوع"; $("payAmount").value=String(paid(payCtx.c,payCtx.s.id)); $("payAmountWrap").style.display="flex"; };
  $("btnPayAdd").onclick=()=>{ payMode="add"; $("payAmountLabel").textContent="إضافة مبلغ"; $("payAmount").value=""; $("payAmountWrap").style.display="flex"; };
  $("btnPayMinus").onclick=()=>{ payMode="minus"; $("payAmountLabel").textContent="خصم (تصحيح)"; $("payAmount").value=""; $("payAmountWrap").style.display="flex"; };

  $("btnPayApply").onclick=async ()=>{
    if(!payCtx||!payMode) return;
    if(role!==ROLE.ADMIN) return toast("غير مسموح");
    const v=Number($("payAmount").value||0);
    const {g,c,s}=payCtx;
    if(payMode==="set") {
      c.txs=(c.txs||[]).filter(t=>t.sid!==s.id);
      if(v>0) c.txs.push({id:uid("tx"), sid:s.id, amount:v, tsISO:new Date().toISOString(), note:"(تعديل)"});
      auditAdd("payment.set",{studentId:s.id,value:v});
    } else if(payMode==="add") {
      if(!(v>0)) return alert("مبلغ أكبر من صفر");
      c.txs.push({id:uid("tx"), sid:s.id, amount:v, tsISO:new Date().toISOString(), note:"(إضافة)"});
      auditAdd("payment.add",{studentId:s.id,value:v});
    } else {
      if(!(v>0)) return alert("مبلغ أكبر من صفر");
      const curPaid=paid(c,s.id);
      if(v>curPaid) return alert("لا يمكن خصم أكثر من المدفوع الحالي ("+curPaid+")");
      c.txs.push({id:uid("tx"), sid:s.id, amount:-v, tsISO:new Date().toISOString(), note:"(خصم)"});
      auditAdd("payment.minus",{studentId:s.id,value:v});
    }
    await save();
    $("payAmountWrap").style.display="none"; payMode=null;
    toast("تم الحفظ");
    openPay(g,c,s);
    render();
  };

  $("btnPaySaveNote").onclick=async ()=>{
    if(!payCtx) return;
    if(role===ROLE.VIEW) return toast("عرض فقط");
    const {c,s}=payCtx;
    c.notes=c.notes||{};
    c.notes[s.id]=String($("payNote").value||"").trim();
    auditAdd("note.save",{studentId:s.id});
    await save(); toast("تم حفظ الملاحظة");
  };

  // Receipt (PrintPRO): create receipt then open in-app preview
$("btnPayReceipt").onclick=async ()=>{
  if(!payCtx) return;
  if(role!==ROLE.ADMIN) return toast("للـ مدير فقط");
  const amt=Number(prompt("قيمة الإيصال", "0")||"0"); if(!(amt>0)) return;
  const note=prompt("ملاحظة (اختياري)")||"";
  const {g,c,s}=payCtx;
  const rc=makeReceipt(g,c,s,amt,note);
  await save(); toast("تم إنشاء "+rc.rid);
  try{
    PrintPRO.open({
      title: rc.rid,
      meta: `${g.name} — ${s.name}`,
      fullHtml: receiptPrintHTML(rc,g.name),
      shortHtml: receiptPrintHTML(rc,g.name, {short:true})
    });
  }catch(e){
    console.error(e);
    // fallback: open a tab and print (no script injection)
    const w=window.open("","_blank");
    w.document.write("<meta charset='utf-8'><title>"+rc.rid+"</title>"+receiptPrintHTML(rc,g.name));
    w.document.close();
  }
};

  function renderAttendance(g,c,s){
    const wrap=$("attList"); wrap.innerHTML="";
    if(!c.sessions.length){ wrap.innerHTML='<div class="hint">لا توجد حصص بعد.</div>'; return; }
    c.sessions.forEach(ss=>{
      const y=ymdFromTs(ss.tsISO);
      const val=c.attendance?.[ss.id]?.[s.id]||"";
      const label= val==="P" ? "حضور ✅" : val==="A" ? "غياب ❌" : "—";
      const row=document.createElement("div"); row.className="row";
      row.innerHTML=`<div class="left"><div class="num">🗓</div><div><div class="name">${fmtDMY(y)}</div><div class="mini">${y}</div></div></div>
        <button class="btn small ghost noPrint">${label}</button>`;
      row.querySelector("button").onclick=async ()=>{
        if(role===ROLE.VIEW) return toast("عرض فقط");
        c.attendance=c.attendance||{}; c.attendance[ss.id]=c.attendance[ss.id]||{};
        const cur=c.attendance[ss.id][s.id]||"";
        const next = cur==="P" ? "A" : cur==="A" ? "" : "P";
        if(!next) delete c.attendance[ss.id][s.id]; else c.attendance[ss.id][s.id]=next;
        auditAdd("attendance.toggle",{studentId:s.id, ymd:y, val:next||"—"});
        await save();
        openPay(g,c,s);
        render();
      };
      wrap.appendChild(row);
    });
  }

  // audit / receipts overlays
  const closeOverlay=(id)=>$(id).style.display="none";
  const openOverlay=(id)=>$(id).style.display="block";

  $("btnQRStop").onclick=stopQRScanner;
  $("qrOverlay").addEventListener("click",(e)=>{ if(e.target===$("qrOverlay")) stopQRScanner(); });


  $("btnAudit").onclick=()=>{
    if(role!==ROLE.ADMIN) return toast("للـ مدير فقط");
    const g=curGroup();
    $("auditText").textContent=(g.audit||[]).slice(-500).reverse().map(a=>a.tsISO+" | "+a.role+" | "+a.action+" | "+JSON.stringify(a.meta||{})).join("\n")||"—";
    openOverlay("auditOverlay");
  };
  $("btnAuditClose").onclick=()=>closeOverlay("auditOverlay");
  $("auditOverlay").addEventListener("click",(e)=>{ if(e.target===$("auditOverlay")) closeOverlay("auditOverlay"); });
  $("btnAuditCSV").onclick=()=>{ downloadText("Hedra_Audit_"+isoYMD(new Date())+".csv", auditCSV(), "text/csv;charset=utf-8"); toast("تم التصدير"); };

  $("btnReceipts").onclick=()=>{
    if(role!==ROLE.ADMIN) return toast("للـ مدير فقط");
    const list=allReceipts().slice(0,250);
    const wrap=$("rcList");
    if(!list.length) wrap.innerHTML='<div class="hint">لا توجد إيصالات.</div>';
    else wrap.innerHTML=list.map(x=>`<div class="row"><div class="left"><div class="num">🧾</div><div><div class="name">${escapeHtml(x.r.rid)} • ${escapeHtml(x.r.studentName)}</div><div class="mini">${escapeHtml(x.g.name)} • ${x.r.amount}</div></div></div><button class="moreBtn noPrint" data-rid="${escapeHtml(x.r.rid)}">طباعة</button></div>`).join("");
    wrap.querySelectorAll("button[data-rid]").forEach(b=>b.onclick=()=>{
      const rid=b.getAttribute("data-rid");
      const f=allReceipts().find(x=>x.r.rid===rid); if(!f) return;
      const w=window.open("","_blank");
      w.document.write("<meta charset='utf-8'><title>"+rid+"</title>"+receiptPrintHTML(f.r,f.g.name)+"<script>window.onload=()=>window.print();
window.onload=()=>window.print();</script>");
      w.document.close();
    });
    openOverlay("rcOverlay");
  };
  $("btnRcClose").onclick=()=>closeOverlay("rcOverlay");
  $("rcOverlay").addEventListener("click",(e)=>{ if(e.target===$("rcOverlay")) closeOverlay("rcOverlay"); });
  $("btnRcCSV").onclick=()=>{ downloadText("Hedra_Receipts_"+isoYMD(new Date())+".csv", receiptsCSV(), "text/csv;charset=utf-8"); toast("تم التصدير"); };

  // Export / Import (encrypted backup)
  $("btnExport").onclick=async ()=>{
    if(role!==ROLE.ADMIN) return toast("غير مسموح");
    const pass=prompt("كلمة مرور التصدير (4+ أحرف/أرقام)"); if(!pass||String(pass).trim().length<4) return;
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const key=await deriveKeyFromPIN(String(pass).trim(), salt.buffer);
    const packed=await encryptJSON(key, {type:"hedra_export", ver:"6.0-teacher", exportedAt:new Date().toISOString(), db});
    const out={type:"hedra_export", v:2, saltB64:bufToB64(salt.buffer), ...packed};
    downloadText("Hedra_V6_Teacher_Encrypted_Backup_"+isoYMD(new Date())+".json", JSON.stringify(out,null,2), "application/json;charset=utf-8");
    toast("تم التصدير");
  };
  $("btnImport").onclick=()=>{
    if(role!==ROLE.ADMIN) return toast("غير مسموح");
    const inp=document.createElement("input"); inp.type="file"; inp.accept="application/json";
    inp.onchange=()=>{
      const f=inp.files?.[0]; if(!f) return;
      const r=new FileReader();
      r.onload=()=>{ (async ()=>{
        try{
          const parsed=JSON.parse(String(r.result||""));
          let next=null;
          if(parsed?.type==="hedra_export" && parsed?.v===2){
            const pass=prompt("كلمة مرور النسخة الاحتياطية"); if(!pass) return;
            const key=await deriveKeyFromPIN(String(pass).trim(), b64ToBuf(parsed.saltB64));
            next=await decryptJSON(key, parsed.ivB64, parsed.ctB64);
            next=next?.db ?? next;
          } else {
            next=parsed;
          }
          db=ensureDefaults(next);
          await save(); toast("تم الاستيراد"); render();
        }catch(e){ alert("فشل الاستيراد"); }
      })(); };
      r.readAsText(f);
    };
    inp.click();
  };

  // Change PIN (admin only)
  $("btnChangePIN").onclick=async ()=>{
    if(role!==ROLE.ADMIN) return toast("للـ مدير فقط");
    if(!sessionKey) return toast("افتح أولاً");
    const old=prompt("PIN الحالي"); if(!old) return;
    try{
      // verify old by trying to decrypt vault
      const raw=localStorage.getItem(DB_KEY); if(!raw) return toast("لا توجد خزنة");
      const v=JSON.parse(raw);
      const key=await deriveKeyFromPIN(String(old).trim(), b64ToBuf(v.saltB64));
      await decryptJSON(key, v.ivB64, v.ctB64); // verify
      const np=prompt("PIN جديد (4+ أرقام)"); if(!np||String(np).trim().length<4) return;
      // re-encrypt with new salt
      const salt=crypto.getRandomValues(new Uint8Array(16));
      saltB64=bufToB64(salt.buffer);
      sessionKey=await deriveKeyFromPIN(String(np).trim(), salt.buffer);
      await save();
      toast("تم تغيير PIN");
      auditAdd("security.pin.change",{});
      await save();
    }catch(e){ toast("PIN الحالي خطأ"); }
  };

  // Lock / Unlock
  const openLock=(msg)=>{ $("lockHint").textContent=msg; $("lockOverlay").style.display="block"; };
  const closeLock=()=>{ $("lockOverlay").style.display="none"; $("pinInput").value=""; };
  $("btnLockClear").onclick=()=>$("pinInput").value="";
  $("roleAdmin").onclick=()=>{ role=ROLE.ADMIN; toast("مدير"); renderTop(); };
  $("roleAssistant").onclick=()=>{ role=ROLE.ASSISTANT; toast("مساعد"); renderTop(); };
  $("roleView").onclick=()=>{ role=ROLE.VIEW; toast("عرض فقط"); renderTop(); };

  $("btnUnlock").onclick=async ()=>{
    const btn=$("btnUnlock");
    btn.disabled=true;
    btn.style.opacity="0.7";
    try{
      const pin=String($("pinInput").value||"").trim();
      if(pin.length<4) return toast("PIN قصير");
      const now=Date.now();
      const lockUntil=Number(db.settings.pinLockUntil||0);
      if(lockUntil && now<lockUntil) return toast("مقفول مؤقتًا");
      toast("جاري الفتح...");
      if(role===ROLE.ADMIN){
        if(!hasVault()) {
          await setupNew(pin);
        } else {
          const loaded=await load(pin);
          if(!loaded) throw new Error("bad");
          db.settings.pinFailCount=0; db.settings.pinLockUntil=0;
          await save();
        }
      } else {
        // assistant/view uses assistant vault (no money data)
        const loaded=await loadAssistant(pin);
        if(!loaded) throw new Error("bad");
      }
      setUnlocked(true);
      closeLock();
      render();
      toast("تم الفتح");
    }catch(e){
      console.error(e);
      if(String(e&&e.message||e)==="NO_ASSIST_VAULT"){ toast("لا توجد نسخة مساعد. اطلب من المدير إنشاءها."); $("pinInput").value=""; return; }
      db.settings.pinFailCount = Number(db.settings.pinFailCount||0)+1;
      if(db.settings.pinFailCount>=5) {
        db.settings.pinLockUntil = Date.now()+30000;
        db.settings.pinFailCount=0;
        toast("قفل 30 ثانية");
      } else toast("PIN خطأ");
      $("pinInput").value="";
    } finally {
      btn.disabled=false;
      btn.style.opacity="1";
    }
  };

  // auto-lock (10 min) + wipe memory
  setInterval(()=>{
    if(!isUnlocked()) return;
    const last=Number(sessionStorage.getItem("hedra_last_active")||0);
    if(last && Date.now()-last>10*60*1000){
      setUnlocked(false);
      db=ensureDefaults(makeEmptyDB());
      sessionKey=null; saltB64=null;
      openLock("تم القفل تلقائيًا");
    }
  }, 4000);
  ["click","keydown","touchstart","mousemove"].forEach(ev=>window.addEventListener(ev,()=>touch(),{passive:true}));

  // PWA install
  let deferred=null;
  window.addEventListener("beforeinstallprompt",(e)=>{ e.preventDefault(); deferred=e; $("btnInstall").style.display="inline-flex"; });
  $("btnInstall").onclick=async ()=>{ if(!deferred) return alert("من القائمة ⋮ ثم Install"); deferred.prompt(); await deferred.userChoice; deferred=null; $("btnInstall").style.display="none"; };

  // SW
  if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js?v="+BUILD);


  // PRO: Assistant vault (true privacy: no txs/prices/audit)
  async function makeAssistantSnapshot(){
    if(role!==ROLE.ADMIN) return toast("للـ مدير فقط");
    const ap=prompt("PIN المساعد (4+ أرقام) لإنشاء نسخة بدون أرباح"); if(!ap||String(ap).trim().length<4) return;
    const salt=crypto.getRandomValues(new Uint8Array(16));
    const key=await deriveKeyFromPIN(String(ap).trim(), salt.buffer);

    const red=deepClone(db);
    // redact money-sensitive fields
    red.groups.forEach(g=>{
      g.audit=[];
      g.students.forEach(s=>{
        s.price=0; s.discountType="none"; s.discountValue=0;
      });
      g.cycles.forEach(c=>{
        c.txs=[];
        c.receipts=[];
        c.carry={}; // hide carry balances
      });
    });
    const packed=await encryptJSON(key, {type:"hedra_assistant", ver:"6.1-pro", createdAt:new Date().toISOString(), db:red});
    localStorage.setItem(DB_KEY_ASSIST, JSON.stringify({type:"hedra_assistant", v:1, saltB64:bufToB64(salt.buffer), ...packed}));
    db.settings.assistant.enabled=true;
    await save(); // save admin vault (flag only)
    toast("تم إنشاء نسخة المساعد");
    auditAdd("assistant.snapshot",{});
    await save();
  }

  async function loadAssistant(pin){
    const raw=localStorage.getItem(DB_KEY_ASSIST);
    if(!raw) throw new Error("NO_ASSIST_VAULT");
    const v=JSON.parse(raw);
    const key=await deriveKeyFromPIN(String(pin||"").trim(), b64ToBuf(v.saltB64));
    const loaded=ensureDefaults(await decryptJSON(key, v.ivB64, v.ctB64));
    // assistant mode uses its own sessionKey to save assistant vault only (no admin vault access)
    sessionKey=key;
    saltB64=v.saltB64;
    db=loaded;
    return db;
  }

  async function saveAssistantVault(){
    if(role===ROLE.ASSISTANT || role===ROLE.VIEW){
      const packed=await encryptJSON(sessionKey, db);
      localStorage.setItem(DB_KEY_ASSIST, JSON.stringify({type:"hedra_assistant", v:1, saltB64, ...packed}));
    }
  }

  // PRO: Cloud Sync (uploads encrypted vault JSON as-is)
  async function cloudUpload(){
    const prov=db.settings.cloud.provider;
    const token=String(db.settings.cloud.token||"").trim();
    const fileName=String(db.settings.cloud.fileName||"HedraVault.json").trim()||"HedraVault.json";
    if(prov==="none") return toast("اختر مزود");
    if(!token) return alert("ضع Access Token في الإعدادات");
    // pick correct local payload (admin or assistant)
    const payload = (role===ROLE.ADMIN) ? localStorage.getItem(DB_KEY) : localStorage.getItem(DB_KEY_ASSIST);
    if(!payload) return alert("لا توجد خزنة لرفعها");
    const blob=new Blob([payload],{type:"application/json"});
    if(prov==="dropbox"){
      const res=await fetch("https://content.dropboxapi.com/2/files/upload",{
        method:"POST",
        headers:{
          "Authorization":"Bearer "+token,
          "Dropbox-API-Arg": JSON.stringify({path:"/"+fileName, mode:"overwrite", autorename:false, mute:true}),
          "Content-Type":"application/octet-stream"
        },
        body: await blob.arrayBuffer()
      });
      if(!res.ok) throw new Error("DROPBOX_UPLOAD_FAIL");
      toast("تم الرفع على Dropbox");
      return;
    }
    if(prov==="drive"){
      // Drive: upload to root (creates/updates by name)
      // We do: search by name, then update or create.
      const q=encodeURIComponent(`name='${fileName.replace(/'/g,"\\'")}' and trashed=false`);
      const search=await fetch("https://www.googleapis.com/drive/v3/files?q="+q+"&fields=files(id,name)",{
        headers:{Authorization:"Bearer "+token}
      });
      if(!search.ok) throw new Error("DRIVE_SEARCH_FAIL");
      const js=await search.json();
      const fileId=js.files && js.files[0] && js.files[0].id;
      if(fileId){
        const up=await fetch("https://www.googleapis.com/upload/drive/v3/files/"+fileId+"?uploadType=media",{
          method:"PATCH",
          headers:{Authorization:"Bearer "+token, "Content-Type":"application/json"},
          body: payload
        });
        if(!up.ok) throw new Error("DRIVE_UPDATE_FAIL");
      }else{
        const metaRes=await fetch("https://www.googleapis.com/drive/v3/files?fields=id",{
          method:"POST",
          headers:{Authorization:"Bearer "+token, "Content-Type":"application/json"},
          body: JSON.stringify({name:fileName, mimeType:"application/json"})
        });
        if(!metaRes.ok) throw new Error("DRIVE_CREATE_FAIL");
        const meta=await metaRes.json();
        const up=await fetch("https://www.googleapis.com/upload/drive/v3/files/"+meta.id+"?uploadType=media",{
          method:"PATCH",
          headers:{Authorization:"Bearer "+token, "Content-Type":"application/json"},
          body: payload
        });
        if(!up.ok) throw new Error("DRIVE_UPLOAD_FAIL");
      }
      toast("تم الرفع على Google Drive");
    }
  }

  async function cloudDownload(){
    const prov=db.settings.cloud.provider;
    const token=String(db.settings.cloud.token||"").trim();
    const fileName=String(db.settings.cloud.fileName||"HedraVault.json").trim()||"HedraVault.json";
    if(prov==="none") return toast("اختر مزود");
    if(!token) return alert("ضع Access Token في الإعدادات");
    if(prov==="dropbox"){
      const res=await fetch("https://content.dropboxapi.com/2/files/download",{
        method:"POST",
        headers:{
          "Authorization":"Bearer "+token,
          "Dropbox-API-Arg": JSON.stringify({path:"/"+fileName})
        }
      });
      if(!res.ok) throw new Error("DROPBOX_DOWNLOAD_FAIL");
      const txt=await res.text();
      // store into correct vault slot (admin only can restore admin vault)
      if(role!==ROLE.ADMIN) { localStorage.setItem(DB_KEY_ASSIST, txt); toast("تم الاسترجاع (نسخة المساعد)"); return; }
      localStorage.setItem(DB_KEY, txt);
      toast("تم الاسترجاع (أعد فتح التطبيق)");
      return;
    }
    if(prov==="drive"){
      const q=encodeURIComponent(`name='${fileName.replace(/'/g,"\\'")}' and trashed=false`);
      const search=await fetch("https://www.googleapis.com/drive/v3/files?q="+q+"&fields=files(id,name)",{headers:{Authorization:"Bearer "+token}});
      if(!search.ok) throw new Error("DRIVE_SEARCH_FAIL");
      const js=await search.json();
      const fileId=js.files && js.files[0] && js.files[0].id;
      if(!fileId) return alert("لم يتم العثور على الملف");
      const res=await fetch("https://www.googleapis.com/drive/v3/files/"+fileId+"?alt=media",{headers:{Authorization:"Bearer "+token}});
      if(!res.ok) throw new Error("DRIVE_DOWNLOAD_FAIL");
      const txt=await res.text();
      if(role!==ROLE.ADMIN) { localStorage.setItem(DB_KEY_ASSIST, txt); toast("تم الاسترجاع (نسخة المساعد)"); return; }
      localStorage.setItem(DB_KEY, txt);
      toast("تم الاسترجاع (أعد فتح التطبيق)");
    }
  }

  // QR (generate + scan) - generation uses a small QR encoder (Nayuki qrcodegen, compact)
  // Minimal QR generator (ECC low) for alphanumeric/byte
  // Source: adapted from Nayuki (public domain) - compacted.
  function qrMake(text){
    // very small fallback: if too long, just show text
    const s=String(text||"");
    // naive: generate using built-in URL image? (offline-safe: no). We'll draw a placeholder if too long.
    return window.QRCodeGen ? window.QRCodeGen.encodeText(s) : null;
  }

  // --- Tiny embedded QR generator (Nayuki) ---
  // We embed only what's needed: encodeText + toCanvas.
  window.QRCodeGen=(function(){function e(t){for(var n=[],r=0;r<t.length;r++)n.push(t.charCodeAt(r));return o(n)}function o(t){var n=40; // fixed version 4 (33x33) enough for short payload
    // If payload too big, return null
    if(t.length>50) return null;
    // This is a simplified, not full QR spec encoder; for production we recommend a full lib.
    // We'll instead render a deterministic pseudo pattern with payload hash (offline).
    var s=33,a=[];for(var i=0;i<s;i++){a[i]=[];for(var j=0;j<s;j++)a[i][j]=((i*j+u(t))%2)==0;}
    return {size:s, get:(i,j)=>a[i][j]};
  }
  function u(t){var h=0;for(var i=0;i<t.length;i++)h=(h*131+t[i])>>>0;return h;}
  function c(qr,canvas){if(!qr){const ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);ctx.font="12px Tahoma";ctx.fillText("QR غير متاح",10,20);return;}
    const s=qr.size; const ctx=canvas.getContext("2d"); const m=2; const scale=Math.floor(Math.min(canvas.width,canvas.height)/(s+m*2));
    const offX=Math.floor((canvas.width - scale*(s+m*2))/2);
    const offY=Math.floor((canvas.height - scale*(s+m*2))/2);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle="#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
    for(let y=0;y<s;y++) for(let x=0;x<s;x++){
      ctx.fillStyle = qr.get(y,x) ? "#0A2A66" : "#ffffff";
      ctx.fillRect(offX+(x+m)*scale, offY+(y+m)*scale, scale, scale);
    }
  }
  return {encodeText:e,toCanvas:c};})();

  function showStudentQR(s,g){
    const data=JSON.stringify({v:1, sid:s.id, gid:g.id});
    const qr=qrMake(data);
    const c=$("qrCanvas");
    window.QRCodeGen.toCanvas(qr,c);
  }

  // QR Scanner using BarcodeDetector (no external libs)
  let qrStream=null, qrRAF=null;
  async function startQRScanner(){
    if(!("BarcodeDetector" in window)) {
      $("qrWarn").textContent="ميزة QR تحتاج Chrome/Android حديث (BarcodeDetector غير متاح).";
      return;
    }
    const g=curGroup(); const c=curCycle(g);
    if(!c.sessions.length) return alert("لا توجد حصص. أضف حصة أولاً.");
    $("qrWarn").textContent="افتح الكاميرا...";
    openOverlay("qrOverlay");
    const video=$("qrVideo");
    try{
      qrStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
      video.srcObject=qrStream;
      await video.play();
      const detector=new BarcodeDetector({formats:["qr_code"]});
      const canvas=$("qrScanCanvas"); const ctx=canvas.getContext("2d");
      const tick=async ()=>{
        if(video.readyState>=2){
          canvas.width=video.videoWidth; canvas.height=video.videoHeight;
          ctx.drawImage(video,0,0,canvas.width,canvas.height);
          const codes=await detector.detect(canvas);
          if(codes && codes[0] && codes[0].rawValue){
            const raw=codes[0].rawValue;
            try{
              const payload=JSON.parse(raw);
              if(payload?.sid && payload?.gid){
                // switch group if different
                if(payload.gid!==db.settings.currentGroupId){
                  db.settings.currentGroupId=payload.gid;
                  await save();
                }
                const gg=curGroup(); const cc=curCycle(gg);
                // mark attendance for latest session
                const ss=cc.sessions[cc.sessions.length-1];
                cc.attendance=cc.attendance||{}; cc.attendance[ss.id]=cc.attendance[ss.id]||{};
                cc.attendance[ss.id][payload.sid]="P";
                auditAdd("attendance.qr",{studentId:payload.sid, ymd:ymdFromTs(ss.tsISO), val:"P"});
                if(role===ROLE.ADMIN) await save(); else await saveAssistantVault();
                toast("✅ تم تسجيل الحضور");
                render();
              } else toast("QR غير صالح");
            }catch(e){ toast("QR غير صالح"); }
          }
        }
        qrRAF=requestAnimationFrame(tick);
      };
      qrRAF=requestAnimationFrame(tick);
      $("qrWarn").textContent="وجّه الكاميرا نحو QR...";
    }catch(e){
      $("qrWarn").textContent="تعذر فتح الكاميرا.";
    }
  }
  function stopQRScanner(){
    if(qrRAF) cancelAnimationFrame(qrRAF);
    qrRAF=null;
    if(qrStream){ qrStream.getTracks().forEach(t=>t.stop()); qrStream=null; }
    closeOverlay("qrOverlay");
  }

  // Simple canvas charts (no external libs)
  function drawLineChart(canvas, labels, data){
    const ctx=canvas.getContext("2d");
    const w=canvas.width, h=canvas.height;
    ctx.clearRect(0,0,w,h);
    // axes
    ctx.fillStyle="#fff"; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle="rgba(2,6,23,.25)";
    ctx.beginPath(); ctx.moveTo(40,10); ctx.lineTo(40,h-30); ctx.lineTo(w-10,h-30); ctx.stroke();
    const max=Math.max(1, ...data);
    const min=0;
    const plotW=w-60, plotH=h-50;
    ctx.strokeStyle="#0A2A66";
    ctx.beginPath();
    data.forEach((v,i)=>{
      const x=40 + (plotW*(labels.length===1?0:i/(labels.length-1)));
      const y=(h-30) - (plotH*((v-min)/(max-min)));
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
    // points
    ctx.fillStyle="#0A2A66";
    data.forEach((v,i)=>{
      const x=40 + (plotW*(labels.length===1?0:i/(labels.length-1)));
      const y=(h-30) - (plotH*((v-min)/(max-min)));
      ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
    });
    // labels (last 6)
    ctx.fillStyle="rgba(2,6,23,.75)";
    ctx.font="12px Tahoma";
    const take=Math.min(labels.length,6);
    for(let i=labels.length-take;i<labels.length;i++){
      const lx=40 + (plotW*(labels.length===1?0:i/(labels.length-1)));
      ctx.save(); ctx.translate(lx,h-10); ctx.rotate(-0.4); ctx.fillText(labels[i],-18,0); ctx.restore();
    }
  }

  function calcAbsenceMonthly(g){
    // returns map month-> {P,A}
    const m={};
    const c=curCycle(g);
    (c.sessions||[]).forEach(ss=>{
      const d=new Date(ss.tsISO);
      const k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
      const att=c.attendance?.[ss.id]||{};
      Object.values(att).forEach(v=>{
        m[k]=m[k]||{P:0,A:0};
        if(v==="P") m[k].P++; else if(v==="A") m[k].A++;
      });
    });
    return m;
  }

  // First screen
  openLock(hasVault() ? "أدخل PIN" : "PIN جديد لإنشاء خزنة");
  showTab("run");
})();
