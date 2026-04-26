import { supabase } from './supabase-config.js';

// ** N8N WEBHOOK URL'İNİ BURAYA YAZ **
const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_ANALYZE_WEBHOOK_URL;

document.addEventListener('DOMContentLoaded', () => {

  // ----- KAMPANYA MODAL ELEMENTLERİ -----
  const campaignModal = document.getElementById('campaign-modal');
  const campaignModalContent = document.getElementById('modal-content');
  const closeCampaignModal = document.getElementById('close-modal');
  const campaignForm = document.getElementById('campaign-form');
  const loadingIndicator = document.getElementById('loading-indicator');
  const submitBtn = document.getElementById('submit-btn');
  const personaSelectionGrid = document.getElementById('persona-selection-grid');
  const selectedPersonaCount = document.getElementById('selected-persona-count');
  const personaError = document.getElementById('persona-error');
  const segmentSelectionGrid = document.getElementById('segment-selection-grid'); // Yeni

  // ----- AUTH MODAL ELEMENTLERİ -----
  const authModal = document.getElementById('auth-modal');
  const authModalContent = document.getElementById('auth-modal-content');
  const closeAuthModal = document.getElementById('close-auth-modal');
  const authForm = document.getElementById('auth-form');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const authBtnText = document.getElementById('auth-btn-text');
  const authError = document.getElementById('auth-error');
  const authSuccess = document.getElementById('auth-success');
  const authEmailInput = document.getElementById('auth_email');
  const authPasswordInput = document.getElementById('auth_password');

  // ----- HEADER NAV EKRANLARI -----
  const navUnauth = document.getElementById('nav-unauth');
  const navAuth = document.getElementById('nav-auth');
  const userDisplayEmail = document.getElementById('user-display-email');
  const btnLogout = document.getElementById('btn-logout');
  const navLoginBtn = document.getElementById('nav-login-btn');
  const navRegisterBtn = document.getElementById('nav-register-btn');

  // ----- GENEL DEĞİŞKENLER -----
  let currentUser = null;
  let isLoginMode = true;

  // ==========================================
  // AUTH (KULLANICI GİRİŞ/KAYIT) İŞLEMLERİ
  // ==========================================

  const checkUserSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    updateUIForUser(session?.user);
  };

  const updateUIForUser = (user) => {
    currentUser = user;
    if (user) {
      navUnauth.classList.add('hidden');
      navAuth.classList.remove('hidden');
      userDisplayEmail.innerText = user.email.split('@')[0];
    } else {
      navUnauth.classList.remove('hidden');
      navAuth.classList.add('hidden');
    }
  };

  supabase.auth.onAuthStateChange((event, session) => {
    updateUIForUser(session?.user);
  });

  const openAuthModal = (mode) => {
    isLoginMode = mode === 'login';
    updateAuthTabs();
    authError.classList.add('hidden');
    authSuccess.classList.add('hidden');
    authForm.reset();

    authModal.classList.remove('opacity-0', 'pointer-events-none');
    authModalContent.classList.remove('scale-95');
    authModalContent.classList.add('scale-100');
  };

  const hideAuthModal = () => {
    authModal.classList.add('opacity-0', 'pointer-events-none');
    authModalContent.classList.remove('scale-100');
    authModalContent.classList.add('scale-95');
  };

  const updateAuthTabs = () => {
    if (isLoginMode) {
      tabLogin.classList.replace('text-gray-500', 'text-neon-cyan');
      tabLogin.classList.replace('border-transparent', 'border-neon-cyan');
      tabLogin.classList.replace('hover:text-white', 'bg-white/5');
      tabRegister.classList.replace('text-neon-cyan', 'text-gray-500');
      tabRegister.classList.replace('border-neon-cyan', 'border-transparent');
      tabRegister.classList.replace('bg-white/5', 'hover:text-white');
      authBtnText.innerText = "GİRİŞ YAP";
    } else {
      tabRegister.classList.replace('text-gray-500', 'text-neon-cyan');
      tabRegister.classList.replace('border-transparent', 'border-neon-cyan');
      tabRegister.classList.replace('hover:text-white', 'bg-white/5');
      tabLogin.classList.replace('text-neon-cyan', 'text-gray-500');
      tabLogin.classList.replace('border-neon-cyan', 'border-transparent');
      tabLogin.classList.replace('bg-white/5', 'hover:text-white');
      authBtnText.innerText = "KAYIT OL";
    }
  };

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.classList.add('hidden');
    authSuccess.classList.add('hidden');
    const email = authEmailInput.value;
    const password = authPasswordInput.value;
    try {
      if (isLoginMode) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        hideAuthModal();
      } else {
        const { error, data } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data?.user?.identities?.length === 0) throw new Error("Bu email zaten kayıtlı.");
        if (data.session === null) {
          authSuccess.innerText = "Onay E-postası Gönderildi. Lütfen gelen kutunuzu kontrol edin.";
          authSuccess.classList.remove('hidden');
          authForm.reset();
        } else {
          hideAuthModal();
        }
      }
    } catch (err) {
      authError.innerText = err.message;
      authError.classList.remove('hidden');
    }
  });

  if (btnLogout) btnLogout.addEventListener('click', async () => await supabase.auth.signOut());
  if (navLoginBtn) navLoginBtn.addEventListener('click', () => openAuthModal('login'));
  if (navRegisterBtn) navRegisterBtn.addEventListener('click', () => openAuthModal('register'));
  if (closeAuthModal) closeAuthModal.addEventListener('click', hideAuthModal);
  if (tabLogin) tabLogin.addEventListener('click', () => openAuthModal('login'));
  if (tabRegister) tabRegister.addEventListener('click', () => openAuthModal('register'));

  // ==========================================
  // KAMPANYA İŞLEMLERİ
  // ==========================================

  const openCampaignModal = () => {
    if (!currentUser) {
      openAuthModal('login');
      return;
    }
    campaignModal.classList.remove('opacity-0', 'pointer-events-none');
    campaignModalContent.classList.remove('scale-95');
    campaignModalContent.classList.add('scale-100');
    fetchSegmentsForLanding();
    fetchPersonasForLanding();
  };

  const hideCampaignModal = () => {
    campaignModal.classList.add('opacity-0', 'pointer-events-none');
    campaignModalContent.classList.remove('scale-100');
    campaignModalContent.classList.add('scale-95');
    campaignForm.reset();
    personaError.classList.add('hidden');
  };

  const btnInitCoreMain = document.getElementById('btn-init-core');
  const btnStartAnalysis = document.getElementById('btn-start-analysis');
  if (btnInitCoreMain) btnInitCoreMain.addEventListener('click', openCampaignModal);
  if (btnStartAnalysis) btnStartAnalysis.addEventListener('click', openCampaignModal);
  if (closeCampaignModal) closeCampaignModal.addEventListener('click', hideCampaignModal);

  const navInitScanBtn = document.querySelector('#nav-unauth button:last-child');
  if (navInitScanBtn) navInitScanBtn.addEventListener('click', openCampaignModal);

  campaignForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loadingIndicator.classList.remove('hidden');
    submitBtn.classList.add('hidden');
    personaError.classList.add('hidden');

    const campaignData = {
      name: document.getElementById('c_name').value,
      objective: document.getElementById('c_objective').value,
      ad_slogan: document.getElementById('c_slogan').value,
      media_url: document.getElementById('c_media_url').value,
      intended_audience_desc: document.getElementById('c_audience').value,
      media_type: 'image',
      status: 'pending',
      user_id: currentUser.id,
      channel_type: activeChannelCategory || 'DISPLAY' // activeChannelCategory'yi buraya ekledik
    };

    const selectedPersonas = Array.from(document.querySelectorAll('.persona-checkbox:checked')).map(cb => cb.value);
    if (selectedPersonas.length === 0) {
      personaError.classList.remove('hidden');
      loadingIndicator.classList.add('hidden');
      submitBtn.classList.remove('hidden');
      return;
    }

    try {
      const { data, error } = await supabase.from('campaigns').insert([campaignData]).select();
      if (error) throw error;
      const insertedCampaignId = data[0].id;
      const webhookResponse = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: insertedCampaignId,
          persona_ids: selectedPersonas,
          channel_type: activeChannelCategory || 'DISPLAY',
          channel_name: channelData[activeChannelCategory]?.name || 'GÖRÜNTÜLÜ REKLAMLAR'
        })
      });

      if (!webhookResponse.ok) {
        alert("Veritabanına eklendi fakat Webhook tetiklenirken hata oluştu.");
      } else {
        window.location.href = `dashboard.html?id=${insertedCampaignId}`;
      }
      hideCampaignModal();
    } catch (err) {
      alert("Kayıt sırasında bir hata oluştu: " + err.message);
    } finally {
      loadingIndicator.classList.add('hidden');
      submitBtn.classList.remove('hidden');
    }
  });

  // ==========================================
  // SEGMENT İŞLEMLERİ (Landing - Yeni)
  // ==========================================
  const fetchSegmentsForLanding = async () => {
    if (!segmentSelectionGrid) return;
    segmentSelectionGrid.innerHTML = `<div class="text-gray-500 font-mono text-[10px] py-4 text-center w-full col-span-2 flex items-center justify-center gap-2"><span class="material-symbols-outlined animate-spin text-sm">refresh</span>...</div>`;

    try {
      const { data: segments, error } = await supabase
        .from('segments')
        .select('*, segment_personas(persona_id)')
        .eq('is_active', true);

      if (error) throw error;
      segmentSelectionGrid.innerHTML = '';

      segments.forEach(seg => {
        const personaIds = seg.segment_personas.map(sp => sp.persona_id);
        const div = document.createElement('div');
        div.className = "relative group";
        div.innerHTML = `
          <input type="checkbox" id="seg-lp-${seg.id}" value="${seg.id}" class="segment-checkbox hidden" data-personas='${JSON.stringify(personaIds)}' />
          <label for="seg-lp-${seg.id}" class="segment-checkbox-label flex flex-col p-3 border border-white/10 bg-black/20 hover:border-neon-cyan/50 cursor-pointer select-none transition-all">
             <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-sm text-neon-cyan">${seg.icon || 'groups'}</span>
                  <div class="font-cyber font-bold text-[10px] text-gray-300 uppercase truncate">${seg.name}</div>
                </div>
                <div class="check-icon-seg opacity-0 transition-opacity">
                  <span class="material-symbols-outlined text-[14px] text-neon-cyan">check_circle</span>
                </div>
             </div>
             <div class="text-[8px] text-gray-500 font-tech truncate">${seg.description}</div>
          </label>
        `;
        segmentSelectionGrid.appendChild(div);

        const checkbox = div.querySelector('input');
        checkbox.addEventListener('change', () => {
          // Visual feedback for segment selection
          const label = div.querySelector('label');
          const checkIcon = div.querySelector('.check-icon-seg');
          if (checkbox.checked) {
            label.classList.add('border-neon-cyan', 'bg-neon-cyan/10');
            checkIcon.classList.remove('opacity-0');
          } else {
            label.classList.remove('border-neon-cyan', 'bg-neon-cyan/10');
            checkIcon.classList.add('opacity-0');
          }
          
          // Auto select personas
          personaIds.forEach(pid => {
            const pbox = document.getElementById(`lp-p-${pid}`);
            if (pbox) {
              pbox.checked = checkbox.checked;
              pbox.dispatchEvent(new Event('change'));
            }
          });
        });
      });
    } catch (err) {
      console.error("Segment fetch error:", err);
    }
  };

  // ==========================================
  // PERSONA İŞLEMLERİ (Landing)
  // ==========================================

  const fetchPersonasForLanding = async () => {
    if (!personaSelectionGrid) return;
    personaSelectionGrid.innerHTML = `
      <div class="text-gray-500 font-mono text-xs py-4 text-center w-full col-span-2 flex items-center justify-center gap-2">
        <span class="material-symbols-outlined animate-spin text-sm">refresh</span> Personalar yükleniyor...
      </div>`;
    if (selectedPersonaCount) {
      selectedPersonaCount.innerText = `0/3 SEÇİLDİ`;
    }

    try {
      const { data: personas, error } = await supabase
        .from('personas')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      personaSelectionGrid.innerHTML = '';

      if (!personas || personas.length === 0) {
        personaSelectionGrid.innerHTML = '<p class="text-red-500 font-mono text-xs col-span-2">Aktif persona bulunamadı.</p>';
        return;
      }

      personas.forEach(p => {
        const div = document.createElement('div');
        div.className = "relative group";
        div.innerHTML = `
          <input type="checkbox" id="lp-p-${p.id}" value="${p.id}" class="persona-checkbox hidden" />
          <label for="lp-p-${p.id}" class="persona-checkbox-label flex items-center p-3 border border-white/10 bg-black/20 hover:border-neon-cyan/50 cursor-pointer select-none">
             <div class="flex-1 min-w-0">
                 <div class="font-cyber font-bold text-[11px] text-gray-300 uppercase mb-0.5 persona-name transition-colors truncate">${p.name}</div>
                 <div class="font-mono text-[9px] text-gray-500 uppercase truncate">${p.job_title}</div>
             </div>
             <div class="check-icon ml-2">
                 <span class="material-symbols-outlined text-[16px]">check_circle</span>
             </div>
          </label>
        `;
        personaSelectionGrid.appendChild(div);
      });

      // Limit Logic
      const checkboxes = document.querySelectorAll('.persona-checkbox');
      checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
          const checkedCount = document.querySelectorAll('.persona-checkbox:checked').length;
          if (checkedCount > 3) {
            cb.checked = false;
            alert("Hızlı Analiz modunda en fazla 3 persona seçebilirsiniz. Daha fazlası için lütfen Panel'i kullanın.");
            return;
          }
          if (selectedPersonaCount) {
            selectedPersonaCount.innerText = `${checkedCount}/3 SEÇİLDİ`;
          }
          if (checkedCount > 0) personaError.classList.add('hidden');
        });
      });

    } catch (err) {
      console.error("Error fetching personas:", err);
      personaSelectionGrid.innerHTML = '<p class="text-red-500 font-mono text-xs col-span-2">Personalar yüklenemedi.</p>';
    }
  };

  // ==========================================
  // LANDING PAGE FUNCTIONALITY (Geliştirilmiş)
  // ==========================================

  // 1. Dinamik İstatistikler (Gerçek Sistem Verisi)
  const updateStats = async () => {
    try {
      const { count: campaignCount } = await supabase.from('campaigns').select('*', { count: 'exact', head: true });
      const { count: personaCount } = await supabase.from('personas').select('*', { count: 'exact', head: true });
      
      const statNodesCount = document.getElementById('stat-nodes-count');
      if (statNodesCount) {
        // Sadece sistemdeki gerçek toplamı göster (1024 ofseti olmadan)
        const total = (campaignCount || 0) + (personaCount || 0);
        statNodesCount.innerText = total.toLocaleString();
      }
    } catch (e) { console.warn("Stats fetch failed:", e); }
  };

  const initHUDAnimation = () => {
    const hudLiveFeed = document.getElementById('hud-live-feed');
    if (!hudLiveFeed) return;
    const logs = [
      ">> NÖRAL_BAĞLANTI_KURULDU...",
      ">> KREATİF_VEKTÖRLER_TARANIYOR...",
      ">> DUYGU_OLASILIĞI: 0.84",
      ">> HEDEF_KİTLE_SENKRONİZE_EDİLDİ",
      ">> REKLAM_GERÇEKLİĞİ_ÇÖZÜLÜYOR...",
      ">> CTA_PARLAKLIĞI_OPTİMİZE_EDİLİYOR",
      ">> PERSONA_REAKSİYONU_ANALİZ_EDİLİYOR",
      ">> DÖNÜŞÜM_MATRİSİ_KİLİTLENDİ"
    ];
    let i = 0;
    setInterval(() => {
      hudLiveFeed.innerText = logs[i];
      i = (i + 1) % logs.length;
    }, 3000);
  };

  const initQuickActions = () => {
    document.querySelectorAll('.scan-card').forEach(card => {
      card.addEventListener('click', () => {
        if (!currentUser) {
          openAuthModal('login');
          return;
        }
        const category = card.dataset.category || 'DISPLAY';
        openChannelModal(category);
      });
    });
  };

  // ==========================================
  // CHANNEL MODAL (Çok Kanallı Tarama)
  // ==========================================

  const channelData = {
    DISPLAY: {
      name: 'GÖRÜNTÜLÜ REKLAMLAR',
      icon: 'monitor',
      color: '#00f3ff',
      mockupType: 'banner',
      objective: 'Marka Bilinirliği (Awareness)',
      fitScores: [
        { label: 'Görsel Etki', score: 92, color: '#00f3ff' },
        { label: 'CTR Potansiyeli', score: 68, color: '#bc13fe' },
        { label: 'Marka Uyumu', score: 85, color: '#00f3ff' },
        { label: 'Dönüşüm Olasılığı', score: 55, color: '#888' },
      ],
      personaArchetypes: ['Teknoloji Meraklısı', 'Profesyonel Yönetici', 'Genç Profesyonel'],
      designRules: [
        { icon: 'aspect_ratio', title: 'Boyut Uyumu', desc: '300x250, 728x90 ve 160x600 boyutlarını destekleyin. Tek boyuta bağlı kalmayın.' },
        { icon: 'text_fields', title: 'Metin Kısalığı', desc: 'Görüntülü reklamda 15 kelimeden fazla metin kullanmayın. CTA tek cümle olmalı.' },
        { icon: 'contrast', title: 'Renk Kontrastı', desc: 'Arka plan ile ön plan arasında %4.5:1 kontrast oranı sağlayın (WCAG standardı).' },
      ],
      errors: ['Tüm metni görsele gömmek (arama motoru göremez)', 'Animasyonsuz statik banner kullanmak', 'Logo olmadan marka kimliği oluşturmaya çalışmak'],
    },
    STORIES: {
      name: 'HİKAYELER',
      icon: 'smartphone',
      color: '#ff00ff',
      mockupType: 'phone',
      objective: 'Marka Bilinirliği (Awareness)',
      fitScores: [
        { label: 'Tam Ekran Etkisi', score: 95, color: '#ff00ff' },
        { label: 'Genç Kitle Erişimi', score: 88, color: '#bc13fe' },
        { label: 'Etkileşim Oranı', score: 79, color: '#ff00ff' },
        { label: 'Satın Alım Niyeti', score: 45, color: '#888' },
      ],
      personaArchetypes: ['Genç Tüketici', 'Sosyal Medya Uzmanı', 'Yaratıcı Profesyonel'],
      designRules: [
        { icon: 'crop_portrait', title: 'Dikey Format', desc: "9:16 oranını kesinlikle kullanın. Yatay içerik story'de %80 oranında atlanır." },
        { icon: 'swipe_up', title: 'Kaydır ve Harekete Geç', desc: "Swiping CTA'ı ilk 3 saniyede görünür kılın. Geç CTA büyük bütçe kaybıdır." },
        { icon: 'subtitles', title: 'Altyazı Zorunluluğu', desc: "Kullanıcıların %85'i story'leri sessiz izler. Her zaman altyazı ekleyin." },
      ],
      errors: ['Yatay video kullanmak (siyah bant görünümü)', 'Metin güvenli alanı (%25 alt) ihlal etmek', 'Logo/watermark olmadan paylaşmak'],
    },
    FEEDS: {
      name: 'AKIŞLAR (FEEDS)',
      icon: 'grid_view',
      color: '#bc13fe',
      mockupType: 'square',
      objective: 'Tıklama Alma (CTR)',
      fitScores: [
        { label: 'Organik Görünürlük', score: 82, color: '#bc13fe' },
        { label: 'Etkileşim Kalitesi', score: 76, color: '#bc13fe' },
        { label: 'Kaydırma Durdurma', score: 71, color: '#00f3ff' },
        { label: 'Reklam Yorgunluğu Riski', score: 60, color: '#f97316' },
      ],
      personaArchetypes: ['Sosyal Medya Uzmanı', 'Alışveriş Tutkunu', 'Yaratıcı Profesyonel'],
      designRules: [
        { icon: 'filter_vintage', title: 'Estetik Tutarlılık', desc: 'Feed renk paleti marka kimliğiyle uyumlu olmalı. Rastgele renk filtresi kullanmayın.' },
        { icon: 'crop_square', title: 'Kare Format Önceliği', desc: "1:1 kare format feed'de en yüksek alanı kaplar ve daha fazla dikkat çeker." },
        { icon: 'face', title: 'İnsan Yüzü Kullanın', desc: 'Yüz içeren görseller %38 daha fazla etkileşim alır (Meta araştırması).' },
      ],
      errors: ['Logosuz post paylaşmak', 'Çok fazla metin bindirmek (Metin < %20)', 'Stok fotoğraf kullanmak (düşük özgünlük)'],
    },
    EMAIL: {
      name: 'E-POSTA PAZARLAMA',
      icon: 'mail',
      color: '#fff',
      mockupType: 'email',
      objective: 'Satışı Artırma (Conversion)',
      fitScores: [
        { label: 'Dönüşüm Oranı', score: 87, color: '#00f3ff' },
        { label: 'Kitle Kalitesi', score: 91, color: '#00f3ff' },
        { label: 'Açılma Oranı Potansiyeli', score: 63, color: '#f97316' },
        { label: 'Spam Riski', score: 30, color: '#22c55e' },
      ],
      personaArchetypes: ['Profesyonel Yönetici', 'Kurumsal Alıcı', 'B2B Karar Verici'],
      designRules: [
        { icon: 'subject', title: 'Konu Satırı Kritiktir', desc: 'Konu satırı 40 karakteri geçmemeli ve kişiselleştirme içermeli ([Ad], %20 daha fazla açılır).' },
        { icon: 'view_cozy', title: 'Tek Sütun Düzeni', desc: 'Çoklu sütun mobilde bozulur. Her zaman tek sütun, en fazla 600px genişlik kullanın.' },
        { icon: 'touch_app', title: 'Tek CTA Prensibi', desc: 'Bir e-postada yalnızca bir CTA olmalı. Birden fazla link dönüşümü %50 düşürür.' },
      ],
      errors: ['Tüm içeriği görsellerle göndermek (gmail görsel bloklar)', 'Abonelikten çıkma linki eklememek (yasal zorunluluk)', 'Mobil test yapmadan göndermek'],
    },
    WEB_UI: {
      name: 'WEB ARAYÜZÜ',
      icon: 'language',
      color: '#00f3ff',
      mockupType: 'browser',
      objective: 'Satışı Artırma (Conversion)',
      fitScores: [
        { label: 'SEO Uyumluluğu', score: 78, color: '#22c55e' },
        { label: 'Dönüşüm Huniği', score: 83, color: '#00f3ff' },
        { label: 'Sayfa Yükleme Etkisi', score: 65, color: '#f97316' },
        { label: 'A/B Test Yapılabilirlik', score: 90, color: '#00f3ff' },
      ],
      personaArchetypes: ['Teknoloji Meraklısı', 'Bilinçli Tüketici', 'Profesyonel Yönetici'],
      designRules: [
        { icon: 'speed', title: 'Hız Önceliği', desc: 'Landing page 3 saniyeden fazla yüklenirse %53 kullanıcı sayfayı terk eder. Görsel boyutu optimize edin.' },
        { icon: 'above_the_fold', title: 'İlk Ekran Kuralı', desc: 'CTA ve temel mesaj, kaydırma olmadan görünen alanda (above the fold) yer almalı.' },
        { icon: 'anchor', title: 'F-Pattern Layout', desc: 'Kullanıcılar sayfaları F şeklinde tarar. Başlık, alt başlık ve CTA bu alanlara yerleştirin.' },
      ],
      errors: ["CTA butonu için pasif renk kullanmak", "Form alanlarını azaltmamak (3'ten fazla alan dönüşümü düşürür)", "Sosyal kanıt (yorum/referans) eklememek"],
    },
  };

  let activeChannelCategory = 'DISPLAY';

  const openChannelModal = (category) => {
    activeChannelCategory = category;
    const modal = document.getElementById('channel-detail-modal');
    const content = document.getElementById('channel-modal-content');
    const data = channelData[category] || channelData['DISPLAY'];

    // Update header
    document.getElementById('ch-modal-title').innerText = data.name;
    document.getElementById('ch-modal-icon').innerText = data.icon;
    document.getElementById('ch-modal-icon').style.color = data.color;

    // Activate first tab
    document.querySelectorAll('.ch-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.ch-tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('.ch-tab[data-tab="simulation"]').classList.add('active');
    document.getElementById('tab-simulation').classList.add('active');

    renderMockup(data);
    renderFitScores(data);
    renderPersonaTab(category);
    renderDesignGuide(data);

    modal.classList.remove('opacity-0', 'pointer-events-none');
    content.classList.remove('scale-95');
    content.classList.add('scale-100');
  };

  const hideChannelModal = () => {
    const modal = document.getElementById('channel-detail-modal');
    const content = document.getElementById('channel-modal-content');
    modal.classList.add('opacity-0', 'pointer-events-none');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
  };

  const renderMockup = (data) => {
    const wrapper = document.getElementById('ch-mockup-wrapper');
    const mediaUrl = document.getElementById('c_media_url')?.value || '';
    const imgStyle = mediaUrl
      ? `background-image: url('${mediaUrl}'); background-size: cover; background-position: center;`
      : 'background: linear-gradient(135deg, #111 0%, #1a1a2e 50%, #0f0f1a 100%);';

    let frame = '';
    switch (data.mockupType) {
      case 'phone':
        frame = `<div class="mockup-frame mockup-frame-phone">
          <div class="mockup-notch"></div>
          <div class="w-full h-full" style="${imgStyle} padding-top: 18px;">
            ${!mediaUrl ? '<div class="flex items-center justify-center h-full"><span class="material-symbols-outlined text-gray-700 text-4xl">smartphone</span></div>' : ''}
          </div>
          <div class="absolute bottom-0 w-full bg-black/70 p-2 text-center font-mono text-[9px] text-neon-magenta">STORY_ÖNİZLEME</div>
        </div>`;
        break;
      case 'square':
        frame = `<div class="mockup-frame mockup-frame-square">
          <div class="w-full h-full" style="${imgStyle}">
            ${!mediaUrl ? '<div class="flex items-center justify-center h-full"><span class="material-symbols-outlined text-gray-700 text-4xl">grid_view</span></div>' : ''}
          </div>
          <div class="absolute bottom-0 w-full bg-black/70 p-2 text-center font-mono text-[9px] text-neon-violet">FEED_ÖNİZLEME</div>
        </div>`;
        break;
      case 'email':
        frame = `<div class="mockup-frame mockup-frame-email">
          <div class="mockup-browser-bar"><div class="browser-dot bg-red-500"></div><div class="browser-dot bg-yellow-400"></div><div class="browser-dot bg-green-500"></div><span class="font-mono text-[9px] text-gray-500 ml-2">📧 E-Posta İstemcisi</span></div>
          <div class="flex-1 h-full" style="${imgStyle}; height: calc(100% - 28px);">
            ${!mediaUrl ? '<div class="flex items-center justify-center h-full"><span class="material-symbols-outlined text-gray-700 text-4xl">mail</span></div>' : ''}
          </div>
        </div>`;
        break;
      case 'browser':
        frame = `<div class="mockup-frame mockup-frame-browser">
          <div class="mockup-browser-bar"><div class="browser-dot bg-red-500"></div><div class="browser-dot bg-yellow-400"></div><div class="browser-dot bg-green-500"></div><div class="flex-1 bg-black/50 mx-2 px-2 rounded text-[9px] text-gray-500 font-mono">gozgu.ai/kampanya</div></div>
          <div class="flex-1 h-full" style="${imgStyle}; height: calc(100% - 28px);">
            ${!mediaUrl ? '<div class="flex items-center justify-center h-full"><span class="material-symbols-outlined text-gray-700 text-4xl">language</span></div>' : ''}
          </div>
        </div>`;
        break;
      default: // banner
        frame = `<div class="mockup-frame mockup-frame-banner">
          <div class="w-full h-full" style="${imgStyle}">
            ${!mediaUrl ? '<div class="flex items-center justify-center h-full"><span class="material-symbols-outlined text-gray-700 text-4xl">monitor</span></div>' : ''}
          </div>
          <div class="absolute bottom-0 w-full bg-black/70 p-1 text-center font-mono text-[9px] text-neon-cyan">BANNER_ÖNİZLEME</div>
        </div>`;
    }
    wrapper.innerHTML = frame;
  };

  const renderFitScores = (data) => {
    const container = document.getElementById('ch-fit-scores');
    container.innerHTML = data.fitScores.map(s => {
      const scoreColor = s.score >= 80 ? '#22c55e' : s.score >= 50 ? '#f59e0b' : '#ef4444';
      return `<div>
        <div class="flex justify-between items-center mb-1">
          <span class="font-mono text-xs text-gray-400">${s.label}</span>
          <span class="font-cyber font-bold text-sm" style="color: ${scoreColor}">${s.score}%</span>
        </div>
        <div class="score-bar-bg">
          <div class="score-bar-fill" style="background: ${scoreColor};" data-target="${s.score}"></div>
        </div>
      </div>`;
    }).join('');
    // Animate bars
    setTimeout(() => {
      container.querySelectorAll('.score-bar-fill').forEach(bar => {
        bar.style.width = bar.dataset.target + '%';
      });
    }, 100);
  };

  const renderPersonaTab = async (category) => {
    const container = document.getElementById('ch-persona-list');
    container.innerHTML = `<div class="text-gray-600 font-mono text-xs col-span-2 flex items-center gap-2 py-4 justify-center"><span class="material-symbols-outlined animate-spin text-sm">refresh</span> Personalar yükleniyor...</div>`;
    try {
      // Fetch ALL active personas and filter client-side using preferred_channels
      const { data: personas, error } = await supabase
        .from('personas')
        .select('id, name, age, job_title, primary_archetype, preferred_channels')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      if (!personas || personas.length === 0) {
        container.innerHTML = '<p class="text-gray-600 font-mono text-xs col-span-2 py-4 text-center">Aktif persona bulunamadı.</p>';
        return;
      }

      // Sort: recommended first, then others
      const sorted = [
        ...personas.filter(p => (p.preferred_channels || []).includes(category)),
        ...personas.filter(p => !(p.preferred_channels || []).includes(category)),
      ];

      container.innerHTML = sorted.map(p => {
        const isRecommended = (p.preferred_channels || []).includes(category);
        return `<div class="border ${isRecommended ? 'border-neon-cyan/50 bg-neon-cyan/5' : 'border-white/5 bg-black/10'} p-3 transition-all">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="font-cyber font-bold text-[11px] ${isRecommended ? 'text-neon-cyan' : 'text-gray-300'} uppercase truncate">${p.name}</div>
              <div class="font-mono text-[9px] text-gray-500 truncate">${p.job_title} · ${p.age} YAŞ</div>
            </div>
            ${isRecommended ? '<span class="text-[9px] font-mono text-neon-cyan border border-neon-cyan/30 px-1.5 py-0.5 shrink-0">✔ ÖNERİLEN</span>' : '<span class="text-[9px] font-mono text-gray-600 border border-gray-800/50 px-1.5 py-0.5 shrink-0">DİĞER</span>'}
          </div>
          ${p.primary_archetype ? `<div class="font-mono text-[9px] text-neon-violet/70 mt-1">${p.primary_archetype}</div>` : ''}
          ${isRecommended && p.preferred_channels?.length ? `<div class="font-mono text-[9px] text-neon-cyan/50 mt-0.5">${p.preferred_channels.join(' · ')}</div>` : ''}
        </div>`;
      }).join('');

      // Update summary
      const recCount = sorted.filter(p => (p.preferred_channels || []).includes(category)).length;
      const subtitle = container.closest('.ch-tab-panel')?.querySelector('p');
      if (subtitle) subtitle.innerHTML = `Bu kanala özel personalar: <span class="text-neon-cyan font-bold">${recCount}</span> önerilen, ${sorted.length - recCount} diğer.`;

    } catch (err) {
      console.error('Persona tab error:', err);
      container.innerHTML = '<p class="text-red-500 font-mono text-xs col-span-2 py-4 text-center">Yüklenemedi.</p>';
    }
  };

  const renderDesignGuide = (data) => {
    const rulesEl = document.getElementById('ch-design-rules');
    const errorsEl = document.getElementById('ch-errors-list');
    rulesEl.innerHTML = data.designRules.map((r, i) => `
      <div class="flex gap-4 p-4 border border-white/5 bg-black/20 hover:border-white/15 transition-colors">
        <div class="shrink-0 w-10 h-10 border border-neon-cyan/30 bg-neon-cyan/5 flex items-center justify-center">
          <span class="material-symbols-outlined text-neon-cyan text-sm">${r.icon}</span>
        </div>
        <div>
          <p class="font-mono text-[10px] text-neon-cyan mb-0.5 uppercase">KURAL_0${i + 1}: ${r.title}</p>
          <p class="text-gray-400 text-xs font-tech leading-relaxed">${r.desc}</p>
        </div>
      </div>
    `).join('');
    errorsEl.innerHTML = data.errors.map(e => `
      <div class="flex items-start gap-2 text-xs font-tech text-red-300/80">
        <span class="material-symbols-outlined text-red-500 text-[14px] mt-0.5 shrink-0">cancel</span>
        <span>${e}</span>
      </div>
    `).join('');
  };

  // Tab switching
  document.querySelectorAll('.ch-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ch-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.ch-tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      // Re-animate bars when switching to fit tab
      if (tab.dataset.tab === 'fit') {
        setTimeout(() => {
          document.querySelectorAll('.score-bar-fill').forEach(bar => {
            bar.style.width = '0';
            setTimeout(() => { bar.style.width = bar.dataset.target + '%'; }, 50);
          });
        }, 50);
      }
    });
  });

  // Close buttons
  document.getElementById('close-channel-modal')?.addEventListener('click', hideChannelModal);
  document.getElementById('close-channel-modal-2')?.addEventListener('click', hideChannelModal);

  // "Analyze with this channel" → redirect to dashboard with channel pre-selected
  document.getElementById('ch-analyze-btn')?.addEventListener('click', () => {
    const category = activeChannelCategory;
    hideChannelModal();
    // Navigate to new analysis page with channel pre-selected
    window.location.href = `new-analysis.html?channel=${category}`;
  });

  // ----- DEMO MODAL ELEMENTLERİ -----
  const demoModal = document.getElementById('demo-modal');
  const demoModalContent = document.getElementById('demo-modal-content');
  const closeDemoModal = document.getElementById('close-demo-modal');
  const btnDemoCta = document.getElementById('btn-demo-cta');

  const openDemoModal = () => {
    demoModal.classList.remove('opacity-0', 'pointer-events-none');
    demoModalContent.classList.remove('scale-95');
    demoModalContent.classList.add('scale-100');
  };

  const hideDemoModal = () => {
    demoModal.classList.add('opacity-0', 'pointer-events-none');
    demoModalContent.classList.remove('scale-100');
    demoModalContent.classList.add('scale-95');
  };

  if (closeDemoModal) closeDemoModal.addEventListener('click', hideDemoModal);
  if (btnDemoCta) {
    btnDemoCta.addEventListener('click', () => {
      hideDemoModal();
      openCampaignModal();
    });
  }

  // 4. Mobil Menü Drawer
  const initMobileMenu = () => {
    const toggle = document.getElementById('mobile-menu-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        alert("Mobil HUD Arayüzü: Masaüstü optimize edildi. Tam mobil çekmece v4.1 ile geliyor.");
      });
    }
  };

  const btnViewSimulation = document.getElementById('btn-view-simulation');
  const btnSampleData = document.getElementById('btn-sample-data');

  if (btnViewSimulation) {
    btnViewSimulation.addEventListener('click', openDemoModal);
  }

  if (btnSampleData) {
    btnSampleData.addEventListener('click', () => {
      alert("Sistem Mesajı: Örnek Veri Setleri (Sample Datasets) şu an BETA kullanıcıları için kilitlidir.");
    });
  }

  // Başlat
  checkUserSession();
  updateStats();
  initHUDAnimation();
  initQuickActions();
  initMobileMenu();

});
