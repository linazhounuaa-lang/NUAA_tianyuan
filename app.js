const WorkshopApp = (() => {
  const ADMIN_PASSWORD = "workshop2026";
  const KEYS = {
    recommendations: "workshop_recommendations",
    current: "workshop_current",
    events: "workshop_events",
    admin: "workshop_admin_ok"
  };
  const FACULTY_DIRECTIONS = [
    "光学计算成像、散射介质成像、光学信息安全",
    "微波光子雷达及关键技术",
    "微波光子信号处理技术",
    "微波光子学",
    "集成微波光子技术",
    "硅基光子芯片/器件，集成微波光子技术",
    "微波毫米波天线技术",
    "阵列天线智能综合、系统级电磁兼容、电磁环境效应",
    "电磁超表面、天线理论与技术",
    "非线性光学、集成光子器件、光纤光学",
    "自由空间光载射频",
    "超快微波光子学"
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const config = window.WORKSHOP_CONFIG || {};

  function cloudEnabled() {
    return Boolean(config.supabaseUrl && config.supabaseAnonKey);
  }

  async function cloudRequest(path, options = {}) {
    if (!cloudEnabled()) return null;
    const url = `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase 请求失败：${response.status} ${detail}`);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function loadCloudData() {
    if (!cloudEnabled()) return;
    try {
      const [remoteRecommendations, remoteCurrent, remoteEvents] = await Promise.all([
        cloudRequest("recommendations?select=*&order=created_at.desc"),
        cloudRequest("current_workshop?select=*&id=eq.1"),
        cloudRequest("events?select=*&order=created_at.desc")
      ]);
      write(KEYS.recommendations, remoteRecommendations || []);
      if (remoteCurrent?.[0]) write(KEYS.current, remoteCurrent[0]);
      write(KEYS.events, remoteEvents || []);
    } catch (error) {
      console.error(error);
      alert("云端数据读取失败，当前将使用本机缓存数据。请检查 Supabase 配置或网络。");
    }
  }

  async function cloudInsert(table, row) {
    return cloudRequest(table, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(row)
    });
  }

  async function cloudPatch(table, id, patch) {
    return cloudRequest(`${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
  }

  async function cloudDelete(table, id) {
    return cloudRequest(`${table}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  async function cloudUpsertCurrent(data) {
    return cloudRequest("current_workshop", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: 1, ...data })
    });
  }

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function populateFacultyDirections(root = document) {
    $$("[data-faculty-directions]", root).forEach(select => {
      const current = select.value;
      select.innerHTML = `<option value="">请选择</option>${[...new Set(FACULTY_DIRECTIONS)].map(direction =>
        `<option value="${escapeHtml(direction)}">${escapeHtml(direction)}</option>`
      ).join("")}<option>其他/交叉方向</option>`;
      select.value = current;
    });
  }

  function priorityFor(rec) {
    const reason = rec.reason || "";
    const contact = rec.contact_basis || "";
    const help = rec.can_help_invite || "";
    const aWords = ["项目", "基金", "合作", "申报", "平台", "团队", "重点"];
    const bWords = ["前沿", "方向契合"];
    if (contact === "有合作基础" || help === "是") return "A";
    if (aWords.some(word => reason.includes(word))) return "A";
    if (contact === "认识可联系" || bWords.some(word => reason.includes(word))) return "B";
    return "C";
  }

  function priorityText(p) {
    return p === "A" ? "A类：优先邀请" : p === "B" ? "B类：备选邀请" : "C类：长期跟进";
  }

  function recommendations() {
    return read(KEYS.recommendations, []);
  }

  function saveRecommendations(items) {
    write(KEYS.recommendations, items);
  }

  function currentWorkshop() {
    return read(KEYS.current, {
      issue: "2026年第1期",
      theme: "",
      expert_name: "",
      expert_affiliation: "",
      expert_title: "",
      expert_field: "",
      talk_title: "",
      event_time: "",
      location: "",
      host: "",
      leader: "",
      internal_speaker: "",
      contact_person: "",
      expert_bio: "",
      abstract: ""
    });
  }

  function fields() {
    return [
      ["issue", "期数"], ["theme", "本期主题"], ["expert_name", "邀请专家"],
      ["expert_affiliation", "专家单位"], ["expert_title", "专家职称"], ["expert_field", "专家方向"],
      ["talk_title", "报告题目"], ["event_time", "活动时间"], ["location", "活动地点"],
      ["host", "主持人"], ["leader", "团队领导"], ["internal_speaker", "内部交流人"],
      ["contact_person", "联系人"], ["expert_bio", "专家简介"], ["abstract", "报告摘要"]
    ];
  }

  function leaderText(items = recommendations()) {
    const groups = ["A", "B", "C"].map(level => {
      const rows = items.filter(item => item.priority === level);
      const body = rows.length ? rows.map((r, index) =>
        `${index + 1}. ${r.expert_name}，${r.expert_affiliation}，方向：${r.expert_field}。推荐老师：${r.recommender}。推荐理由：${r.reason}`
      ).join("\n") : "暂无";
      return `【${priorityText(level)}】\n${body}`;
    }).join("\n\n");
    return `${groups}\n\n建议优先从 A 类专家中确定本期 Workshop 邀请对象；若时间不合适，可从 B 类专家中顺次选择。`;
  }

  async function initRecommendationForm() {
    await loadCloudData();
    populateFacultyDirections();
    const form = $("#recommendationForm");
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const rec = {
        id: uid(),
        created_at: new Date().toISOString(),
        ...formData(form),
        invite_status: "待确认",
        leader_decision: "待定",
        leader_comment: ""
      };
      rec.priority = priorityFor(rec);
      saveRecommendations([rec, ...recommendations()]);
      try {
        await cloudInsert("recommendations", rec);
      } catch (error) {
        console.error(error);
        alert("云端保存失败，但数据已临时保存在本机。请联系负责人检查配置。");
      }
      form.reset();
      $("#submitMessage").textContent = "提交成功，感谢您的推荐。负责人将统一汇总并提交团队领导审定。";
    });
  }

  async function initAdmin() {
    await loadCloudData();
    const loginPanel = $("#loginPanel");
    const adminApp = $("#adminApp");
    const unlock = () => {
      loginPanel.classList.add("hidden");
      adminApp.classList.remove("hidden");
      renderAdmin();
    };
    if (sessionStorage.getItem(KEYS.admin) === "1") unlock();
    $("#loginForm").addEventListener("submit", event => {
      event.preventDefault();
      if (formData(event.currentTarget).password === ADMIN_PASSWORD) {
        sessionStorage.setItem(KEYS.admin, "1");
        unlock();
      } else {
        $("#loginMessage").textContent = "口令不正确，请重试。";
      }
    });
  }

  function renderAdmin() {
    renderStats();
    renderRecommendations();
    renderWorkshopForm();
    renderDrafts();
    renderArchive();
    $("#searchInput").oninput = renderRecommendations;
    $("#priorityFilter").onchange = renderRecommendations;
    $("#statusFilter").onchange = renderRecommendations;
    $("#copyLeaderText").onclick = () => copyText(leaderText());
    $("#exportCsv").onclick = exportCsv;
    $("#seedData").onclick = seedData;
    $("#saveWorkshop").onclick = saveWorkshopForm;
    $("#archiveWorkshop").onclick = archiveWorkshop;
  }

  function renderStats() {
    const recs = recommendations();
    const events = read(KEYS.events, []);
    const stats = [
      ["推荐记录数", recs.length],
      ["A 类专家数", recs.filter(r => r.priority === "A").length],
      ["待领导确认数", recs.filter(r => !["是", "备选", "后续跟进", "否"].includes(r.leader_decision)).length],
      ["已归档 Workshop 数", events.length]
    ];
    $("#stats").innerHTML = stats.map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join("");
  }

  function filteredRecommendations() {
    const q = ($("#searchInput")?.value || "").trim().toLowerCase();
    const p = $("#priorityFilter")?.value || "";
    const s = $("#statusFilter")?.value || "";
    return recommendations().filter(r => {
      const blob = [r.expert_name, r.expert_affiliation, r.expert_field, r.recommender, r.theme].join(" ").toLowerCase();
      return (!q || blob.includes(q)) && (!p || r.priority === p) && (!s || r.invite_status === s);
    });
  }

  function renderRecommendations() {
    const rows = filteredRecommendations();
    $("#recordCount").textContent = `当前显示 ${rows.length} 条`;
    $("#recommendationsBody").innerHTML = rows.map(r => `
      <tr>
        <td><span class="pill ${r.priority.toLowerCase()}">${r.priority}</span></td>
        <td><strong>${escapeHtml(r.expert_name)}</strong><br><span class="meta">${escapeHtml(r.expert_affiliation)}</span></td>
        <td>${escapeHtml(r.expert_field)}<br><span class="meta">${escapeHtml(r.theme)}</span></td>
        <td>${escapeHtml(r.recommender)}</td>
        <td>${escapeHtml(r.contact_basis)}<br><span class="meta">${escapeHtml(r.can_help_invite)}</span></td>
        <td>${selectHtml(r.id, "invite_status", ["待确认","已邀请","已接受","时间不合适","暂缓"], r.invite_status)}</td>
        <td>${selectHtml(r.id, "leader_decision", ["待定","是","备选","后续跟进","否"], r.leader_decision)}</td>
        <td><div class="row-actions">
          ${selectHtml(r.id, "priority", ["A","B","C"], r.priority)}
          <button type="button" data-action="current" data-id="${r.id}">设为本期</button>
          <button class="danger" type="button" data-action="delete" data-id="${r.id}">删除</button>
        </div></td>
      </tr>
    `).join("");
    $$("[data-field]").forEach(el => el.addEventListener("change", updateRecommendationField));
    $$("[data-action]").forEach(el => el.addEventListener("click", recommendationAction));
    renderStats();
  }

  function selectHtml(id, field, options, value) {
    return `<select data-id="${id}" data-field="${field}">${options.map(opt =>
      `<option ${opt === value ? "selected" : ""}>${opt}</option>`
    ).join("")}</select>`;
  }

  async function updateRecommendationField(event) {
    const { id, field } = event.currentTarget.dataset;
    const items = recommendations().map(item => item.id === id ? { ...item, [field]: event.currentTarget.value } : item);
    saveRecommendations(items);
    try {
      await cloudPatch("recommendations", id, { [field]: event.currentTarget.value });
    } catch (error) {
      console.error(error);
      alert("云端更新失败，当前只更新了本机缓存。");
    }
    renderRecommendations();
  }

  async function recommendationAction(event) {
    const { id, action } = event.currentTarget.dataset;
    if (action === "delete" && !confirm("确定删除这条推荐记录吗？")) return;
    const items = recommendations();
    const rec = items.find(item => item.id === id);
    if (action === "delete") {
      saveRecommendations(items.filter(item => item.id !== id));
      try {
        await cloudDelete("recommendations", id);
      } catch (error) {
        console.error(error);
        alert("云端删除失败，当前只删除了本机缓存。");
      }
    }
    if (action === "current" && rec) {
      const current = { ...currentWorkshop(), ...pickCurrent(rec), contact_person: "" };
      write(KEYS.current, current);
      try {
        await cloudUpsertCurrent(current);
      } catch (error) {
        console.error(error);
        alert("云端本期信息写入失败，当前只更新了本机缓存。");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    renderAdmin();
  }

  function pickCurrent(rec) {
    return {
      theme: rec.theme,
      expert_name: rec.expert_name,
      expert_affiliation: rec.expert_affiliation,
      expert_title: rec.expert_title,
      expert_field: rec.expert_field,
      talk_title: rec.talk_title
    };
  }

  function renderWorkshopForm() {
    const data = currentWorkshop();
    $("#workshopForm").innerHTML = fields().map(([name, label]) => `
      <label>${label}
        <textarea name="${name}" rows="${["expert_bio", "abstract"].includes(name) ? 4 : 1}">${escapeHtml(data[name] || "")}</textarea>
      </label>
    `).join("");
  }

  async function saveWorkshopForm() {
    const data = formData($("#workshopForm"));
    write(KEYS.current, data);
    try {
      await cloudUpsertCurrent(data);
    } catch (error) {
      console.error(error);
      alert("云端保存失败，当前只保存了本机缓存。");
    }
    renderDrafts();
    alert("本期 Workshop 信息已保存。");
  }

  const draftNames = {
    invite: "专家邀请微信",
    notice: "活动通知",
    host: "主持词",
    news: "新闻稿初稿",
    report: "领导汇报摘要"
  };

  function renderDrafts(active = "invite") {
    $("#draftTabs").innerHTML = Object.entries(draftNames).map(([key, label]) =>
      `<button type="button" data-draft="${key}" aria-selected="${key === active}">${label}</button>`
    ).join("");
    $$("[data-draft]").forEach(btn => btn.addEventListener("click", () => renderDrafts(btn.dataset.draft)));
    $("#draftOutput").value = drafts(currentWorkshop())[active];
  }

  function drafts(w) {
    const talk = w.talk_title || "待定";
    return {
      invite: `${w.expert_name || "XX"}老师您好，打扰您了。我们团队计划每季度组织一次专题学术 Workshop，主要围绕光电信息、智能感知、先进成像与交叉前沿方向开展交流。本季度 Workshop 拟聚焦“${w.theme || "XXX"}”主题。团队老师认为您在 ${w.expert_field || "相关"} 方向的研究与本期主题非常契合，因此想诚挚邀请您在方便的时候来团队作一次专题报告，并与团队老师和学生交流。\n\n初步时间考虑为 ${w.event_time || "XXX"}，地点为 ${w.location || "XXX"}。具体时间可根据您的安排灵活调整。不知您近期是否方便？期待有机会邀请您来交流指导。`,
      notice: `各位老师、同学好：\n\n团队拟举办${w.issue || "本期"}季度 Workshop，主题为“${w.theme || "待定"}”，邀请${w.expert_affiliation || ""}${w.expert_title || ""}${w.expert_name || "专家"}作专题报告。\n\n报告题目：${talk}\n时间：${w.event_time || "待定"}\n地点：${w.location || "待定"}\n主持人：${w.host || "待定"}\n联系人：${w.contact_person || "待定"}\n\n欢迎各位老师和同学参加交流。`,
      host: `各位老师、同学，大家好。欢迎参加${w.issue || "本期"}团队季度 Workshop。本次 Workshop 的主题是“${w.theme || "待定"}”。今天我们邀请到${w.expert_affiliation || ""}${w.expert_title || ""}${w.expert_name || "专家"}为大家作报告，报告题目是“${talk}”。\n\n${w.expert_bio || "专家简介待补充。"}\n\n下面让我们欢迎${w.expert_name || "专家"}作报告。`,
      news: `${w.issue || "近日"}，团队围绕“${w.theme || "相关主题"}”举办季度 Workshop，邀请${w.expert_affiliation || ""}${w.expert_title || ""}${w.expert_name || "专家"}作题为“${talk}”的专题报告。活动由${w.host || "主持人"}主持，团队师生参加交流。\n\n报告围绕${w.abstract || w.expert_field || "相关研究方向"}展开，现场师生就研究进展、合作方向和后续交流进行了讨论。本次 Workshop 促进了团队与外部专家的学术互动，为后续科研合作奠定了基础。`,
      report: leaderText()
    };
  }

  function renderArchive() {
    const fields = [
      ["attendee_count", "参会人数"], ["news_status", "新闻稿状态"], ["cooperation_intent", "合作意向"], ["follow_up", "后续跟进"], ["notes", "备注"]
    ];
    $("#archiveFields").innerHTML = fields.map(([name, label]) => `<label>${label}<input name="${name}"></label>`).join("") +
      `<label>报告图片<input id="reportImage" type="file" accept="image/*"></label>`;
    const events = read(KEYS.events, []);
    $("#eventsBody").innerHTML = events.map(e => `
      <tr><td>${escapeHtml(e.issue)}</td><td>${escapeHtml(e.event_time)}</td><td>${escapeHtml(e.theme)}</td><td>${escapeHtml(e.expert_name)}</td><td>${escapeHtml(e.talk_title)}</td><td>${escapeHtml(e.host)}</td><td>${escapeHtml(e.news_status)}</td><td>${escapeHtml(e.follow_up)}</td><td><button class="danger" type="button" data-event-delete="${e.id}">删除归档</button></td></tr>
    `).join("");
    $$("[data-event-delete]").forEach(button => button.addEventListener("click", deleteArchiveEvent));
  }

  async function archiveWorkshop() {
    const w = currentWorkshop();
    if (!w.issue || !w.expert_name) {
      alert("请先补充本期期数和专家信息。");
      return;
    }
    const archiveData = Object.fromEntries($$("#archiveFields input[name]").map(input => [input.name, input.value]));
    const imageInput = $("#reportImage");
    const image = imageInput?.files?.[0] ? await fileToDataUrl(imageInput.files[0]) : "";
    const events = read(KEYS.events, []);
    const archived = { id: uid(), created_at: new Date().toISOString(), ...w, ...archiveData, report_image: image };
    if (archived.attendee_count === "") archived.attendee_count = null;
    write(KEYS.events, [archived, ...events]);
    try {
      await cloudInsert("events", archived);
    } catch (error) {
      console.error(error);
      alert("云端归档失败，当前只归档到了本机缓存。");
    }
    renderArchive();
    renderStats();
    alert("已归档到 Workshop 台账。");
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function deleteArchiveEvent(event) {
    const id = event.currentTarget.dataset.eventDelete;
    if (!confirm("确定删除这条归档记录吗？删除后“已报告专家”页也不会再展示它。")) return;
    write(KEYS.events, read(KEYS.events, []).filter(item => item.id !== id));
    try {
      await cloudDelete("events", id);
    } catch (error) {
      console.error(error);
      alert("云端删除失败，当前只删除了本机缓存。");
    }
    renderArchive();
    renderStats();
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).then(() => alert("已复制。"), () => {
      prompt("浏览器未允许自动复制，请手动复制：", text);
    });
  }

  function exportCsv() {
    const headers = ["created_at","recommender","theme","expert_name","expert_affiliation","expert_title","expert_field","contact_basis","can_help_invite","reason","priority","invite_status","leader_decision"];
    const lines = [headers.join(",")].concat(recommendations().map(row => headers.map(h => `"${String(row[h] || "").replaceAll('"', '""')}"`).join(",")));
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "workshop-recommendations.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function seedData() {
    const samples = [
      { recommender: "张老师", theme: "智能光学成像与光电感知", expert_name: "李教授", expert_affiliation: "南京大学", expert_title: "教授", expert_field: "计算成像、AI for Optics", category: "计算成像", talk_title: "智能计算成像前沿进展", contact_basis: "有合作基础", can_help_invite: "是", suggested_quarter: "Q2", reason: "方向契合团队重点布局，已有项目合作基础，可进一步推动基金申报。", notes: "" },
      { recommender: "王老师", theme: "微纳光子与超表面器件", expert_name: "陈研究员", expert_affiliation: "中国科学院上海光机所", expert_title: "研究员", expert_field: "超表面、微纳光子", category: "微纳光子", talk_title: "", contact_basis: "认识可联系", can_help_invite: "待定", suggested_quarter: "Q3", reason: "研究方向前沿，与团队学生培养和平台建设方向契合。", notes: "" },
      { recommender: "刘老师", theme: "光电安全与智能感知", expert_name: "赵副教授", expert_affiliation: "东南大学", expert_title: "副教授", expert_field: "光电安全、目标感知", category: "光电安全", talk_title: "", contact_basis: "无直接联系", can_help_invite: "否", suggested_quarter: "待定", reason: "方向相关，可作为长期跟进专家。", notes: "" }
    ].map(item => ({ id: uid(), created_at: new Date().toISOString(), invite_status: "待确认", leader_decision: "待定", leader_comment: "", ...item, priority: priorityFor(item) }));
    saveRecommendations([...samples, ...recommendations()]);
    seedEvents();
    if (cloudEnabled()) {
      try {
        await Promise.all(samples.map(item => cloudInsert("recommendations", item)));
        await Promise.all(read(KEYS.events, []).map(item => cloudInsert("events", item)));
      } catch (error) {
        console.error(error);
        alert("测试数据写入云端失败，当前只加入了本机缓存。");
      }
    }
    renderAdmin();
  }

  function seedEvents() {
    const existing = read(KEYS.events, []);
    if (existing.length) return;
    const past = [
      {
        id: uid(),
        created_at: new Date().toISOString(),
        issue: "2025年第4期",
        event_time: "2025年12月",
        theme: "智能光学成像与光电感知",
        expert_name: "李教授",
        expert_affiliation: "南京大学",
        expert_title: "教授",
        expert_field: "计算成像、AI for Optics",
        talk_title: "智能计算成像前沿进展",
        location: "学院会议室",
        host: "团队负责人",
        attendee_count: "35",
        news_status: "是",
        cooperation_intent: "是",
        follow_up: "继续推进联合课题讨论",
        notes: "测试展示数据，可在浏览器数据中清除或用真实归档替换。"
        , report_image: ""
      },
      {
        id: uid(),
        created_at: new Date().toISOString(),
        issue: "2025年第3期",
        event_time: "2025年9月",
        theme: "微纳光子与超表面器件",
        expert_name: "陈研究员",
        expert_affiliation: "中国科学院上海光机所",
        expert_title: "研究员",
        expert_field: "超表面、微纳光子",
        talk_title: "微纳光学器件及其应用",
        location: "线上会议",
        host: "团队负责人",
        attendee_count: "42",
        news_status: "待定",
        cooperation_intent: "待定",
        follow_up: "整理学生问题并邮件反馈",
        notes: "测试展示数据，可在浏览器数据中清除或用真实归档替换。"
        , report_image: ""
      }
    ];
    write(KEYS.events, past);
  }

  async function initLeader() {
    await loadCloudData();
    renderLeader();
    $("#leaderSearch").addEventListener("input", renderLeader);
    $("#copyLeaderSummary").addEventListener("click", () => copyText(leaderText(recommendations())));
  }

  function renderLeader() {
    const q = ($("#leaderSearch").value || "").trim().toLowerCase();
    const items = recommendations().filter(r => [r.expert_name, r.expert_affiliation, r.expert_field, r.reason].join(" ").toLowerCase().includes(q));
    $("#leaderList").innerHTML = ["A", "B", "C"].map(level => {
      const rows = items.filter(r => r.priority === level);
      return `<section class="leader-group"><h2>${priorityText(level)}</h2>${rows.length ? rows.map(leaderCard).join("") : "<p class='muted'>暂无候选。</p>"}</section>`;
    }).join("");
    $$("[data-leader-field]").forEach(el => el.addEventListener("change", async event => {
      const { id, leaderField } = event.currentTarget.dataset;
      saveRecommendations(recommendations().map(r => r.id === id ? { ...r, [leaderField]: event.currentTarget.value } : r));
      try {
        await cloudPatch("recommendations", id, { [leaderField]: event.currentTarget.value });
      } catch (error) {
        console.error(error);
        alert("云端更新失败，当前只更新了本机缓存。");
      }
      renderLeader();
    }));
  }

  function leaderCard(r) {
    return `<article class="leader-card">
      <div>
        <h3>${escapeHtml(r.expert_name)} <span class="meta">${escapeHtml(r.expert_title || "")}</span></h3>
        <p class="meta">${escapeHtml(r.expert_affiliation)}｜${escapeHtml(r.expert_field)}｜推荐老师：${escapeHtml(r.recommender)}</p>
        <p class="reason">${escapeHtml(r.reason)}</p>
      </div>
      <div>
        <label>是否本期邀请
          ${selectLeader(r.id, "leader_decision", ["待定","是","备选","后续跟进","否"], r.leader_decision)}
        </label>
        <label>领导意见
          <textarea data-id="${r.id}" data-leader-field="leader_comment" rows="4">${escapeHtml(r.leader_comment || "")}</textarea>
        </label>
      </div>
    </article>`;
  }

  function selectLeader(id, field, options, value) {
    return `<select data-id="${id}" data-leader-field="${field}">${options.map(opt => `<option ${opt === value ? "selected" : ""}>${opt}</option>`).join("")}</select>`;
  }

  async function initReports() {
    await loadCloudData();
    populateReportYears();
    renderReports();
    $("#reportSearch").addEventListener("input", renderReports);
    $("#reportYear").addEventListener("change", renderReports);
    $("#copyReports").addEventListener("click", () => copyText(reportText(filteredReports())));
  }

  function reportYear(event) {
    const text = [event.event_time, event.issue, event.created_at].join(" ");
    const match = text.match(/20\d{2}/);
    return match ? match[0] : "未标注";
  }

  function populateReportYears() {
    const years = [...new Set(read(KEYS.events, []).map(reportYear))].sort((a, b) => b.localeCompare(a));
    $("#reportYear").innerHTML = `<option value="">全部年份</option>${years.map(year => `<option>${escapeHtml(year)}</option>`).join("")}`;
  }

  function filteredReports() {
    const q = ($("#reportSearch").value || "").trim().toLowerCase();
    const year = $("#reportYear").value || "";
    return read(KEYS.events, []).filter(event => {
      const blob = [event.expert_name, event.expert_affiliation, event.expert_field, event.theme, event.talk_title, event.issue].join(" ").toLowerCase();
      return (!q || blob.includes(q)) && (!year || reportYear(event) === year);
    });
  }

  function renderReports() {
    const all = read(KEYS.events, []);
    const rows = filteredReports();
    const experts = new Set(all.map(event => event.expert_name).filter(Boolean));
    const years = new Set(all.map(reportYear).filter(Boolean));
    $("#reportSummary").innerHTML = [
      ["已归档报告", all.length],
      ["已报告专家", experts.size],
      ["覆盖年份", years.size]
    ].map(([label, value]) => `<div class="summary-item"><strong>${value}</strong><span>${label}</span></div>`).join("");

    $("#reportList").innerHTML = rows.length ? rows.map(reportCard).join("") : `
      <div class="empty-state">暂无已归档报告。请在负责人后台完成“台账归档”，或点击“加入测试数据”先查看展示效果。</div>
    `;
  }

  function reportCard(event) {
    return `<article class="report-card">
      <div class="report-date">${escapeHtml(event.event_time || event.issue || "时间待补充")}</div>
      <div>
        <h2>${escapeHtml(event.expert_name || "专家姓名待补充")} <span class="meta">${escapeHtml(event.expert_title || "")}</span></h2>
        <p class="meta">${escapeHtml(event.expert_affiliation || "单位待补充")}｜${escapeHtml(event.expert_field || "方向待补充")}</p>
        ${event.report_image ? `<img class="report-image" src="${event.report_image}" alt="${escapeHtml(event.expert_name || "报告")}现场图片">` : ""}
        <dl>
          <dt>报告题目</dt><dd>${escapeHtml(event.talk_title || event.theme || "待补充")}</dd>
          <dt>Workshop</dt><dd>${escapeHtml(event.issue || "待补充")}｜${escapeHtml(event.theme || "待补充")}</dd>
          <dt>地点/主持</dt><dd>${escapeHtml(event.location || "待补充")}｜${escapeHtml(event.host || "待补充")}</dd>
          <dt>后续跟进</dt><dd>${escapeHtml(event.follow_up || "待补充")}</dd>
        </dl>
      </div>
    </article>`;
  }

  function reportText(rows) {
    return rows.map((event, index) =>
      `${index + 1}. ${event.event_time || event.issue || ""}，${event.expert_name || ""}，${event.expert_affiliation || ""}，报告题目：${event.talk_title || event.theme || ""}。`
    ).join("\n") || "暂无已归档报告。";
  }

  return { initRecommendationForm, initAdmin, initLeader, initReports };
})();
