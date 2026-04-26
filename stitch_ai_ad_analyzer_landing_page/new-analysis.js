import { supabase } from './supabase-config.js';

const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_ANALYZE_WEBHOOK_URL;

// =================================================================
// VIDEO UPLOAD DESTEĞİ — SABİTLER & YARDIMCI FONKSİYONLAR
// =================================================================
const VIDEO_MAX_SIZE_MB = 10;
const VIDEO_MAX_DURATION_SEC = 30;
const VIDEO_MAX_WIDTH = 1280;
const VIDEO_MAX_HEIGHT = 720;
const VIDEO_ALLOWED_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

function detectMediaType(file) {
    if (!file) return { type: null, valid: false, error: 'Dosya seçilmedi' };
    if (file.type.startsWith('image/')) return { type: 'image', valid: true };
    if (VIDEO_ALLOWED_TYPES.includes(file.type)) return { type: 'video', valid: true };
    return { type: null, valid: false, error: `Desteklenmeyen format: ${file.type}. Desteklenen: JPG, PNG, GIF, MP4, WebM, MOV` };
}

function validateVideo(file) {
    return new Promise((resolve) => {
        const errors = [];
        const sizeMB = file.size / (1024 * 1024);
        if (sizeMB > VIDEO_MAX_SIZE_MB) {
            errors.push(`Dosya boyutu ${sizeMB.toFixed(1)}MB — Limit: ${VIDEO_MAX_SIZE_MB}MB`);
        }
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            if (video.duration > VIDEO_MAX_DURATION_SEC) {
                errors.push(`Video süresi ${Math.round(video.duration)}sn — Limit: ${VIDEO_MAX_DURATION_SEC}sn`);
            }
            if (video.videoWidth > VIDEO_MAX_WIDTH || video.videoHeight > VIDEO_MAX_HEIGHT) {
                errors.push(`Çözünürlük ${video.videoWidth}×${video.videoHeight} — Limit: ${VIDEO_MAX_WIDTH}×${VIDEO_MAX_HEIGHT}`);
            }
            URL.revokeObjectURL(video.src);
            resolve({
                valid: errors.length === 0,
                duration: Math.round(video.duration),
                width: video.videoWidth,
                height: video.videoHeight,
                sizeMB: sizeMB.toFixed(1),
                sizeFormatted: sizeMB < 1 ? `${(sizeMB * 1024).toFixed(0)}KB` : `${sizeMB.toFixed(1)}MB`,
                errors
            });
        };
        video.onerror = () => {
            URL.revokeObjectURL(video.src);
            resolve({ valid: false, duration: 0, width: 0, height: 0, sizeMB: sizeMB.toFixed(1), sizeFormatted: `${sizeMB.toFixed(1)}MB`, errors: ['Video dosyası okunamadı veya bozuk'] });
        };
        video.src = URL.createObjectURL(file);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Session Kontrolü (Sadece giriş yapanlar görebilir)
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
        window.location.href = 'index.html';
        return;
    }

    const currentUser = session.user;

    const campaignForm = document.getElementById('campaign-form');
    const submitBtn = document.getElementById('submit-btn');
    const loadingIndicator = document.getElementById('loading-indicator');
    
    const personaGrid = document.getElementById('persona-selection-grid');
    const segmentGrid = document.getElementById('segment-selection-grid');
    const personaCountIndicator = document.getElementById('selected-persona-count');
    const personaError = document.getElementById('persona-error');
    
    // Görsel Yükleme State
    let selectedFile = null;
    let compressedBlob = null;
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('c_file');
    const previewContainer = document.getElementById('upload-preview-container');
    const imgPreview = document.getElementById('img-preview');
    const btnRemoveFile = document.getElementById('btn-remove-file');
    const compressionStatus = document.getElementById('compression-status');
    const progressBar = document.getElementById('upload-progress-bar');
    const fileInfoText = document.getElementById('file-info');
    const fileNameText = document.getElementById('file-name');

    // Video Önizleme Elementleri
    const videoPreview = document.getElementById('video-preview');
    const videoInfoPanel = document.getElementById('video-info-panel');
    const videoDurationEl = document.getElementById('video-duration');
    const videoResolutionEl = document.getElementById('video-resolution');
    const videoWarning = document.getElementById('video-warning');

    // Medya Tipi State (image/video)
    let selectedMediaType = 'image';
    let videoValidation = null;

    // ==========================================
    // OPTIMIZASYON VERISI KONTROLÜ (Pre-fill from AI)
    // ==========================================
    const btnCancelOpt = document.getElementById('btn-cancel-optimization');
    if (btnCancelOpt) {
        btnCancelOpt.addEventListener('click', () => {
            sessionStorage.removeItem('optimized_campaign_data');
            optimizedData = null;
            window.location.reload();
        });
    }
    const optimizedDataStr = sessionStorage.getItem('optimized_campaign_data');
    let optimizedData = null;
    if (optimizedDataStr) {
        try {
            optimizedData = JSON.parse(optimizedDataStr);
            console.log("AI Optimizasyonu ile form dolduruluyor...");
        } catch(e) { console.error("Optimized data parse error", e); }
    }

    const urlParams = new URLSearchParams(window.location.search);
    const channelParam = urlParams.get('channel');

    const prefillForm = () => {
        if (!optimizedData) return;
        
        const banner = document.getElementById('optimization-banner');
        if (banner) banner.classList.remove('hidden');

        document.getElementById('c_name').value = optimizedData.name || '';
        document.getElementById('c_objective').value = optimizedData.objective || 'Satış / Dönüşüm (Conversion)';
        document.getElementById('c_brand_tone').value = optimizedData.brand_tone || '';
        document.getElementById('c_call_to_action').value = optimizedData.call_to_action || '';
        document.getElementById('c_value_proposition').value = optimizedData.value_proposition || '';
        const sloganEl = document.getElementById('c_slogan'); if (sloganEl) sloganEl.value = optimizedData.slogan || '';
        document.getElementById('c_media_url').value = optimizedData.media_url || '';
        document.getElementById('c_audience').value = optimizedData.audience || '';
        document.getElementById('c_brand_guidelines').value = optimizedData.brand_guidelines || '';

        // Kanalları seç
        if (optimizedData.channels && Array.from(optimizedData.channels).length > 0) {
            optimizedData.channels.forEach(ch => {
                const cb = document.querySelector(`.channel-checkbox[value="${ch.trim()}"]`);
                if (cb) cb.checked = true;
            });
        }
    };

    // ==========================================
    // PERSONA VE SEGMENT YÜKLEME
    // ==========================================
    const fetchPersonas = async () => {
        personaGrid.innerHTML = `
            <div class="text-gray-500 font-mono text-xs py-4 text-center w-full col-span-2 flex items-center justify-center gap-2">
               <span class="material-symbols-outlined animate-spin text-sm">refresh</span> Aktif personalar getiriliyor...
            </div>`;
             
        try {
            const { data: personas, error } = await supabase
                .from('personas')
                .select('id, name, age, job_title, primary_archetype, preferred_channels, ses_group, gender')
                .eq('is_active', true);

            if (error) throw error;

            personaGrid.innerHTML = '';
            
            if (personas.length === 0) {
                 personaGrid.innerHTML = '<p class="text-red-500 font-mono text-xs col-span-2">Veritabanında aktif persona bulunamadı.</p>';
                 return;
            }

            // Kuşak belirleme yardımcısı
            const getGen = (age) => {
                if (age <= 27) return 'Gen-Z';
                if (age <= 42) return 'Millennial';
                if (age <= 58) return 'Gen-X';
                return 'Boomer+';
            };

            personas.forEach(p => {
                const isRecommended = channelParam && (p.preferred_channels || []).includes(channelParam);
                const checkedAttr = isRecommended ? 'checked' : '';
                const gen = getGen(p.age);
                const searchStr = `${p.name} ${p.job_title} ${p.primary_archetype} ${p.ses_group || ''} ${gen}`.toLowerCase();
                
                const card = `
                <div class="relative persona-card" data-ses="${p.ses_group || ''}" data-generation="${gen}" data-gender="${p.gender || ''}" data-search="${searchStr}">
                   <input type="checkbox" id="p_${p.id}" value="${p.id}" class="peer hidden persona-checkbox" ${checkedAttr}>
                   <label for="p_${p.id}" class="persona-checkbox-label flex flex-col p-3 border border-gray-700 bg-black/40 hover:border-gray-500 cursor-pointer h-full relative overflow-hidden group transition-all peer-checked:border-neon-cyan peer-checked:bg-neon-cyan/10">
                       <div class="absolute top-2 right-2 opacity-0 peer-checked:opacity-100 text-neon-cyan transition-opacity">
                          <span class="material-symbols-outlined text-[16px]">check_circle</span>
                       </div>
                       <div class="font-cyber font-bold text-sm text-gray-300 uppercase mb-1 persona-name transition-colors peer-checked:text-white">${p.name}</div>
                       <div class="font-mono text-[10px] text-gray-500 uppercase">${p.age} YAŞ | ${p.job_title}</div>
                       <div class="flex items-center gap-1 mt-1.5">
                         <span class="font-mono text-[8px] text-neon-violet uppercase border border-neon-violet/30 px-1 py-0.5">${p.primary_archetype}</span>
                         <span class="font-mono text-[8px] text-neon-cyan/70 uppercase border border-neon-cyan/20 px-1 py-0.5">${p.ses_group || 'SES'}</span>
                         <span class="font-mono text-[8px] text-gray-500 uppercase border border-gray-700 px-1 py-0.5">${gen}</span>
                       </div>
                   </label>
                </div>
                `;
                personaGrid.innerHTML += card;
            });

            updatePersonaCount();

            // Checkbox event dinleyicileri
            document.querySelectorAll('.persona-checkbox').forEach(cb => {
                cb.addEventListener('change', updatePersonaCount);
            });

        } catch (err) {
            console.error("Error fetching personas:", err);
            personaGrid.innerHTML = '<p class="text-red-500 font-mono text-xs col-span-2">Personalar yüklenemedi.</p>';
        }
    };

    const fetchSegments = async () => {
        if (!segmentGrid) return;
        segmentGrid.innerHTML = `
            <div class="text-gray-500 font-mono text-[10px] py-2 text-center w-full col-span-2 flex items-center justify-center gap-2">
               <span class="material-symbols-outlined animate-spin text-sm">refresh</span> Segmentler yükleniyor...
            </div>`;

        try {
            const { data: segments, error } = await supabase
                .from('segments')
                .select(`
                    *,
                    segment_personas (
                        persona_id
                    )
                `)
                .eq('is_active', true)
                .or(`user_id.is.null,user_id.eq.${currentUser.id}`);

            if (error) throw error;
            segmentGrid.innerHTML = '';
            
            if (!segments || segments.length === 0) {
                 segmentGrid.innerHTML = '<p class="text-gray-500 font-mono text-xs col-span-1 p-4 border border-dashed border-gray-800 text-center">Aktif segment bulunamadı.</p>';
                 return;
            }

            // Segmentleri kategorilerine göre grupla
            const groupedSegments = {};
            segments.forEach(seg => {
                const categoryName = seg.category ? seg.category.toUpperCase() : 'ÖZEL';
                if (!groupedSegments[categoryName]) {
                    groupedSegments[categoryName] = [];
                }
                groupedSegments[categoryName].push(seg);
            });

            // Özeli (Custom) en sona almak için sıralama yapabiliriz
            const sortedCategories = Object.keys(groupedSegments).sort((a, b) => {
                if (a === 'ÖZEL') return 1;
                if (b === 'ÖZEL') return -1;
                return a.localeCompare(b);
            });

            sortedCategories.forEach(category => {
                // Kategori Başlığı
                const header = document.createElement('div');
                header.className = "w-full mt-4 mb-2 first:mt-0";
                header.innerHTML = `
                    <div class="flex items-center gap-2 pb-1 border-b border-white/10">
                        <span class="material-symbols-outlined text-[14px] text-neon-cyan">folder_open</span>
                        <span class="font-mono text-[10px] text-gray-400 uppercase tracking-wider">${category} SEGMENTLERİ</span>
                    </div>
                `;
                segmentGrid.appendChild(header);

                // Bu kategoriye ait segmentler
                groupedSegments[category].forEach(seg => {
                    const personaIds = seg.segment_personas.map(sp => sp.persona_id);
                    const isCustom = seg.user_id !== null;
                    const badgeHtml = isCustom ? `<span class="px-1.5 py-0.5 border border-neon-magenta text-neon-magenta text-[8px] font-cyber uppercase bg-neon-magenta/10 ml-auto shadow-[0_0_5px_rgba(255,0,255,0.2)]">Kişisel</span>` : '';
                    
                    const card = document.createElement('div');
                    card.className = "relative group mb-2";
                    card.innerHTML = `
                        <input type="checkbox" id="seg_${seg.id}" value="${seg.id}" class="peer hidden segment-checkbox" data-personas='${JSON.stringify(personaIds)}'>
                        <label for="seg_${seg.id}" class="flex flex-col p-3 border border-gray-700 bg-black/40 hover:border-gray-500 cursor-pointer h-full transition-all peer-checked:border-neon-cyan peer-checked:bg-neon-cyan/10">
                            <div class="flex items-start justify-between mb-2">
                                <div class="flex items-center gap-2">
                                    <span class="material-symbols-outlined text-[18px] text-gray-500 peer-checked:text-neon-cyan">${seg.icon || 'groups'}</span>
                                    <div class="font-cyber font-bold text-[12px] text-gray-200 uppercase truncate peer-checked:text-white">${seg.name}</div>
                                </div>
                                <span class="material-symbols-outlined text-[16px] opacity-0 peer-checked:opacity-100 text-neon-cyan transition-opacity font-bold">check_circle</span>
                            </div>
                            <div class="text-[10px] text-gray-500 font-tech leading-relaxed line-clamp-2">${seg.description || 'Açıklama belirtilmemiş.'}</div>
                            <div class="mt-3 flex items-center justify-between gap-2 w-full">
                                <span class="text-[9px] font-mono text-neon-cyan/70 border border-neon-cyan/20 px-2 py-0.5 uppercase bg-neon-cyan/5">${personaIds.length} Persona Barındırıyor</span>
                                ${badgeHtml}
                            </div>
                        </label>
                    `;
                    segmentGrid.appendChild(card);

                    const checkbox = card.querySelector('.segment-checkbox');
                    checkbox.addEventListener('change', () => handleSegmentToggle(checkbox));
                });
            });

        } catch (err) {
            console.error("Error fetching segments:", err);
            segmentGrid.innerHTML = '<p class="text-red-500 font-mono text-[10px] col-span-2">Segmentler yüklenemedi.</p>';
        }
    };

    const handleSegmentToggle = (segmentCheckbox) => {
        const personaIds = JSON.parse(segmentCheckbox.dataset.personas);
        const isChecked = segmentCheckbox.checked;

        personaIds.forEach(id => {
            const pCheckbox = document.getElementById(`p_${id}`);
            if (pCheckbox) {
                pCheckbox.checked = isChecked;
                pCheckbox.dispatchEvent(new Event('change'));
            }
        });
    };

    const updatePersonaCount = () => {
        const count = document.querySelectorAll('.persona-checkbox:checked').length;
        if(personaCountIndicator) personaCountIndicator.innerText = `${count} SEÇİLDİ`;
        if (count > 0 && personaError) {
            personaError.classList.add('hidden');
        }
    };

    // ==========================================
    // KANAL SEÇİM MANTIĞI
    // ==========================================
    const mockupTemplates = {
        DISPLAY: (url) => `<div class="border border-neon-cyan/40 bg-black" style="width:100%;max-width:420px;height:110px;margin:0 auto;position:relative;overflow:hidden">
            <div style="${url ? `background:url('${url}') center/cover` : 'background:linear-gradient(135deg,#111,#1a1a2e)'};width:100%;height:100%"></div>
            <div style="position:absolute;bottom:0;width:100%;background:rgba(0,0,0,0.7);padding:4px 8px;font-family:monospace;font-size:9px;color:#00f3ff">BANNER ÖNİZLEME</div>
        </div>`,
        STORIES: (url) => `<div class="border border-neon-magenta/40 bg-black" style="width:160px;height:285px;border-radius:16px;margin:0 auto;position:relative;overflow:hidden">
            <div style="background:#000;border-radius:0 0 8px 8px;width:60px;height:14px;position:absolute;top:0;left:50%;transform:translateX(-50%);z-index:2"></div>
            <div style="${url ? `background:url('${url}') center/cover` : 'background:linear-gradient(135deg,#111,#2a0a2e)'};width:100%;height:100%;padding-top:14px"></div>
            <div style="position:absolute;bottom:0;width:100%;background:rgba(0,0,0,0.7);padding:4px;font-family:monospace;font-size:9px;color:#ff00ff;text-align:center">STORY ÖNİZLEME</div>
        </div>`,
        FEEDS: (url) => `<div class="border border-neon-violet/40 bg-black" style="width:220px;height:220px;margin:0 auto;position:relative;overflow:hidden">
            <div style="${url ? `background:url('${url}') center/cover` : 'background:linear-gradient(135deg,#111,#1a0a2e)'};width:100%;height:100%"></div>
            <div style="position:absolute;bottom:0;width:100%;background:rgba(0,0,0,0.7);padding:4px;font-family:monospace;font-size:9px;color:#bc13fe;text-align:center">FEED ÖNİZLEME</div>
        </div>`,
        EMAIL: (url) => `<div class="border border-white/30 bg-black" style="width:100%;max-width:400px;height:190px;margin:0 auto;overflow:hidden">
            <div style="background:#1a1a1a;height:22px;display:flex;align-items:center;padding:0 8px;gap:4px">
                <div style="width:7px;height:7px;border-radius:50%;background:#ef4444"></div>
                <div style="width:7px;height:7px;border-radius:50%;background:#f59e0b"></div>
                <div style="width:7px;height:7px;border-radius:50%;background:#22c55e"></div>
                <span style="font-family:monospace;font-size:9px;color:#555;margin-left:6px">E-Posta İstemcisi</span>
            </div>
            <div style="${url ? `background:url('${url}') center/cover` : 'background:#0a0a0a'};height:calc(100% - 22px)"></div>
        </div>`,
        WEB_UI: (url) => `<div class="border border-neon-cyan/40 bg-black" style="width:100%;max-width:400px;height:190px;margin:0 auto;overflow:hidden">
            <div style="background:#1a1a1a;height:22px;display:flex;align-items:center;padding:0 8px;gap:4px">
                <div style="width:7px;height:7px;border-radius:50%;background:#ef4444"></div>
                <div style="width:7px;height:7px;border-radius:50%;background:#f59e0b"></div>
                <div style="width:7px;height:7px;border-radius:50%;background:#22c55e"></div>
                <div style="flex:1;background:rgba(0,0,0,0.5);margin:0 8px;padding:0 6px;font-family:monospace;font-size:9px;color:#555;border-radius:3px">gozgu.ai/kampanya</div>
            </div>
            <div style="${url ? `background:url('${url}') center/cover` : 'background:#0a0a0a'};height:calc(100% - 22px)"></div>
        </div>`,
    };

    const updateMockup = () => {
        const checkedChannels = Array.from(document.querySelectorAll('.channel-checkbox:checked')).map(cb => cb.value);
        // URL yerine artık preview src'yi kullanıyoruz mockup için
        const mediaUrl = imgPreview?.src || '';
        const wrapper = document.getElementById('media-mockup-wrapper');
        const frame = document.getElementById('media-mockup-frame');
        if (!wrapper || !frame) return; // Elementler DOM'da yoksa sessizce çık
        if (checkedChannels.length === 0 || !mediaUrl) {
            wrapper.classList.add('hidden');
            return;
        }
        wrapper.classList.remove('hidden');
        const ch = checkedChannels[0];
        frame.innerHTML = (mockupTemplates[ch] || mockupTemplates['DISPLAY'])(mediaUrl);
    };

    const updateChannelBadge = () => {
        const checkedBoxes = Array.from(document.querySelectorAll('.channel-checkbox:checked'));
        const count = checkedBoxes.length;
        document.getElementById('channel-count-badge').innerText = `${count} SEÇİLDİ`;
        
        const warning = document.getElementById('multi-channel-warning');
        const attentionInfo = document.getElementById('channel-attention-info');
        
        if (count > 1) {
            warning.classList.remove('hidden');
            if (attentionInfo) attentionInfo.classList.add('hidden');
        } else {
            warning.classList.add('hidden');
            // Kanal Dikkat Süresi Mantığı
            if (count === 1 && attentionInfo) {
                const channelAttention = {
                  DISPLAY: { duration: "1-2 saniye", note: "Banner körlüğü riski yüksek. Görsel çarpıcılık kritik." },
                  STORIES: { duration: "3-5 saniye", note: "Tam ekran, hızlı geçiş. İlk kare her şeyi belirler." },
                  FEEDS:   { duration: "1.5-3 saniye", note: "Kaydırma akışında kaybolma riski. Thumb-stopping görsel gerekli." },
                  EMAIL:   { duration: "8-15 saniye", note: "Kullanıcı zaten açtıysa ilgi var. Konu satırı en kritik unsur." },
                  WEB_UI:  { duration: "5-10 saniye", note: "Native içerik gibi görünmeli. Reklam hissi vermemeli." }
                };
                const chValue = checkedBoxes[0].value;
                document.getElementById('channel-attention-duration').innerText = channelAttention[chValue]?.duration || "--";
                document.getElementById('channel-attention-note').innerText = channelAttention[chValue]?.note || "--";
                attentionInfo.classList.remove('hidden');
            } else if (attentionInfo) {
                attentionInfo.classList.add('hidden');
            }
        }
        updateMockup();
    };

    const initChannelSelection = () => {
        document.querySelectorAll('.channel-checkbox').forEach(cb => {
            cb.addEventListener('change', updateChannelBadge);
        });
        
        if (optimizedData) {
            prefillForm();
            updateChannelBadge();
            updateMockup();
            sessionStorage.removeItem('optimized_campaign_data');
        } else if (channelParam) {
            const targetCb = document.querySelector(`.channel-checkbox[value="${channelParam}"]`);
            if (targetCb) {
                targetCb.checked = true;
                updateChannelBadge();
                updateMockup();
            }
        }
    };

    // ==========================================
    // GÖRSEL İŞLEME VE YÜKLEME (PHASE 5)
    // ==========================================
    
    // File Selection
    const handleFileSelect = async (file) => {
        if (!file) return;

        // Medya tipini algıla
        const mediaInfo = detectMediaType(file);
        if (!mediaInfo.valid) {
            alert(mediaInfo.error);
            return;
        }

        selectedFile = file;
        fileNameText.innerText = file.name;
        previewContainer.classList.remove('hidden');
        dropZone.classList.add('hidden');

        if (mediaInfo.type === 'video') {
            // ─── VİDEO İŞLEME ───
            selectedMediaType = 'video';
            compressedBlob = null; // Video sıkıştırma yok

            // Görsel önizlemeyi gizle, video önizlemeyi göster
            imgPreview.classList.add('hidden');
            if (videoPreview) {
                videoPreview.src = URL.createObjectURL(file);
                videoPreview.classList.remove('hidden');
            }

            // Video doğrulama
            videoValidation = await validateVideo(file);

            // Bilgi paneli
            compressionStatus.innerText = 'VİDEO';
            compressionStatus.classList.replace('text-neon-cyan', 'text-neon-magenta');
            fileInfoText.innerText = `BOYUT: ${videoValidation.sizeFormatted} // SÜRE: ${videoValidation.duration}sn // ${videoValidation.width}×${videoValidation.height}`;

            if (videoInfoPanel) videoInfoPanel.classList.remove('hidden');
            if (videoDurationEl) videoDurationEl.innerText = `Süre: ${videoValidation.duration}sn`;
            if (videoResolutionEl) videoResolutionEl.innerText = `Çözünürlük: ${videoValidation.width}×${videoValidation.height}`;

            // Uyarı
            if (videoWarning) {
                if (!videoValidation.valid) {
                    videoWarning.classList.remove('hidden');
                    videoWarning.innerHTML = '⚠️ ' + videoValidation.errors.join('<br>⚠️ ');
                } else {
                    videoWarning.classList.add('hidden');
                }
            }

            progressBar.style.width = '100%';
            updateMockup();

        } else {
            // ─── GÖRSEL İŞLEME (MEVCUT MANTIK) ───
            selectedMediaType = 'image';
            videoValidation = null;

            // Video önizlemeyi gizle
            if (videoPreview) {
                if (videoPreview.src && videoPreview.src.startsWith('blob:')) URL.revokeObjectURL(videoPreview.src);
                videoPreview.src = '';
                videoPreview.classList.add('hidden');
            }
            if (videoInfoPanel) videoInfoPanel.classList.add('hidden');
            imgPreview.classList.remove('hidden');

            const reader = new FileReader();
            reader.onload = (e) => {
                imgPreview.src = e.target.result;
                processAndCompress(e.target.result, file);
            };
            reader.readAsDataURL(file);
        }
    };

    const processAndCompress = (dataUrl, originalFile) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.getElementById('compression-canvas');
            const ctx = canvas.getContext('2d');
            
            // Maksimum Boyut: 1200px (Genişlik veya Yükseklik)
            let width = img.width;
            let height = img.height;
            const maxDim = 1200;
            
            if (width > height) {
                if (width > maxDim) {
                    height *= maxDim / width;
                    width = maxDim;
                }
            } else {
                if (height > maxDim) {
                    width *= maxDim / height;
                    height = maxDim;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            // PNG ise PNG olarak koru (şeffaflık korunsun), diğerleri JPEG
            const isPng = originalFile.type === 'image/png';
            const outputMime = isPng ? 'image/png' : 'image/jpeg';
            const quality = isPng ? undefined : 0.7; // PNG için quality kullanılmaz
            
            canvas.toBlob((blob) => {
                compressedBlob = blob;
                compressionStatus.innerText = 'SIKIŞTIRILDI';
                compressionStatus.classList.replace('text-neon-cyan', 'text-green-500');
                
                const origSize = (originalFile.size / (1024 * 1024)).toFixed(2);
                const compSize = (blob.size / (1024 * 1024)).toFixed(2);
                fileInfoText.innerText = `ORİJİNAL: ${origSize} MB // SIKISTIRILMIS: ${compSize} MB (${isPng ? 'PNG' : 'JPEG'})`;
                
                // Önizlemeyi güncelle
                updateMockup();
            }, outputMime, quality);
        };
        img.src = dataUrl;
    };

    const uploadToSupabase = async (blob, originalName) => {
        // Blob'un gerçek MIME type'ına göre uzantıyı belirle
        const fileExt = compressedBlob.type === 'image/png' ? 'png' : 'jpg';
        const fileName = `${currentUser.id}_${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `campaigns/${fileName}`;
        
        progressBar.style.width = '30%';
        
        const { data, error } = await supabase.storage
            .from('campaign_images')
            .upload(filePath, blob, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error("Upload error:", error);
            // Eğer bucket yoksa veya yetki hatası varsa burada patlar
            if (error.message.includes("Object not found") || error.message.includes("does not exist")) {
                throw new Error("Supabase Storage 'campaign_images' bucket'ı bulunamadı. Lütfen önce bucket oluşturun.");
            }
            throw error;
        }

        progressBar.style.width = '100%';
        
        const { data: { publicUrl } } = supabase.storage
            .from('campaign_images')
            .getPublicUrl(filePath);
            
        return publicUrl;
    };

    // Event Listeners for Drop Zone
    if (dropZone) {
        dropZone.onclick = () => fileInput.click();
        dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('border-neon-cyan', 'bg-neon-cyan/10'); };
        dropZone.ondragleave = () => { dropZone.classList.remove('border-neon-cyan', 'bg-neon-cyan/10'); };
        dropZone.ondrop = (e) => {
            e.preventDefault();
            dropZone.classList.remove('border-neon-cyan', 'bg-neon-cyan/10');
            if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
        };
    }

    if (fileInput) {
        fileInput.onchange = (e) => { if (e.target.files.length > 0) handleFileSelect(e.target.files[0]); };
    }

    if (btnRemoveFile) {
        btnRemoveFile.onclick = () => {
            selectedFile = null;
            compressedBlob = null;
            selectedMediaType = 'image';
            videoValidation = null;
            previewContainer.classList.add('hidden');
            dropZone.classList.remove('hidden');
            fileInput.value = '';
            imgPreview.src = '';
            imgPreview.classList.remove('hidden');
            // Video temizle
            if (videoPreview) {
                if (videoPreview.src && videoPreview.src.startsWith('blob:')) URL.revokeObjectURL(videoPreview.src);
                videoPreview.src = '';
                videoPreview.classList.add('hidden');
            }
            if (videoInfoPanel) videoInfoPanel.classList.add('hidden');
            if (videoWarning) videoWarning.classList.add('hidden');
            compressionStatus.innerText = 'İşleniyor...';
            compressionStatus.classList.replace('text-neon-magenta', 'text-neon-cyan');
            progressBar.style.width = '0%';
            updateMockup();
        };
    }

    // ==========================================
    // KAMPANYA YÜKLEME 
    // ==========================================
    campaignForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const selectedCheckboxes = document.querySelectorAll('.persona-checkbox:checked');
        if (selectedCheckboxes.length === 0) {
            personaError.classList.remove('hidden');
            return;
        }

        const selectedPersonaIds = Array.from(selectedCheckboxes).map(cb => cb.value);

        if (!compressedBlob && !selectedFile) {
            alert("Lütfen bir reklam görseli veya videosu yükleyin.");
            return;
        }

        loadingIndicator.classList.remove('hidden');
        submitBtn.classList.add('hidden');

        try {
            // Step 1: Upload to Storage
            let finalMediaUrl = "";
            if (selectedMediaType === 'video' && selectedFile) {
                // Video yükleme — sıkıştırma yok, doğrudan upload
                const fileExt = selectedFile.name.split('.').pop().toLowerCase();
                const fileName = `${currentUser.id}_video_${Date.now()}.${fileExt}`;
                const filePath = `videos/${fileName}`;
                progressBar.style.width = '30%';
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('campaign_images')
                    .upload(filePath, selectedFile, {
                        cacheControl: '3600',
                        upsert: false,
                        contentType: selectedFile.type
                    });
                if (uploadError) throw uploadError;
                progressBar.style.width = '100%';
                const { data: { publicUrl } } = supabase.storage
                    .from('campaign_images')
                    .getPublicUrl(filePath);
                finalMediaUrl = publicUrl;
            } else if (compressedBlob) {
                finalMediaUrl = await uploadToSupabase(compressedBlob, selectedFile.name);
            }

            const campaignData = {
                name: document.getElementById('c_name').value,
                objective: document.getElementById('c_objective').value,
                ad_slogan: document.getElementById('c_slogan')?.value || '',
                media_url: finalMediaUrl,
                intended_audience_desc: document.getElementById('c_audience').value,
                brand_tone: document.getElementById('c_brand_tone').value,
                value_proposition: document.getElementById('c_value_proposition').value,
                call_to_action: document.getElementById('c_call_to_action').value,
                brand_guidelines: document.getElementById('c_brand_guidelines').value,
                media_type: selectedMediaType,
                media_duration_seconds: videoValidation?.duration || null,
                media_analysis_status: 'pending',
                status: 'pending',
                user_id: currentUser.id,
                is_ai_optimized: optimizedData ? true : false,
                original_campaign_id: optimizedData ? optimizedData.original_campaign_id : null,
                channel_type: Array.from(document.querySelectorAll('.channel-checkbox:checked')).map(cb => cb.value).join(',') || 'DISPLAY'
            };

            const { data, error } = await supabase
                .from('campaigns')
                .insert([campaignData])
                .select();

            if (error) throw error;
            const insertedCampaignId = data[0].id;

            try {
                await fetch(N8N_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        campaign_id: insertedCampaignId,
                        persona_ids: selectedPersonaIds,
                        channel_type: Array.from(document.querySelectorAll('.channel-checkbox:checked')).map(cb => cb.value).join(',') || 'DISPLAY',
                        channel_types: Array.from(document.querySelectorAll('.channel-checkbox:checked')).map(cb => cb.value)
                    })
                });
            } catch(webhookErr) {
                 console.warn("Webhook issue", webhookErr);
            }

            // Redirect to dashboard viewing this campaign
            window.location.href = `dashboard.html?id=${insertedCampaignId}`;

        } catch (err) {
            console.error("Error saving campaign:", err);
            alert("Kampanya kaydedilirken hata oluştu: " + err.message);
            loadingIndicator.classList.add('hidden');
            submitBtn.classList.remove('hidden');
        }
    });

    // ==========================================
    // WIZARD STEP NAVİGASYON SİSTEMİ
    // ==========================================
    let currentStep = 1;
    const totalSteps = 3;
    const stepTitles = { 1: 'Kampanya Bilgileri', 2: 'Medya & Kanallar', 3: 'Hedef Kitle' };

    const goToStep = (step) => {
        if (step < 1 || step > totalSteps) return;

        // Validasyon (ileri giderken)
        if (step > currentStep && !validateStep(currentStep)) return;

        currentStep = step;

        // Adımları gizle/göster
        for (let i = 1; i <= totalSteps; i++) {
            const el = document.getElementById(`step-${i}`);
            if (el) {
                if (i === step) { el.classList.remove('hidden'); }
                else { el.classList.add('hidden'); }
            }
        }

        // Progress bar güncelle
        document.querySelectorAll('.step-dot').forEach(dot => {
            const s = parseInt(dot.dataset.step);
            dot.classList.remove('active', 'completed');
            if (s === step) dot.classList.add('active');
            else if (s < step) dot.classList.add('completed');
        });

        const c1 = document.getElementById('connector-1');
        const c2 = document.getElementById('connector-2');
        if (c1) { c1.classList.toggle('completed', step > 1); c1.classList.toggle('active', step >= 1); }
        if (c2) { c2.classList.toggle('completed', step > 2); c2.classList.toggle('active', step >= 2); }

        // Footer butonları güncelle
        const prevBtn = document.getElementById('btn-prev-step');
        const nextBtn = document.getElementById('btn-next-step');
        const submitBtnEl = document.getElementById('submit-btn');

        if (prevBtn) prevBtn.classList.toggle('hidden', step === 1);
        if (nextBtn) nextBtn.classList.toggle('hidden', step === totalSteps);
        if (submitBtnEl) {
            submitBtnEl.classList.toggle('hidden', step !== totalSteps);
            if (step === totalSteps) submitBtnEl.classList.add('flex');
            else submitBtnEl.classList.remove('flex');
        }

        // Step indicator güncelle
        const indicator = document.getElementById('step-indicator');
        const title = document.getElementById('step-title');
        if (indicator) indicator.textContent = `ADIM ${step} / ${totalSteps}`;
        if (title) title.textContent = stepTitles[step] || '';

        // Seçim özetini güncelle (Step 3'te)
        if (step === totalSteps) updateSelectionSummary();

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const validateStep = (step) => {
        if (step === 1) {
            const name = document.getElementById('c_name');
            if (!name || !name.value.trim()) {
                name.focus();
                name.classList.add('border-red-500');
                setTimeout(() => name.classList.remove('border-red-500'), 2000);
                return false;
            }
            return true;
        }
        if (step === 2) {
            // Medya zorunlu değil — opsiyonel bırakabiliriz veya uyarı verebiliriz
            // Mevcut mantıkta submit anında kontrol ediliyor, burada geçiş serbest
            return true;
        }
        return true;
    };

    // ==========================================
    // PERSONA ARAMA (Debounced)
    // ==========================================
    let searchTimeout = null;
    const filterPersonas = () => {
        const searchInput = document.getElementById('persona-search');
        const term = (searchInput?.value || '').toLowerCase().trim();
        
        // Aktif SES/gen chip filtrelerini oku
        const activeFilters = { ses: [], gen: [] };
        document.querySelectorAll('.filter-chip.active').forEach(chip => {
            const type = chip.dataset.filterType;
            const value = chip.dataset.filterValue;
            if (type && value) {
                activeFilters[type] = activeFilters[type] || [];
                activeFilters[type].push(value);
            }
        });

        const cards = document.querySelectorAll('.persona-card');
        let visibleCount = 0;

        cards.forEach(card => {
            const searchStr = card.dataset.search || '';
            const ses = card.dataset.ses || '';
            const gen = card.dataset.generation || '';

            let matchSearch = !term || searchStr.includes(term);
            let matchSES = activeFilters.ses.length === 0 || activeFilters.ses.includes(ses);
            let matchGen = activeFilters.gen.length === 0 || activeFilters.gen.includes(gen);

            if (matchSearch && matchSES && matchGen) {
                card.classList.remove('hidden');
                visibleCount++;
            } else {
                card.classList.add('hidden');
            }
        });
    };

    // ==========================================
    // QUICK FILTER CHİP'LERİ
    // ==========================================
    const initFilterChips = () => {
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                chip.classList.toggle('active');
                filterPersonas();
            });
        });
    };

    // ==========================================
    // TÜMÜNÜ SEÇ / TEMİZLE
    // ==========================================
    const selectAllVisible = () => {
        document.querySelectorAll('.persona-card:not(.hidden) .persona-checkbox').forEach(cb => {
            cb.checked = true;
        });
        updatePersonaCount();
    };

    const deselectAll = () => {
        document.querySelectorAll('.persona-checkbox').forEach(cb => {
            cb.checked = false;
        });
        // Segment checkbox'ları da temizle
        document.querySelectorAll('.segment-checkbox').forEach(cb => {
            cb.checked = false;
        });
        updatePersonaCount();
    };

    // ==========================================
    // SEÇİM ÖZETİ
    // ==========================================
    const updateSelectionSummary = () => {
        const summary = document.getElementById('selection-summary');
        if (!summary) return;

        const personaCount = document.querySelectorAll('.persona-checkbox:checked').length;
        const channelCount = document.querySelectorAll('.channel-checkbox:checked').length;
        const hasMedia = !!(compressedBlob || (selectedMediaType === 'video' && selectedFile));

        const sp = document.getElementById('summary-personas');
        const sc = document.getElementById('summary-channels');
        const sm = document.getElementById('summary-media');

        if (sp) sp.innerHTML = `<span class="${personaCount > 0 ? 'text-green-400' : 'text-red-400'}">${personaCount}</span> persona seçildi`;
        if (sc) sc.innerHTML = `<span class="${channelCount > 0 ? 'text-green-400' : 'text-gray-500'}">${channelCount}</span> kanal seçildi`;
        if (sm) sm.innerHTML = hasMedia ? '<span class="text-green-400">✓</span> Medya yüklendi' : '<span class="text-yellow-400">⚠</span> Medya yüklenmedi';

        summary.classList.remove('hidden');
    };

    // ==========================================
    // WIZARD INITIALIZATION
    // ==========================================
    const initWizard = () => {
        // İleri/geri butonları
        const prevBtn = document.getElementById('btn-prev-step');
        const nextBtn = document.getElementById('btn-next-step');

        if (nextBtn) nextBtn.addEventListener('click', () => goToStep(currentStep + 1));
        if (prevBtn) prevBtn.addEventListener('click', () => goToStep(currentStep - 1));

        // Persona arama (debounced)
        const searchInput = document.getElementById('persona-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(filterPersonas, 150);
            });
        }

        // Quick filter chip'leri
        initFilterChips();

        // Tümünü seç / temizle
        const selectAllBtn = document.getElementById('btn-select-all');
        const deselectAllBtn = document.getElementById('btn-deselect-all');
        if (selectAllBtn) selectAllBtn.addEventListener('click', selectAllVisible);
        if (deselectAllBtn) deselectAllBtn.addEventListener('click', deselectAll);

        // İlk adımı göster
        goToStep(1);
    };

    // Başlangıç yüklemeleri
    await fetchSegments();
    await fetchPersonas();
    initChannelSelection();
    initWizard();
});
