const ProgressApp = (() => {
  const ADMIN_PASSWORD = "progress2026";
  const config = window.PROGRESS_CONFIG || {};
  const STORAGE_BUCKET = "progress-attachments";
  const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
  const KEYS = {
    progress: "lab_progress_items",
    profile: "lab_profile",
    papers: "lab_papers",
    projects: "lab_projects",
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

  async function storageRequest(path, options = {}) {
    if (!cloudEnabled()) return null;
    const response = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/storage/v1/${path}`, {
      ...options,
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(`Storage request failed ${response.status}: ${await response.text()}`);
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function publicStorageUrl(path) {
    return `${config.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
  }

  function cleanFileName(name) {
    return String(name || "attachment").replace(/[^\w.\-\u4e00-\u9fa5]/g, "_").slice(0, 120);
  }

  async function uploadAttachment(file, progressId) {
    if (!file || !file.size) return null;
    if (!cloudEnabled()) throw new Error("附件上传需要先配置 Supabase。");
    if (file.size > MAX_UPLOAD_SIZE) throw new Error("附件不能超过 50 MB。");
    const path = `${progressId}/${Date.now()}-${cleanFileName(file.name)}`;
    await storageRequest(`object/${STORAGE_BUCKET}/${encodeURIComponent(path).replaceAll("%2F", "/")}`, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false"
      },
      body: file
    });
    return {
      attachment_name: file.name,
      attachment_path: path,
      attachment_size: file.size,
      attachment_type: file.type || "",
      attachment_url: publicStorageUrl(path)
    };
  }

  async function deleteAttachment(path) {
    if (!path || !cloudEnabled()) return;
    await storageRequest(`object/${STORAGE_BUCKET}/${encodeURIComponent(path).replaceAll("%2F", "/")}`, { method: "DELETE" });
  }

  async function safeCloudRead(path, fallback = []) {
    try {
      const data = await cloudRequest(path);
      return { ok: true, data: data ?? fallback };
    } catch (error) {
      console.error(error);
      return { ok: false, data: fallback, error };
    }
  }

  async function loadCloudData({ quiet = false } = {}) {
    if (!cloudEnabled()) return;
    const [progress, profile, papers, projects] = await Promise.all([
      safeCloudRead("research_progress?select=*&order=created_at.desc", progressItems()),
      safeCloudRead("research_profile?select=*&id=eq.1", []),
      safeCloudRead("research_papers?select=*&order=year.desc,created_at.desc", papers()),
      safeCloudRead("research_projects?select=*&order=created_at.desc", projects())
    ]);
    if (progress.ok) write(KEYS.progress, progress.data || []);
    if (profile.ok && profile.data?.[0]) write(KEYS.profile, profile.data[0]);
    if (papers.ok) write(KEYS.papers, papers.data || []);
    if (projects.ok) write(KEYS.projects, projects.data || []);
    if (!quiet && [progress, profile, papers, projects].some(result => !result.ok)) {
      showCloudNotice("部分云端数据暂时无法读取，已先显示本机缓存。请确认 Supabase 已执行 schema.sql。");
    }
  }

  function showCloudNotice(message) {
    const target = $("#cloudNotice");
    if (target) target.textContent = message;
    else console.warn(message);
  }

  async function loadProgressOnly() {
    if (!cloudEnabled()) return;
    const progress = await safeCloudRead("research_progress?select=*&order=created_at.desc", progressItems());
    if (progress.ok) write(KEYS.progress, progress.data || []);
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
      name: "周莉娜",
      title: "南京航空航天大学微波光子学实验室 副教授",
      bio: "周莉娜博士主要从事光子学与光学成像研究，研究方向包括单像素成像、鬼成像、散射介质成像、信息光子学、光学加密与认证，以及人工智能赋能的光子学系统。现任南京航空航天大学副教授，承担本科生《数字逻辑电路》和博士生《非线性光学》等课程。",
      google_scholar: "https://scholar.google.com/citations?user=HYJKgg4AAAAJ&hl=en&oi=ao",
      personal_homepage: "",
      orcid: "",
      email: "linazhou@polyu.edu.hk",
      research_keywords: "光学成像；单像素成像；鬼成像；散射介质成像；信息光子学；光学加密；AI for Photonics"
    });
  }

  function papers() {
    const rows = read(KEYS.papers, []);
    return rows.length ? rows : defaultPapers();
  }

  function projects() {
    const rows = read(KEYS.projects, []);
    return rows.length ? rows : defaultProjects();
  }

  function defaultProjects() {
    return [
      { id: "default-project-youth-nsfc", role: "项目负责人", title: "国家自然科学基金青年科学基金项目", period: "2026-2028", funding: "国家自然科学基金委员会", status: "已获批", description: "2026年获批国家自然科学基金青年科学基金项目，围绕光学成像、信息光子学及相关交叉方向开展研究。" },
      { id: "default-project-spi", role: "项目负责人", title: "复杂动态环境下单像素光谱成像技术及应用", period: "2025-11 至 2028-12", funding: "获批经费 100 万元", status: "在研", description: "面向复杂动态环境中的光学成像与信息获取需求，发展单像素光谱成像方法和应用。" },
      { id: "default-project-talent", role: "项目负责人", title: "周莉娜国家级人才科研启动基金", period: "2026-01 至 2028-12", funding: "获批经费 200 万元", status: "在研", description: "支持信息光子学、光学成像和人工智能光子学方向的独立研究。" }
    ];
  }

  function defaultPapers() {
    return [
          {
                "id": "default-paper-1",
                "title": "High-resolution self-corrected single-pixel imaging through dynamic and complex scattering media",
                "authors": "Lina Zhou, Yin Xiao, and Wen Chen",
                "journal": "Optics Express, 31(14), 2023",
                "year": "2023",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-2",
                "title": "Edge detection in gradient ghost imaging through complex media",
                "authors": "Lina Zhou, Yin Xiao, and Wen Chen",
                "journal": "Applied Physics Letters, 123(11), 111104 (5pp), 2023",
                "year": "2023",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-3",
                "title": "Self-corrected orthonormalized ghost imaging through dynamic and complex scattering media",
                "authors": "Lina Zhou, Yin Xiao, and Wen Chen",
                "journal": "Applied Physics Letters, 123(1), 011107 (5pp), 2023",
                "year": "2023",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-4",
                "title": "Gradual ghost imaging of moving objects through dynamic and complex scattering media",
                "authors": "Lina Zhou, Yin Xiao, and Wen Chen",
                "journal": "Optics Letters, In preparation, 2023",
                "year": "2023",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-5",
                "title": "Optical data transmission through highly dynamic and turbid water using dynamic scaling factors and single-pixel detector",
                "authors": "Zilan Pan, Yin Xiao, Yonggui Cao, Lina Zhou, and Wen Chen",
                "journal": "Optics Express, Accepted and in Press, 2022",
                "year": "2022",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-6",
                "title": "Physically-secured ghost diffraction and transmission",
                "authors": "Yonggui Cao, Yin Xiao, Zilan Pan, Lina Zhou, and Wen Chen",
                "journal": "IEEE Photonics Technology Letters, 34 (22), 1238-1241, 2022",
                "year": "2022",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-7",
                "title": "High-fidelity temporally-corrected transmission through dynamic smoke via pixel-to-plane data encoding",
                "authors": "Yonggui Cao, Yin Xiao, Zilan Pan, Lina Zhou, and Wen Chen",
                "journal": "Optics Express, 30 (20), 36464-36477, 2022",
                "year": "2022",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-8",
                "title": "High-resolution ghost imaging through complex scattering media via a temporal correction",
                "authors": "Yin Xiao, Lina Zhou, and Wen Chen",
                "journal": "Optics Letters, 47 (15), 3692-3695, 2022",
                "year": "2022",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-9",
                "title": "Accurate optical information transmission through thick tissues using zero-frequency modulation and single-pixel detection",
                "authors": "Zilan Pan, Yin Xiao, Yonggui Cao, Lina Zhou, and Wen Chen",
                "journal": "Optics and Lasers in Engineering, 158, 107133 (7pp), 2022",
                "year": "2022",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-10",
                "title": "Direct generation of 2D arrays of random numbers for high- fidelity optical ghost diffraction and information transmission through scattering media",
                "authors": "Yonggui Cao, Yin Xiao, Zilan Pan, Lina Zhou, and Wen Chen",
                "journal": "Optics and Lasers in Engineering, 158, 107141 (8pp), 2022",
                "year": "2022",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-11",
                "title": "High-efficiency and high- fidelity optical signal transmission in free space through scattering media using 2D random amplitude-only patterns and look- up table",
                "authors": "Yin Xiao, Lina Zhou, and Wen Chen",
                "journal": "Optics and Lasers in Engineering, 155, 107059 (5pp), 2022",
                "year": "2022",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-12",
                "title": "Physically-secured high- fidelity free-space optical data transmission through scattering media using dynamic scaling factors",
                "authors": "Yin Xiao, Lina Zhou, Zilan Pan, Yonggui Cao, and Wen Chen",
                "journal": "Optics Express, 30 (5), 8186- 8198, 2022",
                "year": "2022",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-13",
                "title": "Visual cryptography using binary amplitude- only holograms [Invited]",
                "authors": "Lina Zhou, Yin Xiao, Zilan Pan, Yonggui Cao, and Wen Chen",
                "journal": "Frontiers in Photonics, 2, 821304 (10pp), 2022.",
                "year": "2022",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-14",
                "title": "Physically- enhanced ghost encoding",
                "authors": "Yin Xiao, Lina Zhou, Zilan Pan, Yonggui Cao, and Wen Chen",
                "journal": "Optics Letters, 47 (2), 433-436, 2022",
                "year": "2022",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-15",
                "title": "Analog ghost hidden in 2D random binary patterns for free-space optical data transmission",
                "authors": "Yin Xiao, Lina Zhou, Zilan Pan, Yonggui Cao, Mo Yang, and Wen Chen",
                "journal": "Optics and Lasers in Engineering, 150, 106880 (5pp), 2022",
                "year": "2022",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-16",
                "title": "Optical analog-signal transmission and retrieval through turbid water",
                "authors": "Zilan Pan, Yin Xiao, Yonggui Cao, Lina Zhou, and Wen Chen",
                "journal": "Applied Optics, 60 (34), 10704-10713, 2021",
                "year": "2021",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-17",
                "title": "Non-line-of- sight optical information transmission through turbid water",
                "authors": "Zilan Pan, Yin Xiao, Lina Zhou, Yonggui Cao, Mo Yang, and Wen Chen",
                "journal": "Optics Express, 29 (24), 39498-39510, 2021",
                "year": "2021",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-18",
                "title": "Optical hiding based on single- input multiple- output and binary amplitude-only holograms via the modified Gerchberg-Saxton algorithm",
                "authors": "Lina Zhou, Yin Xiao, Zilan Pan, Yonggui Cao, and Wen Chen",
                "journal": "Optics Express, 29 (16), 25675-25696, 2021",
                "year": "2021",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-19",
                "title": "High- fidelity ghost diffraction and transmission in free space through scattering media",
                "authors": "Yin Xiao, Lina Zhou, and Wen Chen",
                "journal": "Applied Physics Letters, 118(10), 104001 (5pp), 2021",
                "year": "2021",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-20",
                "title": "Learning-based optical authentication in complex scattering media",
                "authors": "Lina Zhou, Yin Xiao, and Wen Chen",
                "journal": "Optics and Lasers in Engineering, 141, 106570 (10pp), 2021",
                "year": "2021",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-21",
                "title": "Optical information authentication using phase- only patterns with single-pixel optical detection",
                "authors": "Yin Xiao, Lina Zhou, and Wen Chen",
                "journal": "Applied Optics, 60(10), B1-B7, 2021",
                "year": "2021",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-22",
                "title": "Wavefront control through multi- layer scattering media using single- pixel detector for high-PSNR optical transmission",
                "authors": "Yin Xiao, Lina Zhou, and Wen Chen",
                "journal": "Optics and Lasers in Engineering, 139, 106453 (6pp), 2021",
                "year": "2021",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-23",
                "title": "Learning complex scattering media for optical encryption",
                "authors": "Lina Zhou, Yin Xiao, and Wen Chen",
                "journal": "Optics Letters, 45(18), 5279-5282, 2020",
                "year": "2020",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-24",
                "title": "Secured single-pixel ghost holography",
                "authors": "Yin Xiao, Lina Zhou, and Wen Chen",
                "journal": "Optics and Lasers in Engineering, 128, 106045 (14pp), 2020",
                "year": "2020",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-25",
                "title": "Learning-based attacks for detecting the vulnerability of computer- generated hologram based optical encryption",
                "authors": "Lina Zhou, Yin Xiao, and Wen Chen",
                "journal": "Optics Express, 28(2), 2499-2510, 2020",
                "year": "2020",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-26",
                "title": "Vulnerability to machine learning attacks of optical encryption based on diffractive imaging",
                "authors": "Lina Zhou, Yin Xiao, and Wen Chen",
                "journal": "Optics and Lasers in Engineering, 125, 105858 (6pp), 2020",
                "year": "2020",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-27",
                "title": "Single-pixel imaging authentication using sparse Hadamard spectrum coefficients",
                "authors": "Yin Xiao, Lina Zhou, and Wen Chen",
                "journal": "IEEE Photonics Technology Letters, 31(24), 1975-1978, 2019",
                "year": "2019",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-28",
                "title": "Machine-learning attacks on interference-based optical encryption: experimental demonstration",
                "authors": "Lina Zhou, Yin Xiao, and Wen Chen",
                "journal": "Optics Express, 27(18), 26143-26154, 2019",
                "year": "2019",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-29",
                "title": "Imaging through turbid media with vague concentrations based on cosine similarity and convolutional neural network",
                "authors": "Lina Zhou, Yin Xiao, and Wen Chen",
                "journal": "IEEE Photonics Journal, 11(4), 7801315 (15pp), 2019",
                "year": "2019",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-30",
                "title": "Experimental demonstration of ghost- imaging- based authentication in scattering media",
                "authors": "Yin Xiao, Lina Zhou, and Wen Chen",
                "journal": "Optics Express, 27(15), 20558-20566, 2019",
                "year": "2019",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-31",
                "title": "Direct single-step measurement of Hadamard spectrum using single- pixel optical detection",
                "authors": "Yin Xiao, Lina Zhou, and Wen Chen",
                "journal": "IEEE Photonics Technology Letters, 31(11), 845-848, 2019",
                "year": "2019",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-32",
                "title": "Fourier spectrum retrieval in single-pixel imaging",
                "authors": "Yin Xiao, Lina Zhou, and Wen Chen",
                "journal": "IEEE Photonics Journal, 11(2), 7800411 (11pp), 2019",
                "year": "2019",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-33",
                "title": "Optically controllable nanobreaking of metallic nanowires",
                "authors": "Lina Zhou, Jinsheng Lu, Hangbo Yang, Si Luo, Wei Wang, Jun lv, Min Qiu and Q iang Li",
                "journal": "Applied Physics Letters, 110(8), 081101, 2017",
                "year": "2017",
                "type": "期刊论文",
                "doi": "",
                "link": "",
                "keywords": "optics; photonics"
          },
          {
                "id": "default-paper-34",
                "title": "Light- induced pulling and pushing by the synergic effect of optical force and photophoretic force",
                "authors": "Jinsheng Lu, Hangbo Yang, Lina Zhou, Yuanqing Yang, Si Luo, Qiang Li and Min Qiu",
                "journal": "Physical Review Letters, 118(4), 043601, 2017",
                "year": "2017",
                "type": "会议论文",
                "doi": "",
                "link": "",
                "keywords": "conference presentation"
          },
          {
                "id": "default-paper-35",
                "title": "Optical transmission through thick biological tissue using optical modulation",
                "authors": "Zilan Pan, Yin Xiao, Lina Zhou, and Wen Chen",
                "journal": "International Conference on Optical and Photonic Engineering (icOPEN 2022), 24-27 November 2022, Nanjing, China.",
                "year": "2022",
                "type": "会议论文",
                "doi": "",
                "link": "",
                "keywords": "conference presentation"
          },
          {
                "id": "default-paper-36",
                "title": "Learning enabled optical encryption in complex scattering media",
                "authors": "Lina Zhou, Yin Xiao, and Wen Chen",
                "journal": "The 43rd PhotonIcs and Electromagnetics Research Symposium (PIERS), IEEE Xplore, 21 November 2021-25 November 2021, Hangzhou, China",
                "year": "2021",
                "type": "会议论文",
                "doi": "",
                "link": "",
                "keywords": "conference presentation"
          },
          {
                "id": "default-paper-37",
                "title": "Deep learning based attack on phase-truncated optical encoding",
                "authors": "Lina Zhou, Xudong Chen, and Wen Chen",
                "journal": "2020 IEEE MTT-S International Conference on Numerical Electromagnetic and Multiphysics Modeling and Optimization (NEMO2020), 7 December 2020-9 December 2020, Hangzhou, China.",
                "year": "2020",
                "type": "会议论文",
                "doi": "",
                "link": "",
                "keywords": "conference presentation"
          },
          {
                "id": "default-paper-38",
                "title": "Imaging through turbulent media using deep learning method",
                "authors": "Lina Zhou, Xudong Chen, and Wen Chen",
                "journal": "18th IEEE International Conference on Industrial Informatics (INDIN2020), IEEE Xplore, 20 July 2020-23 July 2020, The University of Warwick, Coventry, UK.",
                "year": "2020",
                "type": "会议论文",
                "doi": "",
                "link": "",
                "keywords": "conference presentation"
          },
          {
                "id": "default-paper-39",
                "title": "High-quality object reconstruction based on ghost imaging",
                "authors": "Yin Xiao, Lina Zhou, and Wen Chen",
                "journal": "PhotonIcs & Electromagnetics Research Symposium (PIERS2019), IEEE Xplore, 17-20 December 2019, Xiamen, China.",
                "year": "2019",
                "type": "会议论文",
                "doi": "",
                "link": "",
                "keywords": "conference presentation"
          },
          {
                "id": "default-paper-40",
                "title": "Image recovery through turbid water under wide distance ranges",
                "authors": "Lina Zhou, Yin Xiao, and Wen Chen",
                "journal": "International Conference on Optical and Photonic Engineering (icOPEN 2019), Proceedings of SPIE, 16-20 July 2019, Phuket, Thailand.",
                "year": "2019",
                "type": "会议论文",
                "doi": "",
                "link": "",
                "keywords": "conference presentation"
          },
          {
                "id": "default-paper-41",
                "title": "Off-axis digital hologram retrieval based on single- pixel optical imaging",
                "authors": "Yin Xiao, Lina Zhou, and Wen Chen",
                "journal": "OSA Imaging and Applied Optics Congress, OSA Publishing, 24-27 June 2019, Munich, Germany.",
                "year": "2019",
                "type": "会议论文",
                "doi": "",
                "link": "",
                "keywords": "conference presentation"
          },
          {
                "id": "default-paper-42",
                "title": "Learning based holographic reconstruction through a diffuser",
                "authors": "Lina Zhou, Yin Xiao, and Wen Chen",
                "journal": "PhotonIcs & Electromagnetics Research Symposium (PIERS 2019), IEEE Xplore, 17-20 June 2019, Rome, Italy.",
                "year": "2019",
                "type": "会议论文",
                "doi": "",
                "link": "",
                "keywords": "conference presentation"
          },
          {
                "id": "default-paper-43",
                "title": "Multiple-plane object reconstruction using single- pixel digital holography",
                "authors": "Yin Xiao, Lina Zhou, and Wen Chen",
                "journal": "IEEE 28th International Symposium on Industrial Electronics (IEEE ISIE2019), IEEE Xplore,12- 14 June 2019, Vancouver, Canada.",
                "year": "2019",
                "type": "会议论文",
                "doi": "",
                "link": "",
                "keywords": "conference presentation"
          },
          {
                "id": "default-paper-44",
                "title": "Laser assisted welding of layered metallic nanostructure",
                "authors": "Hangbo Yang, Lina Zhou, Jinsheng Lu, Shuowei Dai, Min Qiu and Qiang Li",
                "journal": "IEEE 15th International Conference on Optical Communications and Networks (ICOCN), IEEE Xplore, 1-3 March 2016, Hangzhou, China.",
                "year": "2016",
                "type": "会议论文",
                "doi": "",
                "link": "",
                "keywords": "conference presentation"
          },
          {
                "id": "default-paper-45",
                "title": "Laser assisted welding of gold nanowires",
                "authors": "Lina Zhou, Guoping Liu, Si Luo, Qiang Li and Min Qiu",
                "journal": "5th International Conference on Advances in Optoelectronics and Micro/Nano-optics (AOM 2015), Journal of Physics: Conference Series, 680, 28-31 October 2015, Hangzhou, China Scholarships and",
                "year": "2015",
                "type": "会议论文",
                "doi": "",
                "link": "",
                "keywords": "conference presentation"
          }
    ];
  }

  function populateDirections(root = document) {
    $$("[data-research-directions]", root).forEach(select => {
      const current = select.value;
      select.innerHTML = `<option value="">请选择</option>${DIRECTIONS.map(direction => `<option>${escapeHtml(direction)}</option>`).join("")}`;
      select.value = current;
    });
  }

  async function initProgressForm() {
    await loadProgressOnly();
    populateDirections();
    renderSharedProgress();
    $("#progressForm").addEventListener("submit", async event => {
      event.preventDefault();
      const submitButton = event.currentTarget.querySelector("button[type='submit']");
      const file = event.currentTarget.elements.attachment_file?.files?.[0] || null;
      submitButton.disabled = true;
      $("#submitMessage").textContent = file ? "正在上传附件并提交，请稍候..." : "正在提交，请稍候...";
      const data = formData(event.currentTarget);
      delete data.attachment_file;
      const row = {
        id: uid(),
        created_at: new Date().toISOString(),
        ...data,
        review_status: "未读",
        feedback: ""
      };
      row.report_date = row.period || null;
      try {
        const attachment = await uploadAttachment(file, row.id);
        if (attachment) Object.assign(row, attachment);
        write(KEYS.progress, [row, ...progressItems()]);
        await cloudInsert("research_progress", row);
        event.currentTarget.reset();
        $("#submitMessage").textContent = file ? "提交成功，附件已上传，老师将在后台查看并下载。" : "提交成功，文字进展已更新到组内进展墙。";
        renderSharedProgress();
      } catch (error) {
        console.error(error);
        if (!file) {
          write(KEYS.progress, [row, ...progressItems()]);
          renderSharedProgress();
        }
        alert(file ? "附件上传或云端保存失败，请稍后重试，或先使用附件链接提交。" : "云端保存失败，但数据已临时保存在本机。");
        $("#submitMessage").textContent = "提交未完全成功，请按提示处理。";
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  function sharedProgressItems() {
    return progressItems().filter(item => item.review_status !== "已归档");
  }

  function renderSharedProgress() {
    const list = $("#sharedProgressList");
    if (!list) return;
    const rows = sharedProgressItems();
    $("#sharedProgressCount").textContent = rows.length ? `${rows.length} 条文字进展` : "";
    list.innerHTML = rows.length ? rows.map(sharedProgressCard).join("") : `<div class="empty-state">暂无组内进展。</div>`;
  }

  function sharedProgressCard(item) {
    return `<article class="progress-card public-progress-card">
      <div class="section-head">
        <div>
          <h3>${escapeHtml(item.student_name || "未填写姓名")}｜${escapeHtml(item.project_title || "未填写课题")}</h3>
          <p class="meta">${escapeHtml(item.student_level || "身份待补充")}｜${escapeHtml(item.research_direction || "方向待补充")}｜汇报日期：${escapeHtml(progressReportDate(item))}</p>
        </div>
        <span class="pill">${escapeHtml(item.status || "进行中")}</span>
      </div>
      <div class="card-grid">
        ${noteBlock("完成内容", item.completed_work || "未填写")}
        ${noteBlock("关键结果", item.key_results || "未填写")}
        ${noteBlock("遇到的问题", item.blockers || "无")}
        ${noteBlock("下一步计划", item.next_plan || "未填写")}
      </div>
    </article>`;
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
    renderProjectEditor();
    renderPaperEditor();
    $("#searchInput").oninput = renderProgress;
    $("#directionFilter").onchange = renderProgress;
    $("#reviewFilter").onchange = renderProgress;
    $("#copySummary").onclick = () => copyText(progressSummary(filteredProgress()));
    $("#exportCsv").onclick = exportProgressCsv;
    $("#seedData").onclick = seedData;
    $("#saveProfile").onclick = saveProfile;
    $("#addProject").onclick = () => addProject();
    $("#addPaper").onclick = () => addPaper();
  }

  function renderStats() {
    const rows = progressItems();
    const stats = [
      ["提交总数", rows.length],
      ["未读", rows.filter(item => item.review_status === "未读").length],
      ["需面谈", rows.filter(item => item.review_status === "需面谈").length],
      ["论文条目", papers().length],
      ["科研项目", projects().length]
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
    const dateText = progressReportDate(item);
    const attachmentLink = progressAttachmentLink(item);
    return `<article class="progress-card">
      <div class="section-head">
        <div>
          <h3>${escapeHtml(item.student_name)}｜${escapeHtml(item.project_title)}</h3>
          <p class="meta">${escapeHtml(item.student_level)}｜${escapeHtml(item.research_direction)}｜汇报日期：${escapeHtml(dateText)}｜提交时间：${formatDate(item.created_at)}</p>
        </div>
        <span class="pill ${warn ? "warn" : "ok"}">${escapeHtml(item.review_status || "未读")}</span>
      </div>
      <div class="card-grid">
        ${noteBlock("完成内容", item.completed_work)}
        ${noteBlock("关键结果", item.key_results)}
        ${noteBlock("遇到的问题", item.blockers || "无")}
        ${noteBlock("下一步计划", item.next_plan)}
      </div>
      <p class="meta">导师/指导老师：${escapeHtml(item.advisor || "未填写")} ${attachmentLink}</p>
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

  function progressReportDate(item) {
    return item.report_date || item.period || "";
  }

  function progressAttachmentLink(item) {
    if (!item.attachment_url) return "";
    const label = item.attachment_name ? `下载附件：${item.attachment_name}` : "附件链接";
    const size = item.attachment_size ? `（${formatFileSize(item.attachment_size)}）` : "";
    return `｜<a href="${escapeHtml(item.attachment_url)}" target="_blank" rel="noopener" download>${escapeHtml(label)}${escapeHtml(size)}</a>`;
  }

  function formatFileSize(bytes) {
    const value = Number(bytes) || 0;
    if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${value} B`;
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
    const current = progressItems().find(item => item.id === id);
    write(KEYS.progress, progressItems().filter(item => item.id !== id));
    try {
      await cloudDelete("research_progress", id);
      await deleteAttachment(current?.attachment_path);
    }
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

  function renderProjectEditor() {
    $("#projectEditor").innerHTML = projects().map(projectEditCard).join("") || `<div class="empty-state">暂无项目。点击“新增项目”开始添加。</div>`;
    $$("[data-project-field]").forEach(element => element.addEventListener("change", updateProjectField));
    $$("[data-project-delete]").forEach(button => button.addEventListener("click", deleteProject));
  }

  function projectEditCard(project) {
    const fields = [
      ["title", "项目名称"], ["role", "角色"], ["period", "周期"],
      ["funding", "经费/来源"], ["status", "状态"], ["description", "说明"]
    ];
    return `<article class="paper-edit-card">
      <div class="form-grid">
        ${fields.map(([name, label]) => `<label>${label}<input data-id="${project.id}" data-project-field="${name}" value="${escapeHtml(project[name] || "")}"></label>`).join("")}
      </div>
      <div class="actions"><button class="danger" type="button" data-project-delete="${project.id}">删除项目</button></div>
    </article>`;
  }

  async function addProject() {
    const row = { id: uid(), created_at: new Date().toISOString(), role: "项目负责人", title: "新项目名称", period: "", funding: "", status: "在研", description: "" };
    write(KEYS.projects, [row, ...projects().filter(project => !String(project.id).startsWith("default-"))]);
    try { await cloudInsert("research_projects", row); }
    catch (error) { console.error(error); alert("云端新增失败，当前只添加了本机缓存。"); }
    renderProjectEditor();
    renderStats();
  }

  async function updateProjectField(event) {
    const { id, projectField } = event.currentTarget.dataset;
    const value = event.currentTarget.value;
    const source = projects();
    const oldItem = source.find(project => project.id === id);
    const newId = String(id).startsWith("default-") ? uid() : id;
    const updatedItem = { ...oldItem, id: newId, [projectField]: value };
    write(KEYS.projects, source.map(project => project.id === id ? updatedItem : project));
    try {
      if (String(id).startsWith("default-")) await cloudInsert("research_projects", updatedItem);
      else await cloudPatch("research_projects", id, { [projectField]: value });
    } catch (error) {
      console.error(error);
      alert("云端更新失败，当前只更新了本机缓存。");
    }
    renderProjectEditor();
  }

  async function deleteProject(event) {
    const id = event.currentTarget.dataset.projectDelete;
    if (!confirm("确定删除这个项目吗？")) return;
    write(KEYS.projects, projects().filter(project => project.id !== id));
    if (!String(id).startsWith("default-")) {
      try { await cloudDelete("research_projects", id); }
      catch (error) { console.error(error); alert("云端删除失败，当前只删除了本机缓存。"); }
    }
    renderProjectEditor();
    renderStats();
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
    const source = papers();
    const oldItem = source.find(paper => paper.id === id);
    const newId = String(id).startsWith("default-") ? uid() : id;
    const updatedItem = { ...oldItem, id: newId, [paperField]: value };
    write(KEYS.papers, source.map(paper => paper.id === id ? updatedItem : paper));
    try {
      if (String(id).startsWith("default-")) await cloudInsert("research_papers", updatedItem);
      else await cloudPatch("research_papers", id, { [paperField]: value });
    } catch (error) {
      console.error(error);
      alert("云端更新失败，当前只更新了本机缓存。");
    }
    renderPaperEditor();
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
    renderProjects();
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

  function renderProjects() {
    $("#projectList").innerHTML = projects().length ? projects().map(projectCard).join("") : `<div class="empty-state">暂无项目条目。</div>`;
  }

  function projectCard(project) {
    return `<article class="project-card">
      <div class="section-head">
        <div>
          <h3>${escapeHtml(project.title || "项目名称待补充")}</h3>
          <p class="meta">${escapeHtml(project.role || "角色待补充")}｜${escapeHtml(project.period || "周期待补充")}｜${escapeHtml(project.status || "状态待补充")}</p>
        </div>
        <span class="pill ok">${escapeHtml(project.funding || "项目")}</span>
      </div>
      <p>${escapeHtml(project.description || "项目说明待补充。")}</p>
    </article>`;
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
    return rows.map((item, index) => `${index + 1}. ${item.student_name}｜汇报日期：${progressReportDate(item)}｜${item.project_title}\n完成：${item.completed_work}\n问题：${item.blockers || "无"}\n下一步：${item.next_plan}\n`).join("\n") || "暂无进展记录。";
  }

  function exportProgressCsv() {
    const headers = ["created_at","student_name","student_level","research_direction","report_date","project_title","advisor","completed_work","key_results","blockers","next_plan","status","review_status","feedback","attachment_name","attachment_url","notes"];
    const exportRows = progressItems().map(row => ({ ...row, report_date: progressReportDate(row) }));
    const lines = [headers.join(",")].concat(exportRows.map(row => headers.map(h => `"${String(row[h] || "").replaceAll('"', '""')}"`).join(",")));
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
        period: "2026-08-31",
        report_date: "2026-08-31",
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
