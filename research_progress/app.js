const ProgressApp = (() => {
  const ADMIN_PASSWORD = "progress2026";
  const GROUP_PASSWORD = "nuaa2026";
  const config = window.PROGRESS_CONFIG || {};
  const STORAGE_BUCKET = "progress-attachments";
  const SHARE_BUCKET = "shared-resources";
  const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
  const KEYS = {
    progress: "lab_progress_items",
    profile: "lab_profile",
    papers: "lab_papers",
    projects: "lab_projects",
    shares: "lab_shared_resources",
    progressAccess: "lab_progress_access_ok",
    admin: "lab_progress_admin_ok"
  };
  const DIRECTIONS = [
    "单像素成像与鬼成像 / Single-pixel and Ghost Imaging",
    "复杂散射介质成像 / Imaging through Complex Scattering Media",
    "光学计算成像 / Computational Optical Imaging",
    "光学信息安全与光学加密 / Optical Information Security",
    "机器学习赋能光学成像 / Machine Learning for Optical Imaging",
    "太赫兹技术与成像 / Terahertz Technology and Imaging",
    "二维材料光电器件 / 2D-material Optoelectronic Devices",
    "非线性光学成像 / Nonlinear Optical Imaging",
    "微波光子学 / Microwave Photonics",
    "微波光子雷达及关键技术",
    "微波光子信号处理技术",
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

  function publicStorageUrl(path, bucket = STORAGE_BUCKET) {
    return `${config.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${path}`;
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

  async function uploadSharedResource(file, resourceId) {
    if (!file || !file.size) return null;
    if (!cloudEnabled()) throw new Error("文件上传需要先配置 Supabase。");
    if (file.size > MAX_UPLOAD_SIZE) throw new Error("文件不能超过 50 MB。");
    const path = `${resourceId}/${Date.now()}-${cleanFileName(file.name)}`;
    await storageRequest(`object/${SHARE_BUCKET}/${encodeURIComponent(path).replaceAll("%2F", "/")}`, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "false"
      },
      body: file
    });
    return {
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      file_type: file.type || "",
      file_url: publicStorageUrl(path, SHARE_BUCKET)
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

  async function loadSharedResources() {
    if (!cloudEnabled()) return;
    const shares = await safeCloudRead("shared_resources?select=*&order=created_at.desc", sharedResources());
    if (shares.ok) write(KEYS.shares, shares.data || []);
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
    const rows = read(KEYS.progress, []);
    return rows.length ? rows : defaultProgress();
  }

  function sharedResources() {
    return read(KEYS.shares, defaultSharedResources());
  }

  function defaultProgress() {
    return demoProgressRows().map((item, index) => ({
      ...item,
      id: `demo-progress-${index + 1}`,
      created_at: "2026-08-31T09:00:00.000Z"
    }));
  }

  function profileData() {
    return read(KEYS.profile, {
      name: "周莉娜",
      title: "南京航空航天大学微波光子学实验室 副教授",
      bio: "周莉娜博士主要从事光子学与光学成像研究，研究方向包括单像素成像、鬼成像、散射介质成像、信息光子学、光学加密与认证，以及人工智能赋能的光子学系统。现任南京航空航天大学副教授，承担本科生《数字逻辑电路》和博士生《非线性光学》等课程。",
      google_scholar: "https://scholar.google.com/citations?user=HYJKgg4AAAAJ&hl=en&oi=ao",
      personal_homepage: "",
      orcid: "",
      email: "linazhou@nuaa.edu.cn",
      research_keywords: "单像素成像；鬼成像；复杂散射介质成像；光学计算成像；光学信息安全；机器学习光学；太赫兹成像；二维材料器件；非线性光学成像；微波光子学"
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
    const unlock = async () => {
      $("#progressLogin").classList.add("hidden");
      $("#progressApp").classList.remove("hidden");
      await loadProgressOnly();
      populateDirections();
      renderSharedProgress();
    };
    if (sessionStorage.getItem(KEYS.progressAccess) === "1") await unlock();
    $("#progressLoginForm").addEventListener("submit", async event => {
      event.preventDefault();
      if (formData(event.currentTarget).password === GROUP_PASSWORD) {
        sessionStorage.setItem(KEYS.progressAccess, "1");
        await unlock();
      } else {
        $("#progressLoginMessage").textContent = "口令不正确，请向负责人确认。 / Incorrect password.";
      }
    });
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

  async function initShare() {
    await loadSharedResources();
    populateDirections();
    renderShareFilters();
    renderSharedResources();
    $("#shareSearch").addEventListener("input", renderSharedResources);
    $("#shareDirection").addEventListener("change", renderSharedResources);
    $("#shareType").addEventListener("change", renderSharedResources);
    $("#shareForm").addEventListener("submit", async event => {
      event.preventDefault();
      const submitButton = event.currentTarget.querySelector("button[type='submit']");
      const file = event.currentTarget.elements.resource_file?.files?.[0] || null;
      const data = formData(event.currentTarget);
      delete data.resource_file;
      const row = {
        id: uid(),
        created_at: new Date().toISOString(),
        ...data
      };
      submitButton.disabled = true;
      $("#shareMessage").textContent = file ? "正在上传并发布分享..." : "正在发布分享...";
      try {
        const uploaded = await uploadSharedResource(file, row.id);
        if (uploaded) Object.assign(row, uploaded);
        write(KEYS.shares, [row, ...sharedResources()]);
        if (cloudEnabled()) await cloudInsert("shared_resources", row);
        event.currentTarget.reset();
        populateDirections();
        renderShareFilters();
        renderSharedResources();
        $("#shareMessage").textContent = "分享成功，组内成员可以在下方查看和下载。";
      } catch (error) {
        console.error(error);
        if (!file) {
          write(KEYS.shares, [row, ...sharedResources()]);
          renderShareFilters();
          renderSharedResources();
        }
        alert(file ? "文件上传失败，请稍后重试，或先填写外部链接。" : "云端保存失败，当前只保存了本机缓存。");
        $("#shareMessage").textContent = "提交未完全成功，请按提示处理。";
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  function renderShareFilters() {
    const directions = [...new Set(sharedResources().map(item => item.research_direction).filter(Boolean))];
    const types = [...new Set(sharedResources().map(item => item.resource_type).filter(Boolean))];
    $("#shareDirection").innerHTML = `<option value="">全部方向</option>${directions.map(item => `<option>${escapeHtml(item)}</option>`).join("")}`;
    $("#shareType").innerHTML = `<option value="">全部类型</option>${types.map(item => `<option>${escapeHtml(item)}</option>`).join("")}`;
  }

  function filteredSharedResources() {
    const q = ($("#shareSearch")?.value || "").trim().toLowerCase();
    const direction = $("#shareDirection")?.value || "";
    const type = $("#shareType")?.value || "";
    return sharedResources().filter(item => {
      const blob = [item.title, item.contributor, item.research_direction, item.summary, item.keywords, item.resource_type].join(" ").toLowerCase();
      return (!q || blob.includes(q)) && (!direction || item.research_direction === direction) && (!type || item.resource_type === type);
    });
  }

  function renderSharedResources() {
    const target = $("#shareList");
    if (!target) return;
    const rows = filteredSharedResources();
    target.innerHTML = rows.length ? rows.map(sharedResourceCard).join("") : `<div class="empty-state">暂无分享。可以上传一篇文献、一个软件链接或一个算法代码包。</div>`;
  }

  function sharedResourceCard(item) {
    const fileLink = item.file_url ? `<a href="${escapeHtml(item.file_url)}" target="_blank" rel="noopener" download>下载文件 / Download ${item.file_name ? `：${escapeHtml(item.file_name)}` : ""}${item.file_size ? `（${escapeHtml(formatFileSize(item.file_size))}）` : ""}</a>` : "";
    const externalLink = item.resource_url ? `<a href="${escapeHtml(item.resource_url)}" target="_blank" rel="noopener">外部链接 / External Link</a>` : "";
    return `<article class="paper-card share-card">
      <div class="section-head">
        <div>
          <h2 class="paper-title">${escapeHtml(item.title || "标题待补充")}</h2>
          <p class="meta">${escapeHtml(item.resource_type || "资料")}｜${escapeHtml(item.research_direction || "方向待补充")}｜${escapeHtml(item.year || "年份待补充")}</p>
        </div>
        <span class="pill">${escapeHtml(item.contributor || "分享人")}</span>
      </div>
      <p>${escapeHtml(item.summary || "推荐理由待补充。")}</p>
      ${item.keywords ? `<p class="meta">关键词 / Keywords：${escapeHtml(item.keywords)}</p>` : ""}
      <div class="link-row">${fileLink}${externalLink}</div>
    </article>`;
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
    const unlock = () => {
      $("#loginPanel").classList.add("hidden");
      $("#adminApp").classList.remove("hidden");
      renderAdmin();
      loadCloudData().then(renderAdmin).catch(error => console.error(error));
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
    if (String(id).startsWith("demo-progress-")) {
      renderProgress();
      return;
    }
    try { await cloudPatch("research_progress", id, { [progressField]: value }); }
    catch (error) { console.error(error); alert("云端更新失败，当前只更新了本机缓存。"); }
    renderProgress();
  }

  async function deleteProgress(event) {
    const id = event.currentTarget.dataset.progressDelete;
    if (!confirm("确定删除这条进展记录吗？")) return;
    const current = progressItems().find(item => item.id === id);
    write(KEYS.progress, progressItems().filter(item => item.id !== id));
    if (String(id).startsWith("demo-progress-")) {
      renderProgress();
      return;
    }
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
    renderPublicProfile();
    renderResearchMap();
    renderProjects();
    renderPaperFilters();
    renderPapers();
    await loadCloudData();
    renderPublicProfile();
    renderProjects();
    renderPaperFilters();
    renderPapers();
    $("#paperSearch").addEventListener("input", renderPapers);
    $("#paperYear").addEventListener("change", renderPapers);
    $("#paperType").addEventListener("change", renderPapers);
  }

  function researchDirections() {
    const base = "https://linazhouzhou.github.io/LinaZHOU.github.io/research";
    return [
      {
        id: "scattering",
        title: "复杂散射介质成像",
        subtitle: "Scattering-media imaging",
        image: "assets/research/media.png",
        imageAlt: "动态浑浊介质中的鬼成像实验系统",
        count: "3 篇代表论文",
        years: "2022-2023",
        idea: "面向生物组织、雾、浑浊液体等强散射场景，发展自校正单像素成像与鬼成像方法。Focus on robust optical imaging through dynamic and complex scattering media.",
        route: ["散射扰动", "单像素采样", "自校正重建", "高分辨成像"],
        works: [
          ["Self-corrected orthonormalized ghost imaging through dynamic and complex scattering media", `${base}/media1.pdf`],
          ["High-resolution self-corrected single-pixel imaging through dynamic and complex scattering media", `${base}/media2.pdf`],
          ["High-resolution ghost imaging through complex scattering media via a temporal correction", `${base}/media3.pdf`]
        ]
      },
      {
        id: "computational",
        title: "光学计算成像与单像素探测",
        subtitle: "Computational imaging and single-pixel detection",
        image: "assets/research/media2.png",
        imageAlt: "复杂介质成像重建结果",
        count: "核心方向",
        years: "Ongoing",
        idea: "围绕光场编码、单像素探测、计算重建和抗扰动成像，构建低维探测条件下的高质量图像获取方法。This direction links optical encoding with computational reconstruction.",
        route: ["光场编码", "压缩采样", "计算重建", "智能成像"],
        works: [
          ["High-resolution self-corrected single-pixel imaging through dynamic and complex scattering media", `${base}/media2.pdf`],
          ["High-resolution ghost imaging through complex scattering media via a temporal correction", `${base}/media3.pdf`]
        ]
      },
      {
        id: "transmission",
        title: "复杂介质光信息传输",
        subtitle: "Optical information transmission",
        image: "assets/research/trans1.png",
        imageAlt: "自由空间光信息传输实验系统",
        count: "12 篇代表论文",
        years: "2021-2022",
        idea: "将单像素探测、随机编码、动态缩放和频域调制结合，用于浑浊水、烟雾、厚组织和非视距环境中的高保真信息传输。",
        route: ["随机编码", "单像素探测", "物理增强", "抗散射传输"],
        works: [
          ["Optical data transmission through highly dynamic and turbid water using dynamic scaling factors and single-pixel detector", `${base}/trans1.pdf`],
          ["Accurate optical information transmission through thick tissues using zero-frequency modulation and single-pixel detection", `${base}/trans3.pdf`],
          ["High-fidelity temporally-corrected transmission through dynamic smoke via pixel-to-plane data encoding", `${base}/trans6.pdf`],
          ["Non-line-of-sight optical information transmission through turbid water", `${base}/trans12.pdf`]
        ]
      },
      {
        id: "security",
        title: "光学信息安全",
        subtitle: "Optical security and hiding",
        image: "assets/research/secu.png",
        imageAlt: "光学隐藏和全息安全示意图",
        count: "2 篇代表论文",
        years: "2021",
        idea: "利用全息、随机相位、单输入多输出和二值振幅编码，实现光学隐藏、认证和物理层安全。",
        route: ["秘密图像", "随机分发", "全息编码", "安全恢复"],
        works: [
          ["Optical hiding with visual cryptography and binary amplitude-only holograms", `${base}/secu1.pdf`],
          ["Optical hiding based on single-input multiple-output and binary amplitude-only holograms", `${base}/secu2.pdf`]
        ]
      },
      {
        id: "machine-learning",
        title: "机器学习与光学系统",
        subtitle: "Machine learning for optics",
        image: "assets/research/ml1.png",
        imageAlt: "机器学习破解和识别光学密文的网络结构",
        count: "5 篇代表论文",
        years: "2019-2021",
        idea: "用机器学习理解复杂散射、评估光学加密脆弱性，并探索学习驱动的光学认证与攻击检测。",
        route: ["光学密文", "学习模型", "脆弱性检测", "认证/攻击"],
        works: [
          ["Learning-based optical authentication in complex scattering media", `${base}/ml1.pdf`],
          ["Learning complex scattering media for optical encryption", `${base}/ml2.pdf`],
          ["Vulnerability to machine learning attacks of optical encryption based on diffractive imaging", `${base}/ml3.pdf`],
          ["Machine-learning attacks on interference-based optical encryption", `${base}/ml5.pdf`]
        ]
      },
      {
        id: "nanophotonics",
        title: "纳米光子学与光控纳米结构",
        subtitle: "Nanophotonics",
        image: "assets/research/nanophotonics.png",
        imageAlt: "金纳米线光控实验系统",
        count: "2 篇代表论文",
        years: "2017",
        idea: "研究金属纳米线在光场调控下的断裂、焊接与纳米尺度光热效应，为微纳器件加工和可重构结构提供物理基础。",
        route: ["纳米线", "光热调控", "可控断裂", "微纳加工"],
        works: [
          ["Optically controllable nanobreaking of metallic nanowires", `${base}/nanophotonics1.pdf`],
          ["Light-Induced Pulling and Pushing by the Synergic Effect of Optical Force and Photophoretic Force", `${base}/nanophotonics2.pdf`]
        ]
      }
    ];
  }

  function renderResearchMap() {
    const tabs = $("#researchTabs");
    const target = $("#researchDirections");
    if (!tabs || !target) return;
    const directions = researchDirections();
    tabs.innerHTML = directions.map(direction => `<a href="#research-${direction.id}">${escapeHtml(direction.title)}</a>`).join("");
    target.innerHTML = directions.map(researchDirectionCard).join("");
  }

  function researchDirectionCard(direction) {
    const linkedWorks = direction.works.filter(([, href]) => href);
    return `<article class="research-card" id="research-${escapeHtml(direction.id)}">
      <div class="research-media">
        <img src="${escapeHtml(direction.image)}" alt="${escapeHtml(direction.imageAlt)}">
      </div>
      <div class="research-content">
        <div class="research-title-row">
          <div>
            <p class="eyebrow">${escapeHtml(direction.subtitle)}</p>
            <h3>${escapeHtml(direction.title)}</h3>
          </div>
          <span class="pill ok">${escapeHtml(direction.count)}</span>
        </div>
        <p>${escapeHtml(direction.idea)}</p>
        <div class="research-flow">
          ${direction.route.map(step => `<span>${escapeHtml(step)}</span>`).join("")}
        </div>
        ${linkedWorks.length ? `<div class="research-work-list">
          ${linkedWorks.map(([title, href]) => `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>`).join("")}
        </div>` : ""}
      </div>
    </article>`;
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
    const sampleProgress = demoProgressRows().map(item => ({ ...item, id: uid(), created_at: new Date().toISOString() }));
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

  function demoProgressRows() {
    return [
      {
        student_name: "测试本科生-王同学",
        student_level: "本科生",
        research_direction: "单像素成像与鬼成像 / Single-pixel and Ghost Imaging",
        period: "2026-08-31",
        report_date: "2026-08-31",
        project_title: "散射介质中单像素成像文献复现",
        advisor: "周老师",
        completed_work: "完成三篇单像素成像和鬼成像相关论文阅读，整理了光源、SLM、探测器和重建算法流程，并尝试复现基础随机采样重建。",
        key_results: "已得到低分辨率重建图像；采样率从 10% 提高到 30% 后，图像轮廓明显改善。",
        blockers: "对动态散射介质的时间校正方法理解还不够，需要进一步确认公式推导。",
        next_plan: "继续复现 self-corrected single-pixel imaging 的核心流程，补充不同采样率和噪声水平下的对比图。",
        status: "进行中",
        attachment_url: "",
        attachment_name: "",
        notes: "测试演示数据，可在后台删除。",
        review_status: "未读",
        feedback: ""
      },
      {
        student_name: "测试硕士生-李同学",
        student_level: "硕士生",
        research_direction: "微波光子信号处理技术",
        period: "2026-08-31",
        report_date: "2026-08-31",
        project_title: "微波光子链路线性化与频响测试",
        advisor: "周老师",
        completed_work: "搭建初步微波光子链路，完成调制器偏置点扫描和 2-18 GHz 频响测试，整理了三组重复实验数据。",
        key_results: "链路在 6-14 GHz 区间响应较平坦，最大起伏约 2.8 dB；调整偏置点后低频段噪声有所下降。",
        blockers: "高频段测试重复性一般，怀疑与连接器损耗和仪器校准有关。",
        next_plan: "重新校准矢网和射频线缆，补充不同光功率下的频响曲线，并准备下次组会 PPT。",
        status: "需要讨论",
        attachment_url: "",
        attachment_name: "",
        notes: "测试演示数据，可在后台删除。",
        review_status: "未读",
        feedback: ""
      }
    ];
  }

  function defaultSharedResources() {
    return [
      {
        id: "demo-share-1",
        created_at: "2026-09-01T09:00:00.000Z",
        contributor: "测试本科生-王同学",
        resource_type: "文献 / Paper",
        research_direction: "光学计算成像、散射介质成像、光学信息安全",
        year: "2023",
        title: "High-resolution self-corrected single-pixel imaging through dynamic and complex scattering media",
        summary: "适合刚进入单像素成像方向的同学阅读，可以帮助理解动态散射介质下为什么需要自校正，以及实验系统如何搭建。",
        keywords: "single-pixel imaging; scattering media; self-correction",
        resource_url: "https://linazhouzhou.github.io/LinaZHOU.github.io/research/media2.pdf",
        file_url: "",
        file_name: ""
      },
      {
        id: "demo-share-2",
        created_at: "2026-09-01T09:05:00.000Z",
        contributor: "测试硕士生-李同学",
        resource_type: "算法 / Algorithm",
        research_direction: "微波光子信号处理技术",
        year: "2026",
        title: "频响曲线平滑与误差条绘图脚本",
        summary: "用于整理微波光子链路频响测试数据，可以统一输出频响曲线、重复实验均值和误差条，适合组会汇报前快速检查数据稳定性。",
        keywords: "microwave photonics; frequency response; plotting",
        resource_url: "",
        file_url: "",
        file_name: ""
      }
    ];
  }

  return { initProgressForm, initAdmin, initPublications, initShare };
})();
