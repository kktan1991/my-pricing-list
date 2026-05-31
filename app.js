/* ============================================================
   AI Omic 3D site — interactions
   ============================================================ */
(function () {
  "use strict";
  const root = document.documentElement;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- header shadow on scroll ---------- */
  const header = document.getElementById("header");
  const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 12);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------- scroll reveal (fail-safe) ---------- */
  const reveals = document.querySelectorAll(".reveal");
  const revealNow = (el) => el.classList.add("in");
  const inView = (el) => {
    const r = el.getBoundingClientRect();
    return r.top < (window.innerHeight || 800) * 0.92 && r.bottom > 0;
  };
  // Anything visible on first paint reveals immediately (no observer dependency).
  reveals.forEach((el) => { if (inView(el)) revealNow(el); });

  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { revealNow(e.target); io.unobserve(e.target); }
      }),
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach(revealNow);
  }
  // Safety net: never leave content hidden if the observer misbehaves.
  setTimeout(() => reveals.forEach((el) => {
    if (!el.classList.contains("in") && inView(el)) revealNow(el);
  }), 1500);
  // Stall detector: if entrance transitions aren't progressing (paused timeline in
  // some preview/export iframes), force everything visible with no transition.
  setTimeout(() => {
    const probe = [...reveals].find((el) => el.classList.contains("in") && inView(el));
    if (probe && parseFloat(getComputedStyle(probe).opacity) < 0.5) {
      root.classList.add("reveal-snap");
    }
  }, 1000);

  /* ---------- 3D hero parallax (mouse + scroll) ---------- */
  const stage = document.getElementById("stage");
  const stage3d = document.getElementById("stage3d");
  let targetRX = 0, targetRY = 0, curRX = 0, curRY = 0, raf = null;

  function isCalm() { return root.getAttribute("data-motion") === "calm" || reduce; }

  function animateStage() {
    curRX += (targetRX - curRX) * 0.08;
    curRY += (targetRY - curRY) * 0.08;
    stage3d.style.transform = `rotateX(${curRX}deg) rotateY(${curRY}deg)`;
    if (Math.abs(targetRX - curRX) > 0.01 || Math.abs(targetRY - curRY) > 0.01) {
      raf = requestAnimationFrame(animateStage);
    } else { raf = null; }
  }
  function kick() { if (!raf) raf = requestAnimationFrame(animateStage); }

  if (stage && stage3d) {
    stage.addEventListener("pointermove", (e) => {
      if (isCalm()) return;
      const r = stage.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      targetRY = px * 18;
      targetRX = -py * 14;
      kick();
    });
    stage.addEventListener("pointerleave", () => { targetRX = 0; targetRY = 0; kick(); });
  }

  /* ---------- package glint follows cursor ---------- */
  document.querySelectorAll(".pkg").forEach((card) => {
    const glint = card.querySelector(".pkg-glint");
    if (!glint) return;
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      glint.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
      glint.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
    });
  });

  /* ---------- intake form + copy buttons ---------- */
  const intakeForm = document.querySelector("[data-intake-form]");
  const summaryOut = document.querySelector("[data-summary]");
  function buildSummary(f) {
    const data = new FormData(f);
    const lines = ["AI Omic — Requirements", ""];
    for (const name of new Set(data.keys())) {
      const vals = data.getAll(name).filter(Boolean);
      if (vals.length) lines.push(name + ": " + vals.join(", "));
    }
    return lines.join("\n");
  }
  function showSummary(text, title) {
    if (!summaryOut) return;
    summaryOut.textContent = title + "\n\n" + text;
    summaryOut.classList.add("show");
  }
  intakeForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!intakeForm.reportValidity()) return;
    showSummary(buildSummary(intakeForm), "Submitted — please send this summary to us on WhatsApp so we can reply within 1 business day.");
  });
  document.querySelector("[data-copy-summary]")?.addEventListener("click", async () => {
    if (!intakeForm) return;
    const text = buildSummary(intakeForm);
    try { await navigator.clipboard.writeText(text); showSummary(text, "Copied to clipboard."); }
    catch { showSummary(text, "Copy this text and send it to us on WhatsApp:"); }
  });
  document.querySelectorAll("[data-copy-template]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const block = btn.closest(".tmpl-card")?.querySelector("[data-copy-block]");
      if (!block) return;
      const label = btn.querySelector("span");
      try {
        await navigator.clipboard.writeText(block.textContent.trim());
        if (label) { const o = label.textContent; label.textContent = "Copied ✓"; setTimeout(() => (label.textContent = o), 1200); }
      } catch (e) { /* clipboard blocked */ }
    });
  });

  /* ============================================================
     Node-network background (data flowing through the page)
     ============================================================ */
  const canvas = document.getElementById("net-canvas");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
  let nodes = [], pulses = [], netRAF = null;

  function densityCount() {
    const base = Math.min(86, Math.floor((window.innerWidth * window.innerHeight) / 19000));
    const m = root.getAttribute("data-motion");
    if (m === "calm") return Math.floor(base * 0.55);
    if (m === "lively") return Math.floor(base * 1.25);
    return base;
  }
  function speedFactor() {
    const m = root.getAttribute("data-motion");
    return m === "calm" ? 0.35 : m === "lively" ? 1.4 : 0.85;
  }
  function accents() {
    const cs = getComputedStyle(root);
    return {
      a1: cs.getPropertyValue("--a1").trim() || "#19c9b3",
      a2: cs.getPropertyValue("--a2").trim() || "#3b86ff",
      dark: root.getAttribute("data-theme") === "dark",
    };
  }

  function resize() {
    W = canvas.width = Math.floor(window.innerWidth * DPR);
    H = canvas.height = Math.floor(window.innerHeight * DPR);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
  }

  function buildNodes() {
    const n = densityCount();
    nodes = [];
    for (let i = 0; i < n; i++) {
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.22 * DPR,
        vy: (Math.random() - 0.5) * 0.22 * DPR,
        r: (Math.random() * 1.6 + 0.8) * DPR,
      });
    }
    pulses = [];
  }

  function spawnPulse() {
    if (nodes.length < 2) return;
    const a = nodes[(Math.random() * nodes.length) | 0];
    // find a near neighbour
    let best = null, bd = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const b = nodes[i];
      if (b === a) continue;
      const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
      if (d < bd && d > 100) { bd = d; best = b; }
    }
    if (best && bd < (170 * DPR) ** 2) pulses.push({ a, b: best, t: Math.random() * 0.3 });
  }

  function draw() {
    const { a1, a2, dark } = accents();
    const linkDist = 150 * DPR;
    const sp = speedFactor();
    ctx.clearRect(0, 0, W, H);

    for (const p of nodes) {
      p.x += p.vx * sp; p.y += p.vy * sp;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    }

    // links
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < linkDist) {
          const alpha = (1 - d / linkDist) * (dark ? 0.4 : 0.26);
          ctx.strokeStyle = hexA(i % 2 ? a2 : a1, alpha);
          ctx.lineWidth = 1 * DPR;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }

    // nodes
    for (const p of nodes) {
      ctx.fillStyle = hexA(a1, dark ? 0.7 : 0.55);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }

    // pulses travelling along edges
    if (Math.random() < 0.04 * sp && pulses.length < 18) spawnPulse();
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pu = pulses[i];
      pu.t += 0.012 * sp;
      if (pu.t >= 1) { pulses.splice(i, 1); continue; }
      const x = pu.a.x + (pu.b.x - pu.a.x) * pu.t;
      const y = pu.a.y + (pu.b.y - pu.a.y) * pu.t;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 5 * DPR);
      g.addColorStop(0, hexA(a2, 0.95));
      g.addColorStop(1, hexA(a2, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 5 * DPR, 0, Math.PI * 2); ctx.fill();
    }

    netRAF = requestAnimationFrame(draw);
  }

  function hexA(hex, a) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    return `rgba(${r},${g},${b},${a})`;
  }

  function startNet() {
    if (netRAF) cancelAnimationFrame(netRAF);
    resize(); buildNodes();
    if (reduce) { drawStatic(); return; }
    draw();
  }
  function drawStatic() {
    // single static frame for reduced motion
    const { a1, dark } = accents();
    ctx.clearRect(0, 0, W, H);
    for (const p of nodes) { ctx.fillStyle = hexA(a1, dark ? 0.5 : 0.4); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
  }

  startNet();
  let rsTimer;
  window.addEventListener("resize", () => {
    clearTimeout(rsTimer);
    rsTimer = setTimeout(startNet, 180);
  });
  // expose so tweaks can rebuild on motion change
  window.__omicRebuildNet = startNet;

  /* ============================================================
     i18n — EN / 中文
     ============================================================ */
  const HTML_KEYS = new Set([
    "heroTitle", "footerMeta",
    "formTitle", "lblName", "lblPhone", "lblDirection",
    "pbTitle", "blogTitle", "cat1", "cat2", "cat3", "cat4", "cat5", "cat6"
  ]);
  const zh = {
    brandSlogan: "让工作流更顺", brandSlogan2: "Make Work Flow Better · 让工作流更顺",
    navFlow: "流程", navPackages: "配套", navResults: "客户成果", navProcess: "售前流程",
    navBlog: "文章", navPlaybook: "模板",
    navCta: "开始", waLabel: "WhatsApp",
    crumbHome: "首页", crumbForm: "需求表单", crumbPlaybook: "模板", crumbBlog: "文章",
    heroEyebrow: "AI 与自动化 · 马来西亚 SME",
    heroTitle: '让工作流 <span class="grad">更顺更轻松。</span>',
    heroLede: "我们把重复的手工工作变成清楚、自动化的运作流程——从免费初诊，到为团队打造并长期支持的 AI workflow。",
    heroPrimary: "预约免费初诊", heroSecondary: "看看怎么运作",
    stat1n: "1 天", stat1l: "WhatsApp 回复", stat2n: "14 天", stat2l: "上线后支持",
    stat3n: "n8n + AI", stat3l: "用真实工具搭建",
    fc1t: "新询问", fc1s: "从 WhatsApp 自动捕捉",
    fc2t: "记录到 Sheet", fc2s: "状态 · 负责人",
    fc3t: "AI 草拟回复", fc3s: "已分类与路由",
    fc4t: "通知老板", fc4p: "完成",
    toolsHead: "搭建在你生意已经信任的工具之上",
    flowEyebrow: "服务旅程", flowTitle: "从手工混乱，到顺畅 workflow",
    flowIntro: "一条保护双方时间的清楚路径：先判断 fit，做好范围，再 build、测试和支持。",
    flow1t: "需求表单", flow1d: "你说明痛点、现有工具、工作量、预算和时间线。",
    flow2t: "免费初诊", flow2d: "15–30 分钟确认自动化是否真的能省时间、减少漏单。",
    flow3t: "审计或报价", flow3d: "范围不清楚先做 RM299–499 审计；清楚就直接报价。",
    flow4t: "Build 与支持", flow4d: "Build、测试、handover、14 天 WhatsApp support，可转月费维护。",
    pkgEyebrow: "服务配套", pkgTitle: "四个入口：从诊断到 AI workflow",
    pkgIntro: "每个配套都围绕结果——省 admin 时间、减少漏回复、减少漏单，并让老板看得到状态。",
    p1tag: "需求不清楚", p1t: "Workflow Audit", p1d: "付费诊断，交付简单流程图、推荐方案、预算范围和实施计划。",
    pkgCta: "从这里开始", pkgCta2: "从这里开始", pkgCta3: "从这里开始", pkgCta4: "从这里开始",
    p2tag: "Starter", p2t: "Basic Automation", p2s: "月费支持 RM 300–500",
    p2d: "Excel、Google Sheets、表单、admin tracking、通知和简单 reporting。",
    p3tag: "主推方案", p3t: "AI Automation Flow", p3s: "月费支持 RM 500–800",
    p3d: "n8n workflow、AI 分类、AI 回复、文件提取、routing、提醒和审批流程。",
    p4tag: "Chat", p4t: "AI Chatbot", p4s: "月费支持 RM 600–1,000",
    p4d: "客服 chatbot、FAQ bot、文件问答、lead capture 和人工交接。",
    resEyebrow: "客户成果", resTitle: "用省下的时间衡量，不是炫技",
    resIntro: "好的 AI 项目用节省的时间、更少的人工检查和更好的决定来衡量。",
    r1role: "销售主管 · Incentive 自动化",
    r1q: "以前计算每月销售 incentive 是我最不喜欢的工作。这个 AI 系统几秒完成繁重计算，每次都算得准确——任何销售主管都需要的省时工具。",
    r2role: "部门主管 · 研究与策略",
    r2q: "它即时提取并整理过去需要几天才能完成的市场研究，为我节省大量时间，让我更专注在数据驱动的 coaching 和推动 revenue。",
    r3role: "Product Manager · 制药",
    r3q: "用 AI 准备 slides 彻底改变了我的工作流程。我不用再花太多时间处理版面，可以更专注策略——产出更专业，让团队印象深刻。",
    procEyebrow: "售前流程", procTitle: "Lead 如何变成有范围的项目",
    procIntro: "第一次沟通先判断 fit，再把不清楚的工作带入付费审计——双方时间都被保护。",
    ps1t: "1 个工作日内回复", ps1d: "确认收到表单，只补问判断 fit 需要的缺失资料。",
    ps2t: "15–30 分钟免费初诊", ps2d: "确认痛点、工具、工作量、预算和时间线。",
    ps3t: "不清楚做审计，清楚就报价", ps3d: "Audit 交付流程图；清楚范围直接给报价和条款。",
    ps4t: "50% deposit，handover 前付清", ps4d: "每份报价写清 scope、deliverables、exclusions、revision 和 timeline。",
    scenSub: "我们自动化的 SME 场景",
    sc1t: "餐饮 / 零售", sc1d: "WhatsApp 询问自动记录到 Google Sheets，含状态、负责人和跟进提醒。",
    sc2t: "电商", sc2d: "订单、客服讯息、库存提醒和发货更新进入同一条 workflow。",
    sc3t: "专业服务业", sc3d: "文件整理、客户自动跟进，并用 chatbot 回答常见问题。",
    ctaEyebrow: "聊聊吧", ctaTitle: "准备把手工流程变成可运行的 workflow？",
    ctaText: "告诉我们什么工作最花时间。我们会在 1 个工作日内通过 WhatsApp 回复。",
    ctaPrimary: "WhatsApp 联系我们", ctaSecondary: "查看流程",
    footerMeta: '平台费用（n8n、AI API、WhatsApp Business）由客户直接支付。Ad-hoc rate RM 100/hr。<a href="https://wa.me/601128229985" target="_blank" rel="noopener">WhatsApp +60 11-2822 9985</a>',

    /* ---- intake form ---- */
    formTitle: '告诉我们什么工作 <span class="grad">最花时间。</span>',
    formLede: "少于 3 分钟。我们会判断适合 audit、automation 还是 chatbot，并在 1 个工作日内通过 WhatsApp 回复。",
    mf1t: "你说明痛点", mf1s: "工具 · 数量 · 预算",
    mf2t: "我们判断 fit", mf2s: "审计、自动化或 bot",
    mf3t: "1 天内回复", mf3s: "通过 WhatsApp",
    s1: "你的资料", s2: "手工工作与工具", s3: "想要的结果", s4: "服务适配", s5: "预算与补充",
    lblName: "姓名 <em class='req'>*</em>", lblCompany: "公司名称",
    lblPhone: "WhatsApp / 电话 <em class='req'>*</em>", lblEmail: "Email",
    lblIndustry: "行业 / 生意类型",
    lblTime: "目前什么工作最花时间？", toolForms: "表单", toolOther: "其他",
    lblTools: "你现在使用哪些平台 / 工具？", lblVolume: "每天 / 每周大概数量",
    lblProblem: "你最想解决的一个问题", lblSuccess: "对你来说，怎样算成功？",
    lblTimeline: "时间线", optSelect: "请选择…",
    tlASAP: "尽快", tl12: "1–2 周", tlMonth: "这个月", tlQuarter: "这个季度", tlExplore: "只是了解",
    lblDirection: "哪一个服务方向比较适合？<em class='req'>*</em>", dirNotSure: "还不确定",
    lblSupport: "偏好的支持方式", supOnce: "一次性 build", supMonthly: "月费支持", supNotSure: "不确定",
    lblBudget: "大概预算", budNotSure: "不确定",
    lblNotes: "还有什么想让我们知道？",
    costNote: "平台费用（n8n、AI API、WhatsApp Business）由客户直接支付。",
    btnCopy: "复制成文字", btnSubmit: "提交需求",

    /* ---- playbook ---- */
    pbEyebrow: "内部执行模板", pbTitle: '售前与售后 <span class="grad">Playbook。</span>',
    pbLede: "可复制的模板，让 WhatsApp 回复、报价、handover 和售后边界在每个项目都保持一致。",
    pbRuleT: "默认规则", pbRuleD: "免费咨询只判断 fit；详细方案设计永远放在付费 Workflow Audit 里面。",
    t1Title: "WhatsApp 第一回复", t2Title: "Workflow Audit 话术", t3Title: "报价结构",
    t4Title: "Handover checklist", t5Title: "月费支持范围", t6Title: "Sign-off 讯息",
    copyBtn: "复制模板", copyBtn2: "复制模板", copyBtn3: "复制模板",
    copyBtn4: "复制模板", copyBtn5: "复制模板", copyBtn6: "复制模板",

    /* ---- blog ---- */
    blogEyebrow: "工作坊笔记", blogTitle: '务实自动化，<span class="grad">不炫技。</span>',
    blogLede: "关于自动化马来西亚 SME 真实工作的现场笔记——先自动化什么、什么先别碰，以及如何让 AI 一直有用。",
    phCover: "封面图",
    cat1: "AI Workflow <span>·</span> 中文", post1t: "AI 正在从 Prompt 走向流程编排。",
    post1d: "如果 AI 生成内容后还需要你手动复制、整理、排版和发送，真正的瓶颈可能不是 AI，而是还没有被自动化的工作流。",
    cat2: "AI Workflow <span>·</span> 中文", post2t: "好的 AI 报告，靠的不是一个神仙 Prompt。",
    post2d: "深度内容的质量，往往来自多智能体分工：规划、标题、章节撰写、参考资料和目录整理各自负责不同角色。",
    cat3: "AI Workflow <span>·</span> 中文", post3t: "不懂代码，也可以成为 AI 系统调度者。",
    post3d: "真正的效率飞跃，是从 AI 使用者转变为系统调度者，把不同 AI 工具分配到可重复的流程里。",
    cat4: "OCR Automation <span>·</span> 中文", post4t: "每天都在处理成堆的发票和单据？",
    post4d: "OCR 与 AI 可以把收据、发票、财务报表和知识归档串成一条更顺畅的文件工作流。",
    cat5: "Workflow Friction <span>·</span> 中文", post5t: "企业真正的瓶颈，是信息怎样流动。",
    post5d: "企业采用 AI 与自动化的核心价值，不是取代员工，而是降低 workflow friction。",
    cat6: "Workflow Friction <span>·</span> English", post6t: "The future company may be organized around workflows.",
    post6d: "AI changes company operations by connecting OCR, classification, routing, exception review, ERP updates, and audit trails.",    readMore: "阅读文章", readMore2: "阅读文章", readMore3: "阅读文章",
    readMore4: "阅读文章", readMore5: "阅读文章", readMore6: "阅读文章",
  };

  const nodesI18n = document.querySelectorAll("[data-i18n]");
  const enDefaults = new Map();
  nodesI18n.forEach((n) => {
    const key = n.dataset.i18n;
    enDefaults.set(n, HTML_KEYS.has(key) ? n.innerHTML : n.textContent);
  });

  function applyLang(lang) {
    root.lang = lang === "zh" ? "zh-Hans" : "en";
    document.body.classList.toggle("lang-zh", lang === "zh");
    nodesI18n.forEach((n) => {
      const key = n.dataset.i18n;
      const val = lang === "en" ? enDefaults.get(n) : zh[key];
      if (val === undefined) return;
      if (HTML_KEYS.has(key)) n.innerHTML = val; else n.textContent = val;
    });
    const btn = document.getElementById("langToggle");
    if (btn) btn.textContent = lang === "zh" ? "EN" : "中文";
    localStorage.setItem("omicLang", lang);
  }
  applyLang(localStorage.getItem("omicLang") || "en");
  document.getElementById("langToggle")?.addEventListener("click", () => {
    applyLang(localStorage.getItem("omicLang") === "zh" ? "en" : "zh");
  });

  /* ---------- Xiao O assistant ---------- */
  const INTAKE_URL = "intake-form.html";
  const xiaoOAnswers = [
    {
      test: /(price|pricing|cost|fee|quote|how much|多少钱|几多钱|价格|报价|费用|收费|预算)/i,
      en:
        "Here is the usual range:\n\nWorkflow Audit: RM299-RM499\nBasic Automation: RM500-RM1,200\nAI Automation Flow: RM1,500-RM3,500\nAI Chatbot: RM2,000-RM4,500\n\nMonthly support usually starts from RM300, and chatbot support is usually RM600-RM1,000/month. Final pricing depends on channels, documents, integrations, AI/RAG needs, and handoff rules.",
      zh:
        "一般价格范围是：\n\nWorkflow Audit：RM299-RM499\nBasic Automation：RM500-RM1,200\nAI Automation Flow：RM1,500-RM3,500\nAI Chatbot：RM2,000-RM4,500\n\n月费维护通常从 RM300 起，Chatbot support 通常是 RM600-RM1,000/月。最终报价要看渠道、文件、系统串接、AI/RAG 需求和人工交接规则。"
    },
    {
      test: /(chatbot|bot|whatsapp|telegram|faq|客服|文件问答|人工交接)/i,
      en:
        "AI Omic can build WhatsApp, Web, or Telegram AI chatbots for FAQ replies, document Q&A, lead capture, routing, and handoff to a human team. It is best when your team repeats the same answers or needs enquiries captured before someone replies.",
      zh:
        "AI Omic 可以做 WhatsApp、Web 或 Telegram AI Chatbot，适合 FAQ 回答、文件问答、lead capture、分类 routing 和人工交接。如果团队经常重复回答同样问题，或需要先自动收集 enquiry 资料，就很适合。"
    },
    {
      test: /(audit|scope|unclear|diagnose|审计|范围|不清楚|诊断)/i,
      en:
        "Workflow Audit is the paid diagnosis step when the scope is unclear. It maps the process, identifies leakage, recommends the automation path, and gives a realistic budget before build work starts.",
      zh:
        "Workflow Audit 是需求还不清楚时的付费诊断。它会整理流程、找出漏点、建议自动化路径，并在正式 build 之前给出比较现实的预算范围。"
    },
    {
      test: /(support|aftercare|maintenance|monthly|售后|维护|月费|支援)/i,
      en:
        "Projects include 14 days of WhatsApp support after launch. After that, monthly support can cover bug fixes, monitoring, small changes, prompt tuning, and workflow adjustments.",
      zh:
        "项目上线后包含 14 天 WhatsApp support。之后可以转月费维护，包含 bug fixing、monitoring、小修改、prompt tuning 和 workflow 调整。"
    },
    {
      test: /(service|services|provide|offer|package|plan|automation|workflow|服务|配套|方案|自动化|工作流)/i,
      en:
        "AI Omic offers four main services: Workflow Audit, Basic Automation, AI Automation Flow, and AI Chatbot. The goal is to reduce manual admin, missed replies, and messy handovers using practical tools like Sheets, n8n, AI, WhatsApp, and document workflows.",
      zh:
        "AI Omic 主要提供四类服务：Workflow Audit、Basic Automation、AI Automation Flow 和 AI Chatbot。目标是用实际工具，例如 Sheets、n8n、AI、WhatsApp 和文件流程，减少手工 admin、漏回复和交接混乱。"
    }
  ];

  function currentAssistantLang(text = "") {
    if (/[\u3400-\u9fff]/.test(text)) return "zh";
    return localStorage.getItem("omicLang") === "zh" ? "zh" : "en";
  }

  function assistantReply(message) {
    const lang = currentAssistantLang(message);
    const match = xiaoOAnswers.find((item) => item.test.test(message));
    const answer = match
      ? match[lang]
      : lang === "zh"
        ? `小O 可以回答 AI Omic 的服务、价格、Workflow Audit、AI Automation Flow、AI Chatbot 和售后支持问题。\n\n如果你要咨询具体 workflow，请填写需求表单：${INTAKE_URL}`
        : `Xiao O can answer questions about AI Omic services, pricing, Workflow Audit, AI Automation Flow, AI Chatbot, and aftercare.\n\nFor a specific workflow, please fill in the intake form: ${INTAKE_URL}`;
    return `${answer}\n\n${lang === "zh" ? "提示：小O 是网站助手，复杂 scope 仍需要 AI Omic 人工确认。" : "Note: Xiao O is a website assistant. Complex scopes still need human confirmation from AI Omic."}`;
  }

  function appendAssistantMessage(container, role, text) {
    const bubble = document.createElement("div");
    bubble.className = `xiao-message ${role}`;
    const parts = text.split(/(https?:\/\/[^\s]+|intake-form\.html)/g);
    parts.forEach((part) => {
      if (/^(https?:\/\/|intake-form\.html)/.test(part)) {
        const link = document.createElement("a");
        link.href = part;
        link.textContent = part;
        link.target = part.startsWith("http") ? "_blank" : "_self";
        link.rel = part.startsWith("http") ? "noopener noreferrer" : "";
        bubble.appendChild(link);
      } else {
        part.split("\n").forEach((line, index, lines) => {
          bubble.append(line);
          if (index < lines.length - 1) bubble.appendChild(document.createElement("br"));
        });
      }
    });
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }

  function createXiaoO() {
    const assistant = document.createElement("section");
    assistant.className = "xiao-assistant";
    assistant.setAttribute("aria-label", "Xiao O AI Omic assistant");
    assistant.innerHTML = `
      <button class="xiao-launcher" type="button" aria-expanded="false" aria-controls="xiao-panel">
        <span class="xiao-bot" aria-hidden="true">
          <span class="xiao-bot-halo"></span>
          <span class="xiao-bot-antenna"></span>
          <span class="xiao-bot-head">
            <span class="xiao-bot-visor">
              <span class="xiao-bot-eye"></span>
              <span class="xiao-bot-eye"></span>
            </span>
          </span>
          <span class="xiao-bot-body">
            <span class="xiao-bot-core"></span>
          </span>
          <span class="xiao-bot-arm xiao-bot-arm-left"></span>
          <span class="xiao-bot-arm xiao-bot-arm-right"></span>
        </span>
        <span class="sr-only">Open Xiao O assistant</span>
      </button>
      <div class="xiao-panel" id="xiao-panel" hidden>
        <header class="xiao-head">
          <div>
            <strong>Xiao O</strong>
            <span>AI Omic assistant</span>
          </div>
          <button class="xiao-close" type="button" aria-label="Close Xiao O">Close</button>
        </header>
        <div class="xiao-messages" aria-live="polite"></div>
        <div class="xiao-prompts" aria-label="Suggested questions">
          <button type="button">AI Chatbot pricing</button>
          <button type="button">What services do you provide?</button>
          <button type="button">什么是 Workflow Audit？</button>
        </div>
        <form class="xiao-form">
          <label class="sr-only" for="xiao-input">Ask Xiao O</label>
          <input id="xiao-input" name="message" autocomplete="off" placeholder="Ask about services, pricing, chatbot..." />
          <button type="submit">Send</button>
        </form>
      </div>
    `;
    document.body.appendChild(assistant);

    const launcher = assistant.querySelector(".xiao-launcher");
    const panel = assistant.querySelector(".xiao-panel");
    const close = assistant.querySelector(".xiao-close");
    const messages = assistant.querySelector(".xiao-messages");
    const form = assistant.querySelector(".xiao-form");
    const input = assistant.querySelector("#xiao-input");

    appendAssistantMessage(
      messages,
      "assistant",
      "Hi, I am Xiao O. Ask me about AI Omic services, pricing, workflow audits, automation, or AI chatbot setup.\n\n你好，我是小O。你可以问我 AI Omic 的服务、价格、自动化流程或 AI Chatbot。"
    );

    function setOpen(open) {
      panel.hidden = !open;
      launcher.setAttribute("aria-expanded", String(open));
      if (open) input.focus();
    }

    launcher.addEventListener("click", () => setOpen(panel.hidden));
    close.addEventListener("click", () => setOpen(false));
    assistant.querySelectorAll(".xiao-prompts button").forEach((button) => {
      button.addEventListener("click", () => {
        const message = button.textContent.trim();
        setOpen(true);
        appendAssistantMessage(messages, "user", message);
        appendAssistantMessage(messages, "assistant", assistantReply(message));
      });
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const message = input.value.trim();
      if (!message) return;
      input.value = "";
      appendAssistantMessage(messages, "user", message);
      window.setTimeout(() => appendAssistantMessage(messages, "assistant", assistantReply(message)), 180);
    });
  }

  createXiaoO();
})();
