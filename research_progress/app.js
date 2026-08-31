const ProgressApp = (() => {
  const ADMIN_PASSWORD = "progress2026";
  const config = window.PROGRESS_CONFIG || {};
  const KEYS = {
    progress: "lab_progress_items",
    profile: "lab_profile",
    papers: "lab_papers",
    admin: "lab_progress_admin_ok"
  };
  const DIRECTIONS = [
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
    "超快微波光子学",
    "其他/交叉方向"
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

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
    if (!response.ok) throw new Error(`Cloud request failed ${response.status}: ${await response.text()}`);
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function loadCloudData() {
    if (!cloudEnabled()) return;
    try {
      const [progress, profile, papers] = await Promise.all([
        cloudRequest("research_progress?select=*&order=created_at.desc"),
        cloudRequest("research_profile?select=*&id=eq.1"),
        cloudRequest("research_papers?select=*&order=year.desc,created_at.desc")
      ]);
      write(KEYS.progress, progress || []);
      if (profile?.[0]) write(KEYS.profile, profile[0]);
      write(KEYS.papers, papers || []);
    } catch (error) {
      console.error(error);
      alert("云端数据读取失败，当前将使用本机缓存数据。");
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

  async function cloudUpsertProfile(profile) {
    return cloudRequest("research_profile", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: 1, ...profile })
    });
  }

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function progressItems() {
    return read(KEYS.progress, []);
  }

  function profileData() {
    return read(KEYS.profile, {
      name: "杨琬琛",
      title: "南京航空航天大学微波光子学实验室",
      bio: "主要展示 Google Scholar、个人主页、ORCID 和代表性论文。可在负责人后台修改。",
      google_scholar: "",
      personal_homepage: "",
      orcid: "",
      email: "",
      research_keywords: "微波光子学；微波毫米波天线；光电信息；智能感知"
    });
  }

  function papers() {
    return read(KEYS.papers, []);
  }

  function populateDirections(root = document) {
    $$("[data-research-directions]", root).forEach(select => {
      const current = select.value;
      select.innerHTML = `<option value="">请选择</option>${DIRECTIONS.map(direction => `<option>${escapeHtml(direction)}</option>`).join("")}`;
      select.value = current;
    });
  }

  async function initProgressForm() {
    await loadCloudData();
    populateDirections();
    $("#progressForm").addEventListener("submit", async event => {
      event.preventDefault();
      const row = {
        id: uid(),
        created_at: new Date().toISOString(),
        ...formData(event.currentTarget),
        review_status: "未读",
        feedback: ""
      };
      write(KEYS.progress, [row, ...progressItems()]);
      try {
        await cloudInsert("research_progress", row);
      } catch (error) {
        console.error(error);
        alert("云端保存失败，但数据已临时保存在本机。");
      }
      event.currentTarget.reset();
      $("#submitMessage").textContent = "提交成功，老师将在后台查看并反馈。";
    });
  }

  async function initAdmin() {
    await loadCloudData();
    const unlock = () => {
      $("#loginPanel").classList.add("hidden");
      $("#adminApp").classList.remove("hidden");
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
    renderFilters();
    renderProgress();
    renderProfileForm();
    renderPaperEditor();
    $("#searchInput").oninput = renderProgress;
    $("#directionFilter").onchange = renderProgress;
    $("#reviewFilter").onchange = renderProgress;
    $("#copySummary").onclick = () => copyText(progressSummary(filteredProgress()));
    $("#exportCsv").onclick = exportProgressCsv;
    $("#seedData").onclick = seedData;
    $("#saveProfile").onclick = saveProfile;
    $("#addPaper").onclick = () => addPaper();
  }

  function renderStats() {
    const rows = progressItems();
    const stats = [
      ["提交总数", rows.length],
      ["未读", rows.filter(item => item.review_status === "未读").length],
      ["需面谈", rows.filter(item => item.review_status === "需面谈").length],
      ["论文条目", papers().length]
    ];
    $("#stats").innerHTML = stats.map(([label, value]) => `<div class="stat"><strong>${value}</strong><span>${label}</span></div>`).join("");
  }

  function renderFilters() {
    const options = [...new Set(progressItems().map(item => item.research_direction).filter(Boolean))];
    const current = $("#directionFilter").value;
    $("#directionFilter").innerHTML = `<option value="">全部方向</option>${options.map(item => `<option>${escapeHtml(item)}</option>`).join("")}`;
    $("#directionFilter").value = current;
  }

  function filteredProgress() {
    const q = ($("#searchInput")?.value || "").trim().toLowerCase();
    const direction = $("#directionFilter")?.value || "";
    const review = $("#reviewFilter")?.value || "";
    return progressItems().filter(item => {
      const blob = [item.student_name, item.research_direction, item.project_title, item.completed_work, item.key_results, item.blockers, item.next_plan].join(" ").toLowerCase();
      return (!q || blob.includes(q)) && (!direction || item.research_direction === direction) && (!review || item.review_status === review);
    });
  }

  function renderProgress() {
    const rows = filteredProgress();
    $("#progressCount").textContent = `当前显示 ${rows.length} 条`;
    $("#progressList").innerHTML = rows.length ? rows.map(progressCard).join("") : `<div class="empty-state">暂无提交记录。</div>`;
    $$("[data-progress-field]").forEach(element => element.addEventListener("change", updateProgressField));
    $$("[data-progress-delete]").forEach(button => button.addEventListener("click", deleteProgress));
    renderStats();
  }

  function progressCard(item) {
    const warn = item.review_status === "未读" || item.review_status === "需面谈";
    return `<article class="progress-card">
      <div class="section-head">
        <div>
          <h3>${escapeHtml(item.student_name)}｜${escapeHtml(item.project_title)}</h3>
          <p class="meta">${escapeHtml(item.student_level)}｜${escapeHtml(item.research_direction)}｜${escapeHtml(item.period)}｜${formatDate(item.created_at)}</p>
        </div>
        <span class="pill ${warn ? "warn" : "ok"}">${escapeHtml(item.review_status || "未读")}</span>
      </div>
      <div class="card-grid">
        ${noteBlock("完成内容", item.completed_work)}
        ${noteBlock("关键结果", item.key_results)}
        ${noteBlock("遇到的问题", item.blockers || "无")}
        ${noteBlock("下一步计划", item.next_plan)}
      </div>
      <p class="meta">导师/指导老师：${escapeHtml(item.advisor || "未填写")} ${item.attachment_url ? `｜<a href="${escapeHtml(item.attachment_url)}" target="_blank" rel="noopener">附件链接</a>` : ""}</p>
      <div class="review-row">
        <select data-id="${item.id}" data-progress-field="review_status">
          ${["未读","已阅读","需面谈","已反馈","已归档"].map(status => `<option ${status === item.review_status ? "selected" : ""}>${status}</option>`).join("")}
        </select>
        <textarea data-id="${item.id}" data-progress-field="feedback" rows="3" placeholder="给学生的反馈">${escapeHtml(item.feedback || "")}</textarea>
        <button class="danger" type="button" data-progress-delete="${item.id}">删除</button>
      </div>
    </article>`;
  }

  function noteBlock(title, value) {
    return `<div class="note-block"><h4>${title}</h4><div>${escapeHtml(value)}</div></div>`;
  }

  async function updateProgressField(event) {
    const { id, progressField } = event.currentTarget.dataset;
    const value = event.currentTarget.value;
    write(KEYS.progress, progressItems().map(item => item.id === id ? { ...item, [progressField]: value } : item));
    try { await cloudPatch("research_progress", id, { [progressField]: value }); }
    catch (error) { console.error(error); alert("云端更新失败，当前只更新了本机缓存。"); }
    renderProgress();
  }

  async function deleteProgress(event) {
    const id = event.currentTarget.dataset.progressDelete;
    if (!confirm("确定删除这条进展记录吗？")) return;
    write(KEYS.progress, progressItems().filter(item => item.id !== id));
    try { await cloudDelete("research_progress", id); }
    catch (error) { console.error(error); alert("云端删除失败，当前只删除了本机缓存。"); }
    renderProgress();
  }

  function renderProfileForm() {
    const data = profileData();
    const fields = [
      ["name", "姓名"], ["title", "单位/职务"], ["email", "邮箱"],
      ["google_scholar", "Google Scholar 链接"], ["personal_homepage", "个人主页链接"], ["orcid", "ORCID 链接"],
      ["research_keywords", "研究关键词"], ["bio", "简介"]
    ];
    $("#profileForm").innerHTML = fields.map(([name, label]) => `
      <label>${label}
        <textarea name="${name}" rows="${name === "bio" ? 4 : 1}">${escapeHtml(data[name] || "")}</textarea>
      </label>
    `).join("");
  }

  async function saveProfile() {
    const data = formData($("#profileForm"));
    write(KEYS.profile, data);
    try { await cloudUpsertProfile(data); }
    catch (error) { console.error(error); alert("云端保存失败，当前只保存了本机缓存。"); }
    alert("学术主页信息已保存。");
  }

  function renderPaperEditor() {
    $("#paperEditor").innerHTML = papers().map(paperEditCard).join("") || `<div class="empty-state">暂无论文。点击“新增论文”开始添加。</div>`;
    $$("[data-paper-field]").forEach(element => element.addEventListener("change", updatePaperField));
    $$("[data-paper-delete]").forEach(button => button.addEventListener("click", deletePaper));
  }

  function paperEditCard(paper) {
    const fields = [
      ["title", "题目"], ["authors", "作者"], ["journal", "期刊/会议"], ["year", "年份"],
      ["type", "类型"], ["doi", "DOI"], ["link", "论文链接"], ["keywords", "关键词"]
    ];
    return `<article class="paper-edit-card">
      <div class="form-grid">
        ${fields.map(([name, label]) => `<label>${label}<input data-id="${paper.id}" data-paper-field="${name}" value="${escapeHtml(paper[name] || "")}"></label>`).join("")}
      </div>
      <div class="actions"><button class="danger" type="button" data-paper-delete="${paper.id}">删除论文</button></div>
    </article>`;
  }

  async function addPaper() {
    const row = { id: uid(), created_at: new Date().toISOString(), title: "新论文题目", authors: "", journal: "", year: String(new Date().getFullYear()), type: "期刊论文", doi: "", link: "", keywords: "" };
    write(KEYS.papers, [row, ...papers()]);
    try { await cloudInsert("research_papers", row); }
    catch (error) { console.error(error); alert("云端新增失败，当前只添加了本机缓存。"); }
    renderPaperEditor();
    renderStats();
  }

  async function updatePaperField(event) {
    const { id, paperField } = event.currentTarget.dataset;
    const value = event.currentTarget.value;
    write(KEYS.papers, papers().map(paper => paper.id === id ? { ...paper, [paperField]: value } : paper));
    try { await cloudPatch("research_papers", id, { [paperField]: value }); }
    catch (error) { console.error(error); alert("云端更新失败，当前只更新了本机缓存。"); }
  }

  async function deletePaper(event) {
    const id = event.currentTarget.dataset.paperDelete;
    if (!confirm("确定删除这篇论文吗？")) return;
    write(KEYS.papers, papers().filter(paper => paper.id !== id));
    try { await cloudDelete("research_papers", id); }
    catch (error) { console.error(error); alert("云端删除失败，当前只删除了本机缓存。"); }
    renderPaperEditor();
    renderStats();
  }

  async function initPublications() {
    await loadCloudData();
    renderPublicProfile();
    renderPaperFilters();
    renderPapers();
    $("#paperSearch").addEventListener("input", renderPapers);
    $("#paperYear").addEventListener("change", renderPapers);
    $("#paperType").addEventListener("change", renderPapers);
  }

  function renderPublicProfile() {
    const profile = profileData();
    $("#profileName").textContent = `${profile.name || "学术主页"}｜${profile.title || ""}`;
    $("#profileBio").textContent = profile.bio || "展示 Google Scholar、个人主页、ORCID 和代表性论文。";
    const links = [
      ["Google Scholar", profile.google_scholar],
      ["个人主页", profile.personal_homepage],
      ["ORCID", profile.orcid],
      ["邮箱", profile.email ? `mailto:${profile.email}` : ""]
    ].filter(([, href]) => href);
    $("#profileLinks").innerHTML = links.map(([label, href]) => `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`).join("");
  }

  function renderPaperFilters() {
    const years = [...new Set(papers().map(paper => paper.year).filter(Boolean))].sort((a, b) => String(b).localeCompare(String(a)));
    $("#paperYear").innerHTML = `<option value="">全部年份</option>${years.map(year => `<option>${escapeHtml(year)}</option>`).join("")}`;
  }

  function filteredPapers() {
    const q = ($("#paperSearch").value || "").trim().toLowerCase();
    const year = $("#paperYear").value || "";
    const type = $("#paperType").value || "";
    return papers().filter(paper => {
      const blob = [paper.title, paper.authors, paper.journal, paper.keywords, paper.doi].join(" ").toLowerCase();
      return (!q || blob.includes(q)) && (!year || paper.year === year) && (!type || paper.type === type);
    });
  }

  function renderPapers() {
    const rows = filteredPapers();
    $("#paperList").innerHTML = rows.length ? rows.map(paperCard).join("") : `<div class="empty-state">暂无论文条目。负责人可在后台添加 Google Scholar 链接和代表性论文。</div>`;
  }

  function paperCard(paper) {
    return `<article class="paper-card">
      <h2 class="paper-title">${escapeHtml(paper.title || "论文题目待补充")}</h2>
      <p class="meta">${escapeHtml(paper.authors || "作者待补充")}</p>
      <dl>
        <dt>来源</dt><dd>${escapeHtml(paper.journal || "待补充")}</dd>
        <dt>年份</dt><dd>${escapeHtml(paper.year || "待补充")}</dd>
        <dt>类型</dt><dd>${escapeHtml(paper.type || "期刊论文")}</dd>
        <dt>DOI</dt><dd>${escapeHtml(paper.doi || "待补充")}</dd>
        <dt>链接</dt><dd>${paper.link ? `<a href="${escapeHtml(paper.link)}" target="_blank" rel="noopener">打开论文</a>` : "待补充"}</dd>
      </dl>
    </article>`;
  }

  function progressSummary(rows) {
    return rows.map((item, index) => `${index + 1}. ${item.student_name}｜${item.period}｜${item.project_title}\n完成：${item.completed_work}\n问题：${item.blockers || "无"}\n下一步：${item.next_plan}\n`).join("\n") || "暂无进展记录。";
  }

  function exportProgressCsv() {
    const headers = ["created_at","student_name","student_level","research_direction","period","project_title","advisor","completed_work","key_results","blockers","next_plan","status","review_status","feedback","attachment_url","notes"];
    const lines = [headers.join(",")].concat(progressItems().map(row => headers.map(h => `"${String(row[h] || "").replaceAll('"', '""')}"`).join(",")));
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "research-progress.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).then(() => alert("已复制。"), () => prompt("浏览器未允许自动复制，请手动复制：", text));
  }

  function formatDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
  }

  async function seedData() {
    const sampleProgress = [
      {
        id: uid(),
        created_at: new Date().toISOString(),
        student_name: "测试学生A",
        student_level: "硕士生",
        research_direction: "微波光子信号处理技术",
        period: "2026年第35周",
        project_title: "微波光子链路线性化实验",
        advisor: "杨老师",
        completed_work: "完成链路搭建和初步频响测试，整理了三组实验数据。",
        key_results: "初步观察到增益平坦度改善，仍需补充误差分析。",
        blockers: "高频段噪声偏大，需要确认仪器校准。",
        next_plan: "完成校准对比实验，并绘制论文可用图。",
        status: "需要讨论",
        attachment_url: "",
        notes: "",
        review_status: "未读",
        feedback: ""
      }
    ];
    const samplePapers = [
      {
        id: uid(),
        created_at: new Date().toISOString(),
        title: "Representative paper title",
        authors: "W. Yang, L. Zhou",
        journal: "Journal / Conference",
        year: "2026",
        type: "期刊论文",
        doi: "",
        link: "",
        keywords: "microwave photonics"
      }
    ];
    write(KEYS.progress, [...sampleProgress, ...progressItems()]);
    if (!papers().length) write(KEYS.papers, samplePapers);
    if (cloudEnabled()) {
      try {
        await Promise.all(sampleProgress.map(item => cloudInsert("research_progress", item)));
        if (!papers().length) await Promise.all(samplePapers.map(item => cloudInsert("research_papers", item)));
      } catch (error) {
        console.error(error);
        alert("测试数据写入云端失败，当前只加入了本机缓存。");
      }
    }
    renderAdmin();
  }

  return { initProgressForm, initAdmin, initPublications };
})();
