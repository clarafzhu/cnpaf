(function () {
  "use strict";

  const escapeHtml = s => s == null ? '' : String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const BASE_URL = 'https://cnpaf.org/api';
  const TOKEN_KEY = 'cpaf_token';
  const LANG_KEY = "cpaf_lang";

  // ─── Language ─────────────────────────────────────────────────────────────────

  let currentLang = (() => {
    // URL param from main site takes priority (e.g. /portal?lang=zh)
    const urlLang = new URLSearchParams(location.search).get('lang');
    if (urlLang === 'zh') { try { localStorage.setItem(LANG_KEY, 'zh'); } catch {} return 'zh'; }
    if (urlLang === 'tc' || urlLang === 'zt') { try { localStorage.setItem(LANG_KEY, 'zt'); } catch {} return 'zt'; }
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "zh" || saved === "zt") return saved;
    } catch {}
    return "en";
  })();

  const t = key => {
    const dict = window.CPAF_I18N?.[currentLang];
    return dict?.[key] ?? window.CPAF_I18N?.en?.[key] ?? key;
  };

  // ─── Lookup maps ──────────────────────────────────────────────────────────────

  const genderKeyMap = {
    Female: "genderFemale",
    Male: "genderMale",
    "Non-binary": "genderNonBinary",
    "Prefer not to say": "genderPreferNot",
  };

  const regionKeyMap = {
    US: "region_US", CA: "region_CA", AU: "region_AU", UK: "region_UK",
    CN: "region_CN", HK: "region_HK", MO: "region_MO", TW: "region_TW",
  };

  // ─── Auth token (localStorage so admin.html shares the same session) ──────────

  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
  const setToken = tok => { try { localStorage.setItem(TOKEN_KEY, tok); } catch {} };
  const clearToken = () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} };

  // ─── API helper ───────────────────────────────────────────────────────────────

  async function apiFetch(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(BASE_URL + path, { ...options, headers });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      return { ok: false, status: 0, data: { message: 'Network error. Please check your connection.' } };
    }
  }

  // ─── Tier ─────────────────────────────────────────────────────────────────────

  function calculateTier(points) {
    if (points >= 5000) return { id: "platinum", key: "benefitsTierPlatinum", benefits: ["benefitPlat1", "benefitPlat2", "benefitGold1", "benefitSilver1"] };
    if (points >= 1000) return { id: "gold",     key: "benefitsTierGold",     benefits: ["benefitGold1", "benefitGold2", "benefitSilver1"] };
    return                      { id: "silver",  key: "benefitsTierSilver",   benefits: ["benefitSilver1", "benefitSilver2"] };
  }

  // ─── Screen / Tab navigation ──────────────────────────────────────────────────

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(el => el.classList.remove("active"));
    document.getElementById(id)?.classList.add("active");
  }

  function switchTab(tabId) {
    document.querySelectorAll(".dash-tab").forEach(tab => tab.classList.remove("active"));
    document.querySelectorAll(".dash-menu li").forEach(li => li.classList.remove("active"));
    document.getElementById(tabId)?.classList.add("active");
    document.querySelector(`.dash-menu li[data-tab="${tabId}"]`)?.classList.add("active");
    if (tabId === "tab-profile") populateProfileForm();
    if (tabId === "tab-cabinet") renderYouthCabinet(window._cpaf_currentMember);
    if (tabId === "tab-benefits") loadBenefits();
  }
  window.switchTab = switchTab;

  // ─── Language application ─────────────────────────────────────────────────────

  function applyLanguage(lang) {
    if (lang === "zh" || lang === "zt" || lang === "en") currentLang = lang;
    try { localStorage.setItem(LANG_KEY, currentLang); } catch {}

    document.documentElement.lang = currentLang === "zh" ? "zh-Hans" : currentLang === "zt" ? "zh-Hant" : "en";
    document.body.classList.remove("lang-en", "lang-zh", "lang-zt");
    document.body.classList.add("lang-" + currentLang);

    document.querySelectorAll(".lang-btn").forEach(btn =>
      btn.classList.toggle("active", btn.getAttribute("data-lang") === currentLang)
    );
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      const translated = t(key);
      // Preserve child elements (e.g. badge spans) — only update the text node
      const textNode = Array.from(el.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = translated;
      else el.textContent = translated;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (key) el.placeholder = t(key);
    });

    if (window._cpaf_currentMember) {
      fillCardAndProfile(window._cpaf_currentMember);
      renderYouthCabinet(window._cpaf_currentMember);
    }
  }

  // ─── Format helpers ───────────────────────────────────────────────────────────

  function formatDob(dob) {
    if (!dob) return "—";
    const locale = currentLang === "zh" ? "zh-CN" : currentLang === "zt" ? "zh-HK" : "en-US";
    return new Date(dob).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
  }

  function formatAddress(m) {
    if (!m.addressStreet && !m.addressCity && !m.addressState) return "—";
    const s = m.addressStreet || "", c = m.addressCity || "", st = m.addressState || "", z = m.addressZip || "";
    if (["US", "CA", "AU", "UK"].includes(m.region)) {
      const parts = [s, c, st].filter(Boolean).join(", ");
      return z ? parts + " " + z : parts;
    }
    const parts = [st, c, s].filter(Boolean).join(" ");
    return z ? parts + " (" + z + ")" : parts;
  }

  // ─── Badge plaque ─────────────────────────────────────────────────────────────

  const BADGE_DEFS = [
    { tag: '__member__',    labelKey: 'badgeMember',       descKey: 'badgeMemberDesc',       icon: '◆', cls: 'badge-tile--member'    },
    { tag: 'Supporter',     labelKey: 'badgeSupporter',    descKey: 'badgeSupporterDesc',    icon: '❤', cls: 'badge-tile--supporter' },
    { tag: 'Volunteer',     labelKey: 'badgeVolunteer',    descKey: 'badgeVolunteerDesc',    icon: '🤝', cls: 'badge-tile--volunteer' },
    { tag: 'Donor',         labelKey: 'badgeDonor',        descKey: 'badgeDonorDesc',        icon: '💛', cls: 'badge-tile--donor'    },
    { tag: 'Youth Cabinet', labelKey: 'badgeYouthCabinet', descKey: 'badgeYouthCabinetDesc', icon: '✦', cls: 'badge-tile--cabinet', earnedOnly: true },
  ];

  function renderBadgePlaque(member) {
    const tags    = member?.tags || [];
    const cabinetExpired = member?.youth_cabinet_status === 'expired';
    const isEarned = def => def.tag === '__member__' || tags.includes(def.tag);

    // Overview panel — earnedOnly badges only appear when earned
    const panel = document.getElementById('badge-plaque-panel');
    if (panel) {
      const visibleDefs = BADGE_DEFS.filter(def => !def.earnedOnly || isEarned(def));
      panel.innerHTML = visibleDefs.map(def => {
        const earned = isEarned(def);
        return `<div class="badge-tile ${def.cls}${earned ? ' badge-tile--earned' : ' badge-tile--locked'}">
          <span class="badge-tile-icon">${def.icon}</span>
          <span class="badge-tile-label">${t(def.labelKey)}</span>
          <span class="badge-tile-desc">${earned ? t(def.descKey) : t('badgeNotEarned')}</span>
        </div>`;
      }).join('');
    }

    // Member card badge row — earned only, as compact pills
    const cardRow = document.getElementById('card-badges-row');
    if (cardRow) {
      const earnedDefs = BADGE_DEFS.filter(isEarned);
      cardRow.innerHTML = earnedDefs.map(def => {
        const isExpCabinet = def.tag === 'Youth Cabinet' && cabinetExpired;
        return `<span class="card-credential-pill ${def.cls}${isExpCabinet ? ' card-credential-pill--expired' : ''}">${def.icon} ${t(def.labelKey)}${isExpCabinet ? ' <small class="pill-expired-tag">已到期</small>' : ''}</span>`;
      }).join('');
    }
  }

  // ─── Fill card & dashboard ────────────────────────────────────────────────────

  function fillCardAndProfile(member) {
    if (!member) return;
    window._cpaf_currentMember = member;

    const locale = currentLang === "zh" ? "zh-CN" : currentLang === "zt" ? "zh-HK" : "en-US";
    const joinRaw = member.joinedAt || member.created_at;
    const joinDateCard = joinRaw
      ? new Date(joinRaw).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })
      : "—";
    const joinDate = joinRaw ? (() => {
      const d = new Date(joinRaw);
      const ymd = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
      const days = Math.floor((Date.now() - d.getTime()) / 86400000);
      return `Since ${ymd} · 已加入 ${days} 天`;
    })() : "—";

    const genderDisplay  = member.gender  ? (t(genderKeyMap[member.gender])   || member.gender)  : "—";
    const regionDisplay  = member.region  ? (t(regionKeyMap[member.region])   || member.region)  : "—";
    const zodiacDisplay  = member.zodiac  ? (t("zodiac_" + member.zodiac)     || member.zodiac)  : "—";
    const fullPhone = `${member.phoneCode || ""} ${member.phone || "—"}`.trim() || "—";

    const setEl = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setEl("card-membership-id", member.member_id || "—");
    setEl("dash-member-id",    member.member_id || "—");
    setEl("card-name",          member.name || "—");
    setEl("card-name-zh",       member.nameZh || "");
    setEl("card-gender",        genderDisplay);
    setEl("card-email",         member.email || "—");
    setEl("card-phone",         fullPhone);
    setEl("card-region",        regionDisplay);
    setEl("card-address",       formatAddress(member));
    setEl("card-mbti",          member.mbti || "—");
    setEl("card-zodiac",        zodiacDisplay);
    setEl("card-dob",           formatDob(member.dob));
    setEl("card-joined",        joinDateCard);
    setEl("card-bio",           member.bio || "—");

    setEl("dash-points", member.member_id || "—");
    setEl("dash-points-value", member.points != null ? String(member.points) : "—");
    setEl("dash-member-since", joinDate);
    setEl("dash-welcome-name", member.name || "Member");

    // Render badge plaque (overview + card)
    renderBadgePlaque(member);

    // Admin panel link visibility
    const adminLinkEl = document.getElementById("admin-panel-link");
    if (adminLinkEl) {
      adminLinkEl.style.display = member.is_admin ? "flex" : "none";
    }

    const tierInfo = calculateTier(member.points ?? 500);

    const tierEl = document.getElementById("dash-tier-name");
    if (tierEl) {
      tierEl.textContent = t(tierInfo.key);
      tierEl.className = "tier-name tier-" + tierInfo.id;
    }
    const tierCard = document.getElementById("tier-card");
    if (tierCard) tierCard.className = "tier-card tier-" + tierInfo.id;

    const overviewBadge = document.getElementById("overview-tier-badge");
    if (overviewBadge) {
      overviewBadge.textContent = t(tierInfo.key);
      overviewBadge.className = "overview-tier-badge tier-" + tierInfo.id;
    }

    const renderBenefitList = (id, items) => {
      const ul = document.getElementById(id);
      if (!ul) return;
      ul.innerHTML = "";
      items.forEach(b => { const li = document.createElement("li"); li.textContent = t(b); ul.appendChild(li); });
    };
    renderBenefitList("overview-benefits-preview-list", tierInfo.benefits.slice(0, 2));

    // Photo
    const cardPhoto = document.getElementById("card-photo-placeholder");
    if (cardPhoto) {
      if (member.photo) {
        cardPhoto.innerHTML = `<img src="${member.photo}" alt="Photo" />`;
      } else {
        const initials = (() => {
          const zh = (member.nameZh || '').trim();
          if (zh.length >= 2) return zh.slice(0, 2);
          const parts = (member.name || '').trim().split(/\s+/);
          if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
          return (parts[0] || '?')[0].toUpperCase();
        })();
        cardPhoto.innerHTML = `<div class="photo-initials">${initials}</div>`;
      }
      cardPhoto.style.opacity = "1";
    }

    // Unread notification badge (only for Youth Cabinet members)
    if ((member.tags || []).includes('Youth Cabinet')) {
      refreshNotifBadge();
    }
    loadOverviewInbox();
  }

  // ─── Profile form population ──────────────────────────────────────────────────

  function populateProfileForm() {
    const m = window._cpaf_currentMember;
    if (!m) return;
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
    setVal("dash-edit-name-zh",       m.nameZh);
    setVal("dash-edit-gender",        m.gender || "Prefer not to say");
    setVal("dash-edit-zodiac",        m.zodiac);
    setVal("dash-edit-email",         m.email);
    setVal("dash-edit-phone-code",    m.phoneCode || "+1");
    setVal("dash-edit-phone",         m.phone);
    setVal("dash-edit-address-street",m.addressStreet);
    setVal("dash-edit-address-city",  m.addressCity);
    setVal("dash-edit-address-state", m.addressState);
    setVal("dash-edit-address-zip",   m.addressZip);
    setVal("dash-edit-bio",           m.bio);
    const mbti = m.mbti || "----";
    ["1","2","3","4"].forEach((n, i) => {
      const el = document.getElementById("dash-edit-mbti-" + n);
      if (el) el.value = (mbti[i] && mbti[i] !== "-") ? mbti[i] : "";
    });
  }

  // ─── Benefits (dynamic) ───────────────────────────────────────────────────────

  const CYCLE_LABELS = {
    none: { en: 'No cycle', zh: '无周期限制', zt: '無週期限制' },
    monthly:     { en: 'Monthly',     zh: '每月',   zt: '每月' },
    quarterly:   { en: 'Quarterly',   zh: '每季度', zt: '每季度' },
    'semi-annual':{ en: 'Semi-annual', zh: '每半年', zt: '每半年' },
    annual:      { en: 'Annual',      zh: '每年',   zt: '每年' },
  };

  function cycleLabel(type) {
    return CYCLE_LABELS[type]?.[currentLang] || CYCLE_LABELS[type]?.en || type;
  }

  function localName(b, field) {
    if (currentLang === 'zh') return b[field + '_zh'] || b[field] || '';
    if (currentLang === 'zt') return b[field + '_zt'] || b[field + '_zh'] || b[field] || '';
    return b[field] || '';
  }

  async function loadBenefits() {
    const container = document.getElementById('benefits-dynamic-container');
    if (!container) return;
    container.innerHTML = '<p style="color:var(--text-muted);font-size:.875rem;">Loading…</p>';

    const res = await apiFetch('/benefits');
    if (!res.ok) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:.875rem;">Could not load benefits.</p>';
      return;
    }

    const benefits = (res.data.benefits || []).filter(b => b.is_active);
    if (!benefits.length) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:.875rem;font-style:italic;">No benefits configured yet.</p>';
      return;
    }

    const eligible  = benefits.filter(b => b.eligible);
    const locked    = benefits.filter(b => !b.eligible);

    function renderCard(b) {
      const name = localName(b, 'name') || b.name;
      const desc = localName(b, 'description') || b.description || '';
      const icon = b.icon || '✦';
      const tags = (b.tags_required || []);

      const tagsHtml = tags.length
        ? tags.map(tg => `<span class="benefit-req-tag">${tg}</span>`).join('')
        : `<span class="benefit-req-tag" style="background:rgba(22,163,74,.08);color:#166534;border-color:rgba(22,163,74,.3);">All Members</span>`;

      let trackerHtml = '';
      if (b.is_redeemable && b.eligible) {
        const used    = (b.usage || []).length;
        const limit   = b.redemption_limit || 1;
        const pct     = Math.min(100, Math.round((used / limit) * 100));
        const full    = used >= limit;
        const cycleStr = b.cycle_type !== 'none'
          ? `· ${cycleLabel(b.cycle_type)} ${b.cycle_key ? `(${b.cycle_key})` : ''}`
          : '';
        trackerHtml = `
          <div class="benefit-tracker">
            <div class="benefit-tracker-row">
              <div class="benefit-tracker-bar-wrap">
                <div class="benefit-tracker-fill${full ? ' benefit-tracker-fill--full' : ''}" style="width:${pct}%"></div>
              </div>
              <span class="benefit-tracker-meta">${used} / ${limit} 次已使用 ${cycleStr}</span>
            </div>
          </div>`;
      }

      const badge = b.eligible
        ? `<span class="benefit-eligible-badge">✓ 已解锁</span>`
        : `<span class="benefit-lock-badge">🔒 未解锁</span>`;

      return `
        <div class="benefit-card ${b.eligible ? 'benefit-card--eligible' : 'benefit-card--locked'}">
          <div class="benefit-icon">${icon}</div>
          <div class="benefit-body">
            <div class="benefit-header">
              <span class="benefit-name">${name}</span>
              ${badge}
            </div>
            ${desc ? `<p class="benefit-desc">${desc}</p>` : ''}
            <div class="benefit-tags">${tagsHtml}</div>
            ${trackerHtml}
          </div>
        </div>`;
    }

    let html = '';
    if (eligible.length) {
      html += `<p class="benefits-section-label">已解锁权益 (${eligible.length})</p>`;
      html += eligible.map(b => renderCard(b)).join('');
    }
    if (locked.length) {
      html += `<p class="benefits-section-label" style="margin-top:1.25rem;">其他权益</p>`;
      html += locked.map(b => renderCard(b)).join('');
    }
    container.innerHTML = html;
  }

  // ─── Youth Cabinet rendering ──────────────────────────────────────────────────

  function renderYouthCabinet(member) {
    const container = document.getElementById("cabinet-content");
    if (!container || !member) return;

    const hasTag = (member.tags || []).includes("Youth Cabinet");
    const status = member.youth_cabinet_status;
    const expiresAt = member.cabinet_expires_at ? new Date(member.cabinet_expires_at) : null;
    const isExpired = status === 'expired';
    const daysLeft = (expiresAt && !isExpired) ? Math.ceil((expiresAt - Date.now()) / 86400000) : null;
    const showWarning = daysLeft !== null && daysLeft <= 30 && daysLeft > 0;

    const renewHandler = async (btn, resetLabel) => {
      btn.disabled = true; btn.textContent = '处理中…';
      const res = await apiFetch('/youth-cabinet/renew', { method: 'POST' });
      if (res.ok) {
        const meRes = await apiFetch('/me');
        if (meRes.ok && meRes.data.user) {
          fillCardAndProfile(meRes.data.user);
          renderYouthCabinet(meRes.data.user);
        }
      } else {
        btn.disabled = false; btn.textContent = resetLabel;
        alert(res.data?.message || '续费失败，请稍后重试。');
      }
    };

    if (hasTag || isExpired) {
      if (isExpired) {
        container.innerHTML = `
          <div class="cabinet-unlocked cabinet-expired">
            <div class="cabinet-expired-banner">
              <span class="cabinet-expired-icon">⊘</span>
              <div class="cabinet-expired-text">
                <strong>年度会籍已到期</strong>
                <p>您的 Youth Cabinet 会籍已过期，请续费以恢复全部权益。</p>
              </div>
              <button class="btn btn-renew" id="cabinet-renew-btn">立即续费以解锁</button>
            </div>
            <div class="cabinet-section cabinet-section--dimmed">
              <div class="cabinet-section-hd">
                <h4 class="cabinet-section-title">实践进度追踪</h4>
                <span class="cabinet-locked-hint">⊘ 续费后可提交报告</span>
              </div>
              <div id="cabinet-tracker-wrap" class="cabinet-tracker-wrap">
                <p class="cabinet-loading">加载中…</p>
              </div>
            </div>
          </div>`;
        loadCabinetTracker();
        document.getElementById('cabinet-renew-btn')?.addEventListener('click', e => renewHandler(e.currentTarget, '立即续费以解锁'));

      } else {
        const warningHtml = showWarning ? `
          <div class="cabinet-expiry-warning">
            ⚠ 您的年度会籍将在 <strong>${daysLeft} 天</strong>后到期，请及时续费以保留权益。
            <button class="btn-link-subtle" id="cabinet-renew-early-btn">立即续费</button>
          </div>` : '';

        container.innerHTML = `
          <div class="cabinet-unlocked">
            ${warningHtml}
            <div class="cabinet-badge-hero">
              <span class="cabinet-tag-pill">✦ ${t('cabinetTagPill')}</span>
            </div>

            <div class="cabinet-section">
              <div class="cabinet-section-hd">
                <h4 class="cabinet-section-title">通知与消息</h4>
              </div>
              <div id="cabinet-notif-list" class="cabinet-notif-list">
                <p class="cabinet-loading">加载中…</p>
              </div>
            </div>

            <div class="cabinet-section">
              <div class="cabinet-section-hd">
                <h4 class="cabinet-section-title">实践进度追踪</h4>
                <button id="open-submit-activity" class="btn-link-subtle">＋ 提交实践报告</button>
              </div>
              <div id="cabinet-tracker-wrap" class="cabinet-tracker-wrap">
                <p class="cabinet-loading">加载中…</p>
              </div>
            </div>

            <div class="cabinet-section">
              <div class="cabinet-section-hd">
                <h4 class="cabinet-section-title">提交记录</h4>
                <button id="toggle-submissions" class="btn-link-subtle">展开 ▾</button>
              </div>
              <div id="cabinet-submissions-wrap" style="display:none">
                <p class="cabinet-loading">加载中…</p>
              </div>
            </div>
          </div>`;

        loadCabinetNotifications();
        loadCabinetTracker();

        if (showWarning) {
          document.getElementById('cabinet-renew-early-btn')?.addEventListener('click', e => renewHandler(e.currentTarget, '立即续费'));
        }
        document.getElementById('open-submit-activity')?.addEventListener('click', () => {
          document.getElementById('activity-submit-modal').style.display = 'flex';
        });

        let submissionsLoaded = false;
        document.getElementById('toggle-submissions')?.addEventListener('click', function () {
          const wrap = document.getElementById('cabinet-submissions-wrap');
          const expanded = wrap.style.display !== 'none';
          wrap.style.display = expanded ? 'none' : 'block';
          this.textContent = expanded ? '展开 ▾' : '收起 ▴';
          if (!expanded && !submissionsLoaded) {
            submissionsLoaded = true;
            loadSubmissionHistory();
          }
        });
      }

    } else if (status === "approved") {
      container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1.5rem;">
          <div class="cabinet-status-block cabinet-status-block--approved">
            <div class="cabinet-status-icon cabinet-icon-approved">✓</div>
            <h3>${t('cabinetApprovedTitle')}</h3>
            <p>恭喜您——内阁秘书处已批准您的申请资格，请点击下方确认加入。</p>
            <button class="btn btn-primary cabinet-activate-btn" id="cabinet-activate-btn">确认加入 →</button>
            <p class="cabinet-stripe-note">付款成功后系统将自动激活您的内阁成员身份，无需额外操作。</p>
          </div>
          <div class="overview-inbox">
            <div class="overview-inbox-hd">
              <h4 class="overview-inbox-title">通知与消息</h4>
              <span id="cabinet-approved-notif-badge" class="inbox-unread-badge" style="display:none;"></span>
            </div>
            <div id="cabinet-notif-list" class="inbox-list">
              <p class="cabinet-loading" style="padding:10px 16px;">加载中…</p>
            </div>
          </div>
        </div>`;

      document.getElementById('cabinet-activate-btn').addEventListener('click', () => {
        showDisclaimerModal(member.id);
      });
      loadCabinetNotificationsAsInbox();

    } else if (status === "pending") {
      container.innerHTML = `
        <div class="cabinet-status-block cabinet-status-block--pending">
          <div class="cabinet-status-icon cabinet-icon-pending">⧗</div>
          <h3>${t('cabinetPendingTitle')}</h3>
          <p>${t('cabinetPendingDesc')}</p>
          <div class="cabinet-section" style="margin-top:1.5rem">
            <div class="cabinet-section-hd"><h4 class="cabinet-section-title">通知与消息</h4></div>
            <div id="cabinet-notif-list" class="cabinet-notif-list"><p class="cabinet-loading">加载中…</p></div>
          </div>
        </div>`;
      loadPersonalNotifications();

    } else if (status === "rejected") {
      const fb = member.cabinet_feedback;
      container.innerHTML = `
        <div class="cabinet-status-block cabinet-status-block--rejected">
          <div class="cabinet-status-icon">✗</div>
          <h3>申请未通过</h3>
          <p>感谢您的申请。经综合评估，本次未能通过审核。如有疑问，请联系秘书处：<a href="mailto:ycsec@cnpaf.org">ycsec@cnpaf.org</a></p>
          ${fb ? `<div class="cabinet-feedback-note"><strong>秘书处反馈：</strong>${escapeHtml(fb)}</div>` : ''}
        </div>`;

    } else if (status === "info_requested") {
      const fb = member.cabinet_feedback;
      container.innerHTML = `
        <div class="cabinet-status-block cabinet-status-block--info">
          <div class="cabinet-status-icon">✎</div>
          <h3>申请材料待补充</h3>
          <p>秘书处需要您提供补充信息，请查看以下反馈，并将补充材料发送至 <a href="mailto:ycsec@cnpaf.org">ycsec@cnpaf.org</a>。</p>
          ${fb ? `<div class="cabinet-feedback-note"><strong>秘书处反馈：</strong>${escapeHtml(fb)}</div>` : ''}
          <div class="cabinet-section" style="margin-top:1.5rem">
            <div class="cabinet-section-hd"><h4 class="cabinet-section-title">通知与消息</h4></div>
            <div id="cabinet-notif-list" class="cabinet-notif-list"><p class="cabinet-loading">加载中…</p></div>
          </div>
        </div>`;
      loadPersonalNotifications();

    } else {
      container.innerHTML = `
        <div class="cabinet-recruit">
          <div class="cabinet-recruit-nav-hint">
            <strong>【定向导览】</strong> 本版块为 CNPAF "青年内阁 (Youth Cabinet)" 专属的招募审核与履职追踪通道。如果您是以获取基础心理援助或常规资讯为目的的普通会员，请忽略此页面及后续通知。
          </div>

          <div class="cabinet-recruit-header">
            <span class="cabinet-tag-pill cabinet-tag-pill--outline">✦ Youth Cabinet</span>
            <h3 class="cabinet-recruit-title">知识领导力与卓越实践邀请函</h3>
          </div>

          <div class="cabinet-recruit-body">
            <p>华人心理援助基金会（CNPAF）青年内阁，是一支由全球新兴学者、青年实践者与社区倡导者组成的精英智库群体。我们致力于在系统层面推动跨文化的心理健康共建与学术实践。成为内阁成员，意味着您将深度嵌入一个横跨临床心理学、公共政策、社会学研究与跨文化传播的跨学科网络，承担实质性职能：共同设计倡导框架、参与内部同行评审，并在全球论坛上代表基金会发声。</p>
            <p>为结构化赋能青年领袖的长期成长，基金会参照国际顶尖青年荣誉体系（如美国国会奖），为内阁成员设立了严谨的里程碑实践追踪机制 (Excellence Tracker)。您的年度履职将围绕以下四大核心维度展开：</p>
            <ul class="cabinet-recruit-dims">
              <li><strong>志愿与公共服务 (Voluntary Public Service)</strong> — 参与基金会社区倡导、跨文化交流项目及心理健康公平议题的落地支持。</li>
              <li><strong>个人专业与智力发展 (Personal Development)</strong> — 参与内部政策圆桌、跨学科工作组、专属研究文库访问及独立课题调研。</li>
              <li><strong>身心韧性建设 (Physical Fitness)</strong> — 倡导并践行关注人类整体生态与生命周期的身心健康探索。</li>
              <li><strong>跨地域探索与田野考察 (Expedition/Exploration)</strong> — 开展在地社会调查、沉浸式文化研究或针对特定社群的实地考察。</li>
            </ul>

            <div class="cabinet-recruit-section">
              <h4>履职与里程碑解锁机制</h4>
              <p>您的每一项实践在后台提交《实践报告》并经秘书处核准后，均会转化为您的学术与社会服务时长。随着个人进度条的推进，您将依次解锁 <strong>Bronze（铜阶）</strong>、<strong>Silver（银阶）</strong> 及 <strong>Gold（金阶）</strong> 里程碑认证，并逐级获取对应的官方证书、董事会联合署名机会及年度峰会发言席位等核心智力资源。</p>
            </div>

            <div class="cabinet-recruit-section">
              <h4>申请资质与准入限度</h4>
              <ul class="cabinet-recruit-rules">
                <li><strong>年龄界限：</strong>申请人需在 14 至 24 周岁之间（以提交申请日为准）。所有履职里程碑需在 24 岁生日前完成。</li>
                <li><strong>严格审查：</strong>请在下方详述您的学术/职业背景、申请动机与长远愿景。通过背景初审后，您将受邀参与最终的入阁考核面试。</li>
                <li><strong>年度审核：</strong>内阁成员身份按年度评估，系统将根据您的里程碑活跃度与报告提交情况进行年度身份续签或软锁定。</li>
              </ul>
              <p>我们看重宽广的知识视野、跨界协作的精神气质。如果您渴望与志同道合的伙伴在这一高度上共同前行，诚邀您提交申请。</p>
            </div>
          </div>

          <div class="cabinet-apply-cta">
            <a href="cabinet-apply.html" class="btn btn-primary btn-cabinet-apply">立即申请 →</a>
            <p class="cabinet-apply-cta-hint">申请仅需 5 分钟，提交后将由秘书处进行资质审核。</p>
          </div>
        </div>`;
    }
  }

  // ─── Cabinet: notifications ───────────────────────────────────────────────────

  function updateNotifBadge(count) {
    const badge = document.getElementById('cabinet-notif-badge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  async function refreshNotifBadge() {
    const res = await apiFetch('/notifications');
    if (!res.ok) return;
    const list = res.data.notifications || [];
    updateNotifBadge(list.filter(n => !n.read_at).length);
  }

  const NOTIF_FOOTER = `<div class="cabinet-notif-footer">如对本消息有任何疑问，请联系秘书处：<a href="mailto:ycsec@cnpaf.org">ycsec@cnpaf.org</a></div>`;

  async function loadOverviewInbox() {
    const wrap = document.getElementById('overview-inbox');
    const list = document.getElementById('overview-inbox-list');
    if (!wrap || !list) return;
    const res = await apiFetch('/notifications');
    if (!res.ok) return;
    const notifs = res.data.notifications || [];
    if (!notifs.length) return;
    wrap.style.display = '';
    const unread = notifs.filter(n => !n.read_at).length;
    const badge = document.getElementById('inbox-unread-badge');
    if (badge) {
      if (unread > 0) { badge.textContent = unread; badge.style.display = ''; }
      else badge.style.display = 'none';
    }
    list.innerHTML = notifs.slice(0, 8).map(n => {
      const tag = n.target_tag === 'Youth Cabinet' ? '青年内阁' : (n.sender_name || 'CNPAF');
      const preview = (n.body || '').replace(/\n/g, ' ');
      const date = new Date(n.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
      const read = !!n.read_at;
      return `<div class="inbox-row${read ? ' inbox-row--read' : ''}" data-notif-id="${n.id}">
        <span class="inbox-unread-dot"></span>
        <span class="inbox-env-icon">${read ? '📭' : '📩'}</span>
        <div class="inbox-body">
          <span class="inbox-tag">【${escapeHtml(tag)}】</span><span class="inbox-subject">${escapeHtml(n.title)}</span><span class="inbox-sep"> — </span><span class="inbox-preview">${escapeHtml(preview)}</span>
        </div>
        <span class="inbox-date">${date}</span>
      </div>`;
    }).join('');
    list.querySelectorAll('.inbox-row').forEach(row => {
      row.addEventListener('click', () => {
        row.classList.add('inbox-row--read');
        const env = row.querySelector('.inbox-env-icon');
        if (env) env.textContent = '📭';
        const rem = list.querySelectorAll('.inbox-row:not(.inbox-row--read)').length;
        if (badge) { badge.textContent = rem; badge.style.display = rem > 0 ? '' : 'none'; }
        switchTab('tab-cabinet');
      });
    });
  }

  async function loadCabinetNotifications() {
    const el = document.getElementById('cabinet-notif-list');
    if (!el) return;
    const res = await apiFetch('/notifications');
    if (!res.ok) { el.innerHTML = '<p class="cabinet-loading">暂无通知。</p>'; return; }
    const list = res.data.notifications || [];
    if (!list.length) { el.innerHTML = '<p class="cabinet-empty">暂无通知。</p>'; return; }

    el.innerHTML = list.map(n => `
      <div class="cabinet-notif ${n.read_at ? '' : 'cabinet-notif--unread'}" data-id="${n.id}">
        <div class="cabinet-notif-meta">${new Date(n.created_at).toLocaleDateString('zh-CN', { month:'short', day:'numeric' })} · ${escapeHtml(n.sender_name || 'CNPAF')}</div>
        <div class="cabinet-notif-title">${escapeHtml(n.title)}</div>
        <div class="cabinet-notif-body">${escapeHtml(n.body)}</div>
        ${NOTIF_FOOTER}
        ${!n.read_at
          ? `<button class="btn-mark-read" data-id="${n.id}">✓ 确认已读</button>`
          : `<div class="cabinet-notif-read-stamp">已读</div>`}
      </div>`).join('');

    const unreadCount = list.filter(n => !n.read_at).length;
    updateNotifBadge(unreadCount);

    el.querySelectorAll('.btn-mark-read').forEach(btn => {
      btn.addEventListener('click', async () => {
        const r = await apiFetch(`/notifications/${btn.dataset.id}/read`, { method: 'POST' });
        if (r.ok) {
          const card = btn.closest('.cabinet-notif');
          card.classList.remove('cabinet-notif--unread');
          const stamp = document.createElement('div');
          stamp.className = 'cabinet-notif-read-stamp';
          stamp.textContent = '已读';
          btn.replaceWith(stamp);
          const cur = parseInt(document.getElementById('cabinet-notif-badge')?.textContent) || 0;
          updateNotifBadge(Math.max(0, cur - 1));
        }
      });
    });
  }

  async function loadCabinetNotificationsAsInbox() {
    const el = document.getElementById('cabinet-notif-list');
    if (!el) return;
    const res = await apiFetch('/notifications');
    if (!res.ok) { el.innerHTML = '<p class="cabinet-empty" style="padding:10px 16px;">暂无通知。</p>'; return; }
    const list = res.data.notifications || [];
    if (!list.length) { el.innerHTML = '<p class="cabinet-empty" style="padding:10px 16px;">暂无通知。</p>'; return; }

    const unread = list.filter(n => !n.read_at).length;
    const apprBadge = document.getElementById('cabinet-approved-notif-badge');
    if (apprBadge) {
      if (unread > 0) { apprBadge.textContent = unread; apprBadge.style.display = ''; }
      else apprBadge.style.display = 'none';
    }
    updateNotifBadge(unread);

    el.innerHTML = list.map(n => {
      const tag = n.target_tag === 'Youth Cabinet' ? '青年内阁' : (n.sender_name || 'CNPAF');
      const preview = (n.body || '').replace(/\n/g, ' ');
      const date = new Date(n.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
      const read = !!n.read_at;
      return `<div class="inbox-row${read ? ' inbox-row--read' : ''}" data-notif-id="${n.id}">
        <span class="inbox-unread-dot"></span>
        <span class="inbox-env-icon">${read ? '📭' : '📩'}</span>
        <div class="inbox-body">
          <span class="inbox-tag">【${escapeHtml(tag)}】</span><span class="inbox-subject">${escapeHtml(n.title)}</span><span class="inbox-sep"> — </span><span class="inbox-preview">${escapeHtml(preview)}</span>
        </div>
        <span class="inbox-date">${date}</span>
      </div>
      <div class="inbox-expand-area" id="inbox-expand-${n.id}" style="display:none;">
        <div style="white-space:pre-wrap;font-size:0.8125rem;line-height:1.65;color:var(--text);margin-bottom:0.625rem;">${escapeHtml(n.body)}</div>
        ${NOTIF_FOOTER}
        ${!read ? `<button class="btn-mark-read" data-id="${n.id}">✓ 确认已读</button>` : `<div class="cabinet-notif-read-stamp">已读</div>`}
      </div>`;
    }).join('');

    el.querySelectorAll('.inbox-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.dataset.notifId;
        const area = document.getElementById('inbox-expand-' + id);
        if (area) area.style.display = area.style.display === 'none' ? 'block' : 'none';
      });
    });

    el.querySelectorAll('.btn-mark-read').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const r = await apiFetch(`/notifications/${btn.dataset.id}/read`, { method: 'POST' });
        if (r.ok) {
          const id = btn.dataset.id;
          const row = el.querySelector(`[data-notif-id="${id}"]`);
          if (row) {
            row.classList.add('inbox-row--read');
            const env = row.querySelector('.inbox-env-icon');
            if (env) env.textContent = '📭';
          }
          const stamp = document.createElement('div');
          stamp.className = 'cabinet-notif-read-stamp';
          stamp.textContent = '已读';
          btn.replaceWith(stamp);
          const navBadge = parseInt(document.getElementById('cabinet-notif-badge')?.textContent) || 0;
          updateNotifBadge(Math.max(0, navBadge - 1));
          if (apprBadge) {
            const c = Math.max(0, (parseInt(apprBadge.textContent) || 0) - 1);
            apprBadge.textContent = c;
            apprBadge.style.display = c > 0 ? '' : 'none';
          }
        }
      });
    });
  }

  let _activeCheckout = null;

  async function showStripePayModal(memberId) {
    // Destroy previous Stripe checkout instance before creating a new one
    if (_activeCheckout) {
      try { _activeCheckout.destroy(); } catch (e) {}
      _activeCheckout = null;
    }
    document.getElementById('stripe-pay-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'stripe-pay-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:flex-start;justify-content:center;z-index:900;padding:1.5rem 1rem;overflow-y:auto;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:1.5rem;max-width:520px;width:100%;position:relative;box-shadow:0 8px 32px rgba(0,0,0,.2);margin:auto;">
        <button id="stripe-modal-close" style="position:absolute;top:.875rem;right:1rem;background:none;border:none;font-size:1.375rem;cursor:pointer;color:#888;line-height:1;">&times;</button>
        <h3 style="margin:0 0 .25rem;font-size:1rem;font-weight:700;color:#1a2535;">激活年度席位</h3>
        <p style="color:#6b7280;font-size:.8125rem;margin:0 0 1.25rem;line-height:1.5;">完成 $365/年 席位捐赠，即刻激活您的青年内阁成员身份。付款成功后系统自动激活，无需等待。</p>
        <div id="stripe-checkout-container" style="min-height:120px;display:flex;align-items:center;justify-content:center;">
          <p style="color:#6b7280;font-size:.875rem;">加载支付表单中…</p>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const closeModal = () => {
      if (_activeCheckout) { try { _activeCheckout.destroy(); } catch (e) {} _activeCheckout = null; }
      overlay.remove();
    };
    overlay.querySelector('#stripe-modal-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    const res = await apiFetch('/create-checkout-session', { method: 'POST' });
    if (!res.ok) {
      document.getElementById('stripe-checkout-container').innerHTML =
        '<p style="color:#dc2626;font-size:.875rem;text-align:center;">无法加载支付表单，请稍后重试。</p>';
      return;
    }

    const stripeObj = Stripe('pk_live_51TjDbt3THnN0b2ABSXEO0y6PhG9kBUAogvWTQuWYPhc6GQS3DBlpXwbIaEVy2s5Y3ym9yObgOuvFfNrBCF6tYxsY00Y7hKBrcU');
    const checkout = await stripeObj.initEmbeddedCheckout({ clientSecret: res.data.clientSecret });
    _activeCheckout = checkout;
    const container = document.getElementById('stripe-checkout-container');
    if (container) {
      container.innerHTML = '';
      container.style.cssText = 'min-height:auto;display:block;';
      checkout.mount('#stripe-checkout-container');
    }
  }

  function showDisclaimerModal(memberId) {
    let modal = document.getElementById('cabinet-disclaimer-overlay');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'cabinet-disclaimer-overlay';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:900;padding:1rem;';
      modal.innerHTML = `
        <div style="background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,.18);overflow:hidden;">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:1rem 1.375rem;border-bottom:1px solid #e5e7eb;flex-shrink:0;">
            <h3 style="margin:0;font-size:0.9375rem;font-weight:700;color:#1a2535;">青年内阁席位确认书</h3>
            <button id="disclaimer-modal-close" style="background:none;border:none;font-size:1.375rem;cursor:pointer;color:#888;line-height:1;">&times;</button>
          </div>
          <div style="overflow-y:auto;padding:1.25rem 1.375rem;flex:1;font-size:0.8125rem;color:#374151;line-height:1.7;">
            <p style="margin:0 0 0.875rem;color:#6b7280;font-style:italic;">在正式激活席位之前，请仔细阅读以下条款：</p>
            <h4 style="font-size:0.8125rem;font-weight:700;color:#1a2535;margin:0 0 0.375rem;">一、年度席位捐赠 · 每日一美元契约</h4>
            <p style="margin:0 0 1rem;">青年内阁拒绝商业化模式。每位获准成员须履行 <strong>$365/年</strong>的定向捐赠，象征"每日一美元"的长期承诺与对社区治理愿景的深度认同。这笔非营利性质的捐赠专用于支撑国际智囊团全年督导、全球 Branch 网络运营及荣誉认证体系统筹。在此，您不仅是卓越资源的享有者，更是这一全球精英平台的联合建设方。年度 $365 捐赠为非营利性质的定向共建捐赠，不构成任何商业交易或服务购买，一经提交除特殊情况外不可退款。</p>
            <h4 style="font-size:0.8125rem;font-weight:700;color:#1a2535;margin:0 0 0.375rem;">二、费用边界</h4>
            <p style="margin:0 0 1rem;">席位捐赠覆盖总部及全球分支的行政统筹、战略咨询、项目指导与荣誉认证对接等智力资源支持，不涵盖任何第三方实操性支出。赴美参会（联合国青年会议、华盛顿颁奖典礼等）及国际营地产生的机票、住宿、签证、场地等第三方可选费用，由成员家庭视自身情况自主承担。</p>
            <h4 style="font-size:0.8125rem;font-weight:700;color:#1a2535;margin:0 0 0.375rem;">三、成员行为准则</h4>
            <p style="margin:0 0 1rem;">本人承诺以负责任、专业且符合 CNPAF 价值观的方式参与内阁事务，维护组织声誉，遵守基金会相关规章制度与行为守则。</p>
            <h4 style="font-size:0.8125rem;font-weight:700;color:#1a2535;margin:0 0 0.375rem;">四、信息使用授权</h4>
            <p style="margin:0;">本人授权 CNPAF 将基本信息（姓名、联系方式）用于内阁运营通知、项目协作及荣誉认证等目的，不用于任何商业营销。</p>
          </div>
          <div style="padding:1rem 1.375rem;border-top:1px solid #e5e7eb;flex-shrink:0;display:flex;flex-direction:column;gap:0.75rem;background:#f9fafb;">
            <label style="display:flex;align-items:flex-start;gap:0.625rem;cursor:pointer;font-size:0.8125rem;color:#374151;line-height:1.55;">
              <input type="checkbox" id="disclaimer-agree-check" style="margin-top:3px;flex-shrink:0;width:15px;height:15px;cursor:pointer;" />
              <span>我已完整阅读以上条款，确认理解席位捐赠的非营利性质与费用边界，并同意以上全部内容。</span>
            </label>
            <button id="disclaimer-confirm-btn" disabled style="width:100%;padding:0.65rem;background:#d1d5db;color:#fff;border:none;border-radius:6px;font-size:0.875rem;font-weight:700;cursor:not-allowed;transition:background .15s;">确认加入</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
      modal.querySelector('#disclaimer-modal-close').addEventListener('click', () => modal.style.display = 'none');
      modal.querySelector('#disclaimer-agree-check').addEventListener('change', function() {
        const btn = modal.querySelector('#disclaimer-confirm-btn');
        btn.disabled = !this.checked;
        btn.style.background = this.checked ? '#0f3e78' : '#d1d5db';
        btn.style.cursor = this.checked ? 'pointer' : 'not-allowed';
      });
      modal.querySelector('#disclaimer-confirm-btn').addEventListener('click', () => {
        if (modal.querySelector('#disclaimer-agree-check').checked) {
          modal.style.display = 'none';
          showStripePayModal(parseInt(modal.dataset.memberId));
        }
      });
    }
    modal.dataset.memberId = memberId;
    const check = modal.querySelector('#disclaimer-agree-check');
    const btn = modal.querySelector('#disclaimer-confirm-btn');
    if (check) check.checked = false;
    if (btn) { btn.disabled = true; btn.style.background = '#d1d5db'; btn.style.cursor = 'not-allowed'; }
    modal.style.display = 'flex';
  }

  async function loadPersonalNotifications() {
    const el = document.getElementById('cabinet-notif-list');
    if (!el) return;
    const res = await apiFetch('/notifications');
    if (!res.ok) { el.innerHTML = '<p class="cabinet-empty">暂无通知。</p>'; return; }
    const list = (res.data.notifications || []).filter(n => n.target_type === 'user');
    if (!list.length) { el.innerHTML = '<p class="cabinet-empty">暂无消息。</p>'; return; }
    el.innerHTML = list.map(n => `
      <div class="cabinet-notif ${n.read_at ? '' : 'cabinet-notif--unread'}" data-id="${n.id}">
        <div class="cabinet-notif-meta">${new Date(n.created_at).toLocaleDateString('zh-CN', { month:'short', day:'numeric' })} · ${escapeHtml(n.sender_name || 'CNPAF')}</div>
        <div class="cabinet-notif-title">${escapeHtml(n.title)}</div>
        <div class="cabinet-notif-body">${escapeHtml(n.body)}</div>
        ${!n.read_at ? `<button class="btn-mark-read" data-id="${n.id}">✓ 确认已读</button>` : `<div class="cabinet-notif-read-stamp">已读</div>`}
      </div>`).join('');
    el.querySelectorAll('.btn-mark-read').forEach(btn => {
      btn.addEventListener('click', async () => {
        const r = await apiFetch(`/notifications/${btn.dataset.id}/read`, { method: 'POST' });
        if (r.ok) {
          const card = btn.closest('.cabinet-notif');
          card.classList.remove('cabinet-notif--unread');
          const stamp = document.createElement('div');
          stamp.className = 'cabinet-notif-read-stamp';
          stamp.textContent = '已读';
          btn.replaceWith(stamp);
        }
      });
    });
  }

  // ─── Cabinet: activity tracker ────────────────────────────────────────────────

  const DIM_LABELS = {
    voluntary_public_service: { zh: '志愿公共服务', en: 'Voluntary Public Service' },
    personal_development:     { zh: '个人发展',     en: 'Personal Development' },
    physical_fitness:         { zh: '身体素质',     en: 'Physical Fitness' },
    expedition:               { zh: '探索与考察',   en: 'Expedition / Exploration' },
  };

  async function loadSubmissionHistory() {
    const wrap = document.getElementById('cabinet-submissions-wrap');
    if (!wrap) return;
    const res = await apiFetch('/activities/mine');
    if (!res.ok) { wrap.innerHTML = '<p class="cabinet-empty">无法加载记录。</p>'; return; }
    const subs = res.data.submissions || [];
    if (!subs.length) { wrap.innerHTML = '<p class="cabinet-empty">暂无提交记录。</p>'; return; }

    const STATUS_LABEL = { pending: '审核中', approved: '已通过', rejected: '已驳回' };
    const STATUS_CLASS = { pending: 'sub-status--pending', approved: 'sub-status--approved', rejected: 'sub-status--rejected' };

    wrap.innerHTML = `
      <table class="sub-history-table">
        <thead><tr>
          <th>提交时间</th><th>维度</th><th>时长</th><th>活动名称</th><th>状态</th><th>审批意见</th>
        </tr></thead>
        <tbody>
          ${subs.map(s => {
            const dim = DIM_LABELS[s.dimension]?.zh || s.dimension;
            const val = s.unit === 'days' ? `${s.value} 天` : `${s.value} h`;
            const date = new Date(s.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
            const st = s.status || 'pending';
            return `<tr>
              <td class="sub-date">${date}</td>
              <td>${escapeHtml(dim)}</td>
              <td>${val}</td>
              <td>${escapeHtml(s.title || '—')}</td>
              <td><span class="sub-status ${STATUS_CLASS[st]}">${STATUS_LABEL[st] || st}</span></td>
              <td class="sub-note">${escapeHtml(s.reviewer_note || '—')}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  async function loadCabinetTracker() {
    const wrap = document.getElementById('cabinet-tracker-wrap');
    if (!wrap) return;
    const res = await apiFetch('/activities/mine');
    if (!res.ok) { wrap.innerHTML = '<p class="cabinet-empty">无法加载进度。</p>'; return; }
    const { progress, milestones } = res.data;
    wrap.innerHTML = Object.keys(DIM_LABELS).map(dim =>
      dim === 'expedition'
        ? renderExpedTracker(dim, progress[dim] || null, milestones[dim])
        : renderHoursTracker(dim, progress[dim] || null, milestones[dim])
    ).join('');
  }

  const LEVEL_COLORS = { bronze: '#b07830', silver: '#7a8a96', gold: '#a88a0a' };
  const LEVEL_ICONS  = { bronze: { cert: '◇', medal: '◆' }, silver: { cert: '◇', medal: '◆' }, gold: { cert: '☆', medal: '★' } };

  function renderHoursTracker(dim, data, cfg) {
    const val = data ? parseFloat(data.value) : 0;
    const maxVal = cfg.medal.gold;
    const fillPct = Math.min(100, (val / maxVal) * 100);
    const achieved = data?.achieved || { certificate: null, medal: null };
    const pct = v => ((v / maxVal) * 100).toFixed(2);
    const order = ['bronze','silver','gold'];
    const levelAchieved = (achObj, level) => achObj && order.indexOf(achObj) >= order.indexOf(level);

    const markers = [
      { p: pct(cfg.certificate.bronze), tier:'cert',  level:'bronze', label:'C·铜' },
      { p: pct(cfg.certificate.silver), tier:'cert',  level:'silver', label:'C·银' },
      { p: pct(cfg.certificate.gold),   tier:'cert',  level:'gold',   label:'C·金' },
      { p: pct(cfg.medal.bronze),       tier:'medal', level:'bronze', label:'M·铜' },
      { p: pct(cfg.medal.silver),       tier:'medal', level:'silver', label:'M·银' },
      { p: '100.00',                    tier:'medal', level:'gold',   label:'M·金' },
    ];

    const msHtml = markers.map(m => {
      const achObj = m.tier === 'cert' ? achieved.certificate : achieved.medal;
      const done = levelAchieved(achObj, m.level);
      const color = done ? LEVEL_COLORS[m.level] : (m.tier === 'cert' ? '#c8cdd4' : '#9aa2aa');
      const icon = done ? LEVEL_ICONS[m.level].medal : LEVEL_ICONS[m.level][m.tier];
      const floatRight = parseFloat(m.p) > 94;
      return `
        <div class="tracker-ms ${done ? 'tracker-ms--done' : ''} tracker-ms--${m.level}"
             style="left:${m.p}%;${floatRight ? 'transform:translateX(-100%)' : ''}">
          <div class="tracker-ms-icon" style="color:${color};font-size:${m.level==='gold'?'1rem':'0.85rem'}">${icon}</div>
          <div class="tracker-ms-lbl" style="color:${done ? color : 'var(--text-muted)'};">${m.label}</div>
        </div>`;
    }).join('');

    const badgeHtml = (achieved.certificate || achieved.medal) ? `
      <div class="tracker-badges-row">
        ${achieved.certificate ? `<span class="tracker-badge tracker-badge--${achieved.certificate}">Certificate ${achieved.certificate} ✓</span>` : ''}
        ${achieved.medal       ? `<span class="tracker-badge tracker-badge--medal tracker-badge--${achieved.medal}">Medal ${achieved.medal} ✓</span>` : ''}
      </div>` : '';

    return `
      <div class="tracker-dim">
        <div class="tracker-dim-hd">
          <span class="tracker-dim-label">${DIM_LABELS[dim].zh}</span>
          <span class="tracker-dim-value">${val} h</span>
        </div>
        <div class="tracker-bar-wrap">
          <div class="tracker-milestones">${msHtml}</div>
          <div class="tracker-bar">
            <div class="tracker-bar-fill" style="width:${fillPct.toFixed(2)}%"></div>
            <div class="tracker-thumb" style="left:${fillPct.toFixed(2)}%;${fillPct <= 0 ? 'display:none' : ''}"></div>
          </div>
        </div>
        ${badgeHtml}
      </div>`;
  }

  function renderExpedTracker(dim, data, cfg) {
    const val = data ? parseFloat(data.value) : 0;
    const LEVELS = ['bronze','silver','gold'];
    const certSteps = [
      { v: cfg.certificate.bronze, label: `铜 (${cfg.certificate.bronze}天)`,  level: 'bronze' },
      { v: cfg.certificate.silver, label: `银 (${cfg.certificate.silver}天)`,  level: 'silver' },
      { v: cfg.certificate.gold,   label: `金 (${cfg.certificate.gold}天)`,    level: 'gold' },
    ];
    const medalSteps = [
      { v: cfg.medal.bronze, label: `铜 (${cfg.medal.bronze}次)`,  level: 'bronze' },
      { v: cfg.medal.silver, label: `银 (${cfg.medal.silver}次)`,  level: 'silver' },
      { v: cfg.medal.gold,   label: `金 (${cfg.medal.gold}次)`,    level: 'gold' },
    ];
    const stepRow = (steps, tier) => `
      <div class="exped-row">
        <span class="exped-row-label exped-row-label--${tier}">${tier === 'cert' ? 'Certificate' : 'Medal'}</span>
        <div class="exped-steps">
          ${steps.map((s, i) => {
            const done = val >= s.v;
            const color = done ? LEVEL_COLORS[s.level] : undefined;
            const icon = done ? LEVEL_ICONS[s.level].medal : LEVEL_ICONS[s.level][tier];
            return `
              ${i > 0 ? '<div class="exped-line"></div>' : ''}
              <div class="exped-step ${done ? 'exped-step--done' : ''} exped-step--${tier}">
                <div class="exped-node" style="${color ? `background:${color};border-color:${color}` : ''}">${icon}</div>
                <div class="exped-lbl" style="${color ? `color:${color}` : ''}">${s.label}</div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
    return `
      <div class="tracker-dim">
        <div class="tracker-dim-hd">
          <span class="tracker-dim-label">${DIM_LABELS[dim].zh}</span>
          <span class="tracker-dim-value">${val} 天</span>
        </div>
        <div class="exped-wrap">
          ${stepRow(certSteps, 'cert')}
          ${stepRow(medalSteps, 'medal')}
        </div>
      </div>`;
  }

  // ─── Cabinet: submit activity modal ──────────────────────────────────────────

  function initActivitySubmitModal() {
    const modal = document.getElementById('activity-submit-modal');
    if (!modal) return;
    modal.querySelector('.modal-close-btn')?.addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
    modal.querySelector('#activity-submit-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const btn = form.querySelector('button[type=submit]');
      const dim = form.querySelector('#activity-dim').value;
      const val = form.querySelector('#activity-value').value;
      const title = form.querySelector('#activity-title').value.trim();
      const report = form.querySelector('#activity-report').value.trim();
      if (!dim || !val || !title) return;
      btn.disabled = true;
      btn.textContent = '提交中…';
      const res = await apiFetch('/activities', { method: 'POST', body: JSON.stringify({ dimension: dim, value: parseFloat(val), title, report }) });
      if (res.ok) {
        modal.style.display = 'none';
        form.reset();
        loadCabinetTracker();
        alert('提交成功，等待管理员审核后将计入进度。');
      } else {
        alert(res.data?.message || '提交失败，请重试。');
      }
      btn.disabled = false;
      btn.textContent = '提交';
    });
  }

  async function handleCabinetApply(e) {
    e.preventDefault();
    const form = e.target;
    const background = form.background.value.trim();
    const motivation = form.motivation.value.trim();
    const vision     = form.vision.value.trim();
    const dob        = form.dob.value.trim();
    const gender     = form.gender.value;
    const race       = form.race.value;
    const guardianEmail = form.guardianEmail?.value.trim() || '';

    if (!background || !motivation || !vision) {
      alert(t("cabinetErrorFields"));
      return;
    }
    if (!dob) { alert('请填写出生日期。'); return; }
    // Age validation: must be 13.5–24
    const ageYears = (Date.now() - new Date(dob)) / (365.25 * 24 * 3600 * 1000);
    if (ageYears < 13.5 || ageYears >= 24) {
      alert('申请人需年满 13.5 周岁且未满 24 周岁。');
      return;
    }
    if (ageYears < 18 && !guardianEmail) {
      alert('未满 18 周岁的申请人须填写家长/监护人邮箱。');
      return;
    }
    if (!gender) { alert('请选择性别。'); return; }
    if (!race)   { alert('请选择种族/民族。'); return; }

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = t("cabinetSubmitting");

    const combinedMotivation = motivation + (vision ? `\n\n[Research Focus]\n${vision}` : '');
    const demographics = { dob, gender, race, ...(guardianEmail ? { guardianEmail } : {}) };
    const res = await apiFetch("/youth-cabinet/apply", {
      method: "POST",
      body: JSON.stringify({ experience: background, motivation: combinedMotivation, demographics }),
    });

    if (res.ok) {
      window._cpaf_currentMember.youth_cabinet_status = "pending";
      renderYouthCabinet(window._cpaf_currentMember);
    } else {
      btn.disabled = false;
      btn.textContent = '提交申请';
      alert(res.data?.message || "提交失败，请重试。");
    }
  }

  // ─── Event wiring ─────────────────────────────────────────────────────────────

  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.addEventListener("click", () => { const l = btn.getAttribute("data-lang"); if (l) applyLanguage(l); });
  });

  document.querySelectorAll("[data-go]").forEach(el => {
    el.addEventListener("click", e => { e.preventDefault(); const t = el.getAttribute("data-go"); if (t) showScreen(t); });
  });

  document.querySelectorAll(".logo-link").forEach(el => {
    el.addEventListener("click", () => {
      if (window._cpaf_currentMember) { showScreen("dashboard"); switchTab("tab-overview"); }
      else showScreen("landing");
    });
  });

  document.getElementById("logout-btn")?.addEventListener("click", () => {
    window._cpaf_currentMember = null;
    clearToken();
    showScreen("landing");
  });

  document.querySelectorAll(".dash-menu li").forEach(li => {
    li.addEventListener("click", () => { const id = li.getAttribute("data-tab"); if (id) switchTab(id); });
  });

  document.getElementById("edit-profile-btn-card")?.addEventListener("click", () => switchTab("tab-profile"));

  // Avatar modal
  const avatarModal         = document.getElementById("avatar-modal");
  const avatarTrigger       = document.getElementById("card-photo-trigger");
  const currentPhotoPreview = document.getElementById("modal-current-photo");
  const photoUploadInput    = document.getElementById("modal-photo-upload");

  avatarTrigger?.addEventListener("click", () => {
    const m = window._cpaf_currentMember;
    if (!m) return;
    if (m.photo) {
      currentPhotoPreview.innerHTML = `<img src="${m.photo}" alt="Current Avatar" />`;
    } else {
      const initials = (() => {
        const zh = (m.nameZh || '').trim();
        if (zh.length >= 2) return zh.slice(0, 2);
        const parts = (m.name || '').trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return (parts[0] || '?')[0].toUpperCase();
      })();
      currentPhotoPreview.innerHTML = `<div class="photo-initials">${initials}</div>`;
    }
    photoUploadInput.value = "";
    avatarModal.classList.add("active");
  });

  document.getElementById("close-avatar-modal")?.addEventListener("click", () => avatarModal.classList.remove("active"));

  document.getElementById("save-avatar-btn")?.addEventListener("click", async () => {
    const m = window._cpaf_currentMember;
    if (!m) return;
    if (photoUploadInput.files?.[0]) {
      const photo = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = ev => resolve(ev.target.result);
        reader.readAsDataURL(photoUploadInput.files[0]);
      });
      const res = await apiFetch("/me/avatar", { method: "PUT", body: JSON.stringify({ avatar_url: photo }) });
      if (res.ok) {
        m.photo = photo;
        fillCardAndProfile(m);
      } else {
        alert("Failed to update avatar. Please try again.");
      }
    }
    avatarModal.classList.remove("active");
  });

  // ─── Sign up ──────────────────────────────────────────────────────────────────

  document.getElementById("signup-form")?.addEventListener("submit", async function (e) {
    e.preventDefault();
    const form = e.target;
    const name    = form.name.value.trim();
    const email   = form.email.value.trim();
    const phone   = form.phone.value.trim();
    const phoneCode = form.phoneCode.value || "+1";
    const gender  = form.gender.value;
    const region  = form.region.value;
    const password = form.password.value;
    const confirmPassword = form.confirmPassword.value;

    if (!name || !email || !phone || !region || !gender || !password) { alert(t("errorRequiredFields")); return; }
    if (password !== confirmPassword) { alert(t("errorPasswordMismatch")); return; }
    const pwdRe = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!pwdRe.test(password)) { alert(t("passwordRequirements")); return; }

    const mbtiParts = ["signup-mbti-1","signup-mbti-2","signup-mbti-3","signup-mbti-4"]
      .map(id => document.getElementById(id)?.value || "-");
    let mbti = mbtiParts.join("");
    if (mbti === "----") mbti = "";

    let photo = null;
    const photoInput = document.getElementById("photo-upload");
    if (photoInput?.files?.[0]) {
      photo = await new Promise(resolve => {
        const r = new FileReader();
        r.onload = ev => resolve(ev.target.result);
        r.readAsDataURL(photoInput.files[0]);
      });
    }

    const payload = {
      name, nameZh: form.nameZh?.value || "", gender, email, phoneCode, phone, region,
      addressStreet: form.addressStreet?.value || "",
      addressCity:   form.addressCity?.value || "",
      addressState:  form.addressState?.value || "",
      addressZip:    form.addressZip?.value || "",
      bio: form.bio?.value || "", mbti,
      zodiac: form.zodiac?.value || "",
      dob: form.dob?.value || "",
      photo, password,
    };

    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Registering…";

    const res = await apiFetch("/register", { method: "POST", body: JSON.stringify(payload) });

    submitBtn.disabled = false;
    submitBtn.textContent = t("signupSubmit");

    if (res.ok && res.data.token) {
      setToken(res.data.token);
      fillCardAndProfile(res.data.user);
      showScreen("dashboard");
      switchTab("tab-overview");
      form.reset();
    } else {
      alert(res.data?.message || "Registration failed. Please try again.");
    }
  });

  // ─── Login ────────────────────────────────────────────────────────────────────

  document.getElementById("lookup-form")?.addEventListener("submit", async function (e) {
    e.preventDefault();
    const identifier = document.getElementById("membership-id-input").value.trim();
    const password   = document.getElementById("login-password").value;

    if (!identifier || !password) { alert(t("errorNotFound")); return; }

    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in…";

    const res = await apiFetch("/login", { method: "POST", body: JSON.stringify({ identifier, password }) });

    submitBtn.disabled = false;
    submitBtn.textContent = t("loginSubmit");

    if (res.ok && res.data.token) {
      setToken(res.data.token);
      fillCardAndProfile(res.data.user);
      showScreen("dashboard");
      switchTab("tab-overview");
      document.getElementById("membership-id-input").value = "";
      document.getElementById("login-password").value = "";
    } else {
      alert(res.data?.message || t("errorNotFound"));
    }
  });

  // ─── Profile edit ──────────────────────────────────────────────────────────────

  document.getElementById("dash-edit-form")?.addEventListener("submit", async function (e) {
    e.preventDefault();
    const m = window._cpaf_currentMember;
    if (!m) return;

    const newEmail = document.getElementById("dash-edit-email").value.trim();
    const newPhone = document.getElementById("dash-edit-phone").value.trim();
    if (!newEmail || !newPhone) { alert(t("errorNameEmailPhone")); return; }

    const mbtiParts = ["dash-edit-mbti-1","dash-edit-mbti-2","dash-edit-mbti-3","dash-edit-mbti-4"]
      .map(id => document.getElementById(id)?.value || "-");
    let newMbti = mbtiParts.join("");
    if (newMbti === "----") newMbti = "";

    const updates = {
      nameZh:        document.getElementById("dash-edit-name-zh").value.trim(),
      gender:        document.getElementById("dash-edit-gender").value,
      zodiac:        document.getElementById("dash-edit-zodiac").value,
      mbti:          newMbti,
      email:         newEmail,
      phoneCode:     document.getElementById("dash-edit-phone-code").value,
      phone:         newPhone,
      addressStreet: document.getElementById("dash-edit-address-street").value.trim(),
      addressCity:   document.getElementById("dash-edit-address-city").value.trim(),
      addressState:  document.getElementById("dash-edit-address-state").value.trim(),
      addressZip:    document.getElementById("dash-edit-address-zip").value.trim(),
      bio:           document.getElementById("dash-edit-bio").value.trim(),
    };

    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving…";

    const res = await apiFetch("/me", { method: "PATCH", body: JSON.stringify(updates) });

    submitBtn.disabled = false;
    submitBtn.textContent = t("saveBtn");

    if (res.ok) {
      Object.assign(m, updates, res.data.user || {});
      fillCardAndProfile(m);
      alert(t("successProfileUpdated"));
      switchTab("tab-card");
    } else {
      alert(res.data?.message || "Update failed. Please try again.");
    }
  });

  // ─── Password change ───────────────────────────────────────────────────────────

  document.getElementById("dash-security-form")?.addEventListener("submit", async function (e) {
    e.preventDefault();
    const oldPwd     = document.getElementById("dash-old-pwd").value;
    const newPwd     = document.getElementById("dash-new-pwd").value;
    const confirmPwd = document.getElementById("dash-confirm-pwd").value;

    if (newPwd !== confirmPwd) { alert(t("errorPasswordMismatch")); return; }
    const pwdRe = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!pwdRe.test(newPwd)) { alert(t("passwordRequirements")); return; }

    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "Changing…";

    const res = await apiFetch("/me/password", { method: "PUT", body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }) });

    submitBtn.disabled = false;
    submitBtn.textContent = t("securityChangePwd");

    if (res.ok) {
      alert(t("successPwdChanged"));
      e.target.reset();
    } else {
      alert(res.data?.message || t("errorOldPwdWrong"));
    }
  });

  // ─── Download card ─────────────────────────────────────────────────────────────

  const cardEl = document.getElementById("membership-card");
  document.getElementById("download-card")?.addEventListener("click", () => {
    if (!window.html2canvas) { window.print(); return; }
    const orig = cardEl.style.cssText;
    cardEl.style.cssText += ";box-shadow:none;margin:0;border-radius:20px";
    window.html2canvas(cardEl, {
      scale: 3, useCORS: true, backgroundColor: "#ffffff", logging: false,
      onclone: doc => { const c = doc.getElementById("membership-card"); c.style.margin = "0"; c.style.boxShadow = "none"; },
    }).then(canvas => {
      cardEl.style.cssText = orig;
      const a = document.createElement("a");
      a.download = "CNPAF-Membership-Card.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
    });
  });

  // ─── Init ──────────────────────────────────────────────────────────────────────

  applyLanguage();
  initActivitySubmitModal();

  // Auto-restore session if token exists
  (async () => {
    const token = getToken();
    if (!token) return;
    const res = await apiFetch("/me");
    if (res.ok && res.data.user) {
      fillCardAndProfile(res.data.user);
      showScreen("dashboard");
      // Support ?tab=cabinet redirect from cabinet-apply.html
      const urlParams = new URLSearchParams(location.search);
      const urlTab = urlParams.get('tab');
      switchTab(urlTab === 'cabinet' ? 'tab-cabinet' : 'tab-overview');
      if (urlTab) history.replaceState(null, '', location.pathname);

      // Handle return from Stripe Embedded Checkout
      if (urlParams.get('payment_status') === 'complete') {
        history.replaceState(null, '', location.pathname);
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `
          <div style="background:#fff;border-radius:1rem;padding:2.5rem 2rem;max-width:420px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.25);">
            <div style="font-size:3rem;margin-bottom:1rem;">🎉</div>
            <h2 style="margin:0 0 .75rem;font-size:1.25rem;color:#065f46;font-weight:700;">支付成功！</h2>
            <p style="margin:0 0 .5rem;color:#374151;font-size:.95rem;line-height:1.6;">您的内阁成员身份正在激活，系统将自动刷新页面。</p>
            <p style="margin:0 0 1.5rem;color:#6b7280;font-size:.85rem;line-height:1.6;">如页面刷新后青年内阁状态仍未更新，请查看站内消息或联系秘书处：<a href="mailto:ycsec@cnpaf.org" style="color:#1d4ed8;">ycsec@cnpaf.org</a></p>
            <button onclick="this.closest('div[style*=inset]').remove();location.reload();" style="background:#065f46;color:#fff;border:none;border-radius:.5rem;padding:.65rem 1.75rem;font-size:.95rem;font-weight:600;cursor:pointer;">好的，刷新页面</button>
          </div>`;
        document.body.appendChild(overlay);
        setTimeout(() => { overlay.remove(); location.reload(); }, 6000);
      }
    } else {
      clearToken();
    }
  })();

})();
