import { supabase } from './supabase-config.js';

// Sabitler
const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_ANALYZE_WEBHOOK_URL;

document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Session Kontrolü (Sadece giriş yapanlar görebilir)
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
        window.location.href = 'index.html';
        return;
    }

    const currentUser = session.user;

    // Isı Haritası State
    let heatmapInstance = null;
    let isHeatmapActive = false;
    let currentSaliencyMat = null;

    // Analiz Makinesi — Global State
    let allAnalysisResults = null;
    let allOriginalResults = null;
    let demographicRendered = false;
    let personaFiltersInitialized = false;
    let chartInstances = {};

    // Utility: Yaştan kuşak belirle
    const getGeneration = (age) => {
        if (age <= 27) return 'Gen-Z';
        if (age <= 42) return 'Millennial';
        if (age <= 58) return 'Gen-X';
        return 'Boomer+';
    };

    // ==========================================
    // ISI HARİTASI (HEATMAP) MOTORU
    // ==========================================
    const runHeatmapAnalysis = async (imgElement) => {
        const statusEl = document.getElementById('heatmap-status');
        if (statusEl) statusEl.classList.remove('hidden');

        try {
            if (typeof cv === 'undefined' || !cv.Mat) {
                console.warn("OpenCV.js henüz yüklenmedi, bekleniyor...");
                setTimeout(() => runHeatmapAnalysis(imgElement), 1000);
                return;
            }

            // CORS Kontrolü (Canvas'a çizilemezse cv.imread hata verir)
            let src;
            try {
                src = cv.imread(imgElement);
            } catch (e) {
                console.error("CORS Error: Görsel başka bir domainden yüklendiği için analiz yapılamıyor.", e);
                if (statusEl) statusEl.classList.add('hidden');
                alert("Hata: Görsel güvenlik (CORS) nedeniyle analiz edilemiyor. Lütfen yerel bir dosya yükleyip tekrar deneyin.");
                return;
            }

            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            // Spectral Residual Saliency (Stabilize versiyon - 128x128)
            const smallSize = 128;
            const small = new cv.Mat();
            cv.resize(gray, small, new cv.Size(smallSize, smallSize), 0, 0, cv.INTER_AREA);
            
            const floatMat = new cv.Mat();
            small.convertTo(floatMat, cv.CV_32F);
            
            const planes = new cv.MatVector();
            planes.push_back(floatMat);
            planes.push_back(cv.Mat.zeros(smallSize, smallSize, cv.CV_32F));
            
            const complexMat = new cv.Mat();
            cv.merge(planes, complexMat);
            cv.dft(complexMat, complexMat);
            
            const mag = new cv.Mat();
            cv.split(complexMat, planes);
            cv.magnitude(planes.get(0), planes.get(1), mag);
            
            // Log Magnitude (add 1.0 to avoid log(0))
            const ones = cv.Mat.ones(smallSize, smallSize, cv.CV_32F);
            cv.add(mag, ones, mag);
            cv.log(mag, mag);
            
            const blurredMag = new cv.Mat();
            cv.boxFilter(mag, blurredMag, -1, new cv.Size(3, 3));
            
            const residual = new cv.Mat();
            cv.subtract(mag, blurredMag, residual);
            cv.exp(residual, residual);
            
            const saliency = new cv.Mat();
            cv.resize(residual, saliency, new cv.Size(src.cols, src.rows), 0, 0, cv.INTER_LINEAR);
            
            // Add text/edge attention (Canny)
            const edges = new cv.Mat();
            cv.Canny(gray, edges, 100, 200);
            const edgesFloat = new cv.Mat();
            edges.convertTo(edgesFloat, cv.CV_32F);
            cv.addWeighted(saliency, 0.7, edgesFloat, 0.3, 0, saliency);

            cv.normalize(saliency, saliency, 0, 255, cv.NORM_MINMAX, cv.CV_8U);

            if (statusEl) statusEl.classList.add('hidden');
            
            if (currentSaliencyMat) currentSaliencyMat.delete();
            currentSaliencyMat = saliency.clone();
            renderHeatmap(currentSaliencyMat);

            // Cleanup
            src.delete(); gray.delete(); small.delete(); floatMat.delete();
            planes.delete(); complexMat.delete(); mag.delete(); blurredMag.delete();
            residual.delete(); saliency.delete(); ones.delete();
            edges.delete(); edgesFloat.delete();

        } catch (err) {
            console.error("Heatmap Error:", err);
            if (statusEl) statusEl.classList.add('hidden');
        }
    };

    const renderHeatmap = (mat) => {
        const overlay = document.getElementById('heatmap-overlay');
        const imgElement = document.getElementById('cmp-img-element');
        if (!overlay || !imgElement) return;

        setTimeout(() => {
            const visualWidth = imgElement.clientWidth;
            const visualHeight = imgElement.clientHeight;

            if (visualWidth === 0 || visualHeight === 0) return;

            overlay.innerHTML = ''; 
            
            heatmapInstance = h337.create({
                container: overlay,
                radius: 25,
                maxOpacity: .6,
                minOpacity: 0,
                blur: .75
            });

            const points = [];
            const step = Math.max(Math.floor(mat.cols / 80), 2);
            const scaleX = visualWidth / mat.cols;
            const scaleY = visualHeight / mat.rows;

            for (let y = 0; y < mat.rows; y += step) {
                for (let x = 0; x < mat.cols; x += step) {
                    let val = mat.ucharAt(y, x);
                    if (val > 65) {
                        points.push({ 
                            x: Math.floor(x * scaleX), 
                            y: Math.floor(y * scaleY), 
                            value: val 
                        });
                    }
                }
            }

            if (points.length > 0) {
                heatmapInstance.setData({ max: 255, data: points });
            }
        }, 50);
    };

    const setupHeatmapToggle = () => {
        const btnToggle = document.getElementById('btn-toggle-heatmap');
        const dot = btnToggle?.querySelector('.dot');
        const img = document.getElementById('cmp-img-element');
        const overlay = document.getElementById('heatmap-overlay');

        if (!btnToggle || !img) return;

        btnToggle.onclick = (e) => {
            e.stopPropagation();
            isHeatmapActive = !isHeatmapActive;
            
            if (isHeatmapActive) {
                btnToggle.classList.remove('bg-gray-700');
                btnToggle.classList.add('bg-neon-cyan');
                if (dot) dot.style.transform = 'translateX(20px)';
                overlay.style.opacity = '1';
                
                if (currentSaliencyMat) {
                    renderHeatmap(currentSaliencyMat);
                } else {
                    runHeatmapAnalysis(img);
                }
            } else {
                btnToggle.classList.remove('bg-neon-cyan');
                btnToggle.classList.add('bg-gray-700');
                if (dot) dot.style.transform = 'translateX(0)';
                overlay.style.opacity = '0';
                overlay.innerHTML = '';
            }
        };
    };

    const resetHeatmapUI = () => {
        isHeatmapActive = false;
        if (currentSaliencyMat) {
            currentSaliencyMat.delete();
            currentSaliencyMat = null;
        }
        const btnToggle = document.getElementById('btn-toggle-heatmap');
        const dot = btnToggle?.querySelector('.dot');
        const overlay = document.getElementById('heatmap-overlay');
        
        if (btnToggle) {
            btnToggle.classList.remove('bg-neon-cyan');
            btnToggle.classList.add('bg-gray-700');
        }
        if (dot) dot.style.transform = 'translateX(0)';
        if (overlay) {
            overlay.style.opacity = '0';
            overlay.innerHTML = '';
        }
    };

    // UI Elementleri (Görünümler)
    const campaignsView = document.getElementById('campaigns-view');
    const loadingView = document.getElementById('loading-view');
    const resultsView = document.getElementById('results-view');
    
    // Butonlar ve Konteynerler
    const campaignsGrid = document.getElementById('campaigns-grid');
    const noCampaignsMsg = document.getElementById('no-campaigns-msg');
    const campaignCountDisplay = document.getElementById('campaign-count-display');
    const btnLogout = document.getElementById('btn-logout');
    const btnBackToCampaigns = document.getElementById('btn-back-to-campaigns');
    const navCampaignsBtn = document.getElementById('nav-campaigns-btn');
    
    // Yükleme Animasyonu (Sadece Sonuç Gösterimindeki Timer İçin)
    const loadingTimer = document.querySelector('#loading-timer span');
    let pollingIntervalId = null;

    // MİNİ ROUTING SİSTEMİ
    const showView = (viewElement) => {
        [campaignsView, loadingView, resultsView].forEach(v => {
            if(v) {
               v.classList.add('hidden');
               v.classList.remove('opacity-100');
               v.classList.add('opacity-0');
            }
        });
        viewElement.classList.remove('hidden');
        setTimeout(() => {
            viewElement.classList.remove('opacity-0');
            viewElement.classList.add('opacity-100');
        }, 50);
    };

    // ==========================================
    // ÇIKIŞ YAP VE NAVİGASYON
    // ==========================================
    if (btnLogout) {
        btnLogout.addEventListener('click', async (e) => {
            e.preventDefault();
            await supabase.auth.signOut();
            window.location.href = 'index.html';
        });
    }

    if (btnBackToCampaigns) {
        btnBackToCampaigns.addEventListener('click', (e) => {
            e.preventDefault();
            if(pollingIntervalId) clearInterval(pollingIntervalId);
            loadUserCampaigns();
            showView(campaignsView);
            // URL'deki ID'yi temizle
            window.history.replaceState({}, document.title, window.location.pathname);
        });
    }

    const btnDownloadPdf = document.getElementById('btn-download-pdf');
    if (btnDownloadPdf) {
        btnDownloadPdf.addEventListener('click', () => {
            if (typeof pdfMake === 'undefined') {
                alert('PDF kütüphanesi yüklenemedi. Lütfen internet bağlantınızı kontrol edip sayfayı yenileyin.');
                return;
            }

            if (!window.currentPdfData) {
                alert('Kampanya verisi henüz yüklenmedi.');
                return;
            }

            const { campaign, results, originalResults } = window.currentPdfData;
            
            const originalText = btnDownloadPdf.innerHTML;
            btnDownloadPdf.innerHTML = '<span class="material-symbols-outlined text-[16px] animate-spin">refresh</span> OLUŞTURULUYOR...';

            try {
                // PDF Document Definition (Data-based)
                const getAvg = (resData, key) => Math.round(resData.reduce((s, r) => s + (r[key]||0), 0) / resData.length);
                const att = getAvg(results, 'score_attention');
                const int = getAvg(results, 'score_interest');
                const des = getAvg(results, 'score_desire');
                const act = getAvg(results, 'score_action');
                
                let origAtt = null, origInt = null, origDes = null, origAct = null;
                if(originalResults && originalResults.length > 0) {
                     origAtt = getAvg(originalResults, 'score_attention');
                     origInt = getAvg(originalResults, 'score_interest');
                     origDes = getAvg(originalResults, 'score_desire');
                     origAct = getAvg(originalResults, 'score_action');
                }

                const dFormat = (val, orig) => orig !== null ? `${val}% (${val-orig>=0?'+':''}${val-orig})` : `${val}%`;

                const cCyan = '#00CED1';
                const cPurp = '#8A2BE2';
                const cMage = '#E83E8C';
                const cDark = '#343A40';
                const cGrey = '#6C757D';
                const cGreyL = '#F8F9FA';

                // Helpers
                const getProgressBar = (value, color) => {
                    const w = 400; 
                    const fillW = Math.max(0, Math.min((value / 100) * w, w));
                    return {
                        canvas: [
                            { type: 'rect', x: 0, y: 0, w: w, h: 8, r: 4, color: '#E9ECEF' },
                            { type: 'rect', x: 0, y: 0, w: fillW, h: 8, r: 4, color: color }
                        ],
                        margin: [0, 5, 0, 15]
                    };
                };

                const buyCount = results.filter(r => r.will_buy).length;
                const totalTarget = results.length;
                const buyRatio = Math.round((buyCount / totalTarget) * 100);

                const docDefinition = {
                    pageSize: 'A4',
                    pageMargins: [40, 40, 40, 40],
                    defaultStyle: {
                        font: 'Roboto'
                    },
                    content: [
                        // HEADER
                        {
                            columns: [
                                {
                                    stack: [
                                        { text: 'GÖZGÜ AI', fontSize: 24, bold: true, color: cCyan, letterSpacing: 3 },
                                        { text: 'REKLAM ANALİZ RAPORU', fontSize: 10, color: '#A0A0A0', margin: [0, 2, 0, 0] }
                                    ],
                                    width: '*'
                                },
                                {
                                    stack: [
                                        { text: new Date().toLocaleDateString('tr-TR'), fontSize: 9, color: '#A0A0A0', alignment: 'right' },
                                        { text: `ID: ${campaign.id ? campaign.id.substring(0,8) : 'sim'}`, fontSize: 9, color: cCyan, margin: [0, 2, 0, 0], alignment: 'right' }
                                    ],
                                    width: 100
                                }
                            ],
                            margin: [0, 0, 0, 10]
                        },
                        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: cCyan }], margin: [0, 0, 0, 20] },

                        // CAMPAIGN INFO
                        {
                            table: {
                                widths: ['50%', '50%'],
                                body: [
                                    [
                                        { text: campaign.name || '-', fontSize: 16, bold: true, colSpan: 2, border: [false, false, false, false], margin: [10, 10, 10, 5] },
                                        {}
                                    ],
                                    [
                                        { text: `"${campaign.ad_slogan || ''}"`, fontSize: 11, color: cCyan, colSpan: 2, border: [false, false, false, false], margin: [10, 0, 10, 15] },
                                        {}
                                    ],
                                    [
                                        { 
                                            stack: [
                                                { text: [{text:'Hedef: ', color: cGrey}, {text: campaign.objective || '-'}] },
                                                { text: [{text:'CTA: ', color: cGrey}, {text: campaign.call_to_action || '-'}] } 
                                            ],
                                            fontSize: 10,
                                            border: [false, false, false, false],
                                            margin: [10, 0, 0, 10]
                                        },
                                        {
                                            stack: [
                                                { text: [{text:'Marka Tonu: ', color: cGrey}, {text: campaign.brand_tone || '-'}] },
                                                { text: [{text:'Değer Teklifi: ', color: cGrey}, {text: campaign.value_proposition || '-'}] }
                                            ],
                                            fontSize: 10,
                                            border: [false, false, false, false],
                                            margin: [10, 0, 10, 10]
                                        }
                                    ]
                                ]
                            },
                            fillColor: cGreyL,
                            layout: 'noBorders',
                            margin: [0, 0, 0, 30]
                        },

                        // AIDA HEADER
                        {
                            columns: [
                                { canvas: [{type: 'rect', x: 0, y: 0, w: 4, h: 14, color: cCyan}], width: 10 },
                                { text: `AIDA METRİKLERİ (${results.length} Persona Ortalaması)`, fontSize: 11, bold: true, margin: [-5, 0, 0, 0], color: cDark }
                            ],
                            margin: [0, 0, 0, 15]
                        },

                        // DİKKAT
                        {
                            columns: [
                                { text: 'DİKKAT (Attention)', fontSize: 10, color: cGrey, bold: true },
                                { text: dFormat(att, origAtt), fontSize: 12, bold: true, color: cCyan, alignment: 'right' }
                            ]
                        },
                        getProgressBar(att, cCyan),

                        // İLGİ
                        {
                            columns: [
                                { text: 'İLGİ (Interest)', fontSize: 10, color: cGrey, bold: true },
                                { text: dFormat(int, origInt), fontSize: 12, bold: true, color: cPurp, alignment: 'right' }
                            ]
                        },
                        getProgressBar(int, cPurp),

                        // ARZU
                        {
                            columns: [
                                { text: 'ARZU (Desire)', fontSize: 10, color: cGrey, bold: true },
                                { text: dFormat(des, origDes), fontSize: 12, bold: true, color: cMage, alignment: 'right' }
                            ]
                        },
                        getProgressBar(des, cMage),

                        // AKSİYON
                        {
                            columns: [
                                { text: 'AKSİYON (Action)', fontSize: 10, color: cGrey, bold: true },
                                { text: dFormat(act, origAct), fontSize: 12, bold: true, color: cDark, alignment: 'right' }
                            ]
                        },
                        getProgressBar(act, cDark),

                        // SUMMARY SEPARATOR
                        {
                            canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#E9ECEF' }],
                            margin: [0, 10, 0, 10]
                        },

                        // SUMMARY SCORES
                        {
                            columns: [
                                { text: 'GENEL ORTALAMA', fontSize: 10, color: cGrey, margin: [0, 3, 0, 0] },
                                { text: dFormat(Math.round((att+int+des+act)/4), origAtt ? Math.round((origAtt+origInt+origDes+origAct)/4) : null), fontSize: 16, bold: true, color: cCyan, alignment: 'right' }
                            ]
                        },
                        {
                            columns: [
                                { text: 'SATIN ALMA ORANI', fontSize: 10, color: cGrey, margin: [0, 3, 0, 0] },
                                { text: `${buyRatio}% (${buyCount}/${totalTarget})`, fontSize: 14, bold: true, color: '#DC3545', alignment: 'right' }
                            ],
                            margin: [0, 10, 0, 20],
                            pageBreak: 'after' // Personaları 2. sayfaya aktar
                        },
                        
                        // EKONOMİK SAHNE (Yeni)
                        { text: 'EKONOMİK ORTAM', fontSize: 14, bold: true, color: cCyan, margin: [0, 0, 0, 10] },
                        { 
                            text: campaign.macro_economic_snapshots ? `Analiz Tarihi: ${new Date(campaign.macro_economic_snapshots.snapshot_date).toLocaleDateString('tr-TR')}
TÜFE: %${campaign.macro_economic_snapshots.cpi_annual_pct || '-'}
USD/TRY: ${campaign.macro_economic_snapshots.usd_try_rate || '-'}₺
Duygu Durumu: ${campaign.macro_economic_snapshots.economic_sentiment || '-'}` : 'Ekonomik veri bulunamadı.',
                            fontSize: 10, color: cGrey, margin: [0, 0, 0, 15] 
                        },
                        { text: 'AI Personalarına Verilen Ekonomik Sahne:', fontSize: 10, bold: true, color: cDark, margin: [0, 0, 0, 5] },
                        { text: results[0]?.economic_context_given ? '"' + results[0].economic_context_given.trim().replace(/\\n/g, '\\n') + '"' : 'Belirtilmemiş.', fontSize: 10, italics: true, color: cGrey, margin: [0, 0, 0, 20] },

                        // MEDYA ANALİZ BÖLÜMÜ
                        ...createPDFMediaSection(campaign),
                    ],
                    // FOOTER
                    footer: function(currentPage, pageCount) {
                        return {
                            columns: [
                                { text: 'Bu rapor Gözgü AI sistemi tarafından otomatik oluşturulmuştur.', fontSize: 8, color: '#ADB5BD' },
                                { text: 'GOZGU.AI', fontSize: 9, bold: true, color: cCyan, alignment: 'right' }
                            ],
                            margin: [40, 10, 40, 0]
                        };
                    }
                };

                // PERSONAS
                results.forEach(res => {
                    const p = res.personas;
                    let oRes = null;
                    if(originalResults) oRes = originalResults.find(o => o.persona_id === res.persona_id);
                    
                    let buyText = res.will_buy ? '✓ ALIR' : 'X ALMAZ';
                    let buyColor = res.will_buy ? '#28A745' : '#DC3545';
                    if(oRes && res.will_buy !== oRes.will_buy) {
                         buyText += ` (Eskiden: ${oRes.will_buy ? 'Alır' : 'Almaz'})`;
                    }

                    const card = {
                        table: {
                            widths: ['*'],
                            body: [
                                [
                                    {
                                        stack: [
                                            {
                                                columns: [
                                                    { text: p.name, fontSize: 12, bold: true, color: cDark },
                                                    { text: buyText, fontSize: 11, bold: true, color: buyColor, alignment: 'right' }
                                                ]
                                            },
                                            { text: `${p.age} Yaş | ${p.job_title} | ${p.primary_archetype} | ${p.ses_group || 'SES'} / ${(p.monthly_income_band || '').replace(/_/g, ' ')}`, fontSize: 9, color: cGrey, margin: [0, 2, 0, 10] },
                                            
                                            { text: [{text: 'Baskın Duygu:   ', color: cMage, fontSize: 10, bold: true}, {text: res.dominant_emotion, fontSize: 10, color: cDark}], margin: [0, 0, 0, 5] },
                                            { text: [{text: 'Hızlı Tepki:       ', color: cCyan, fontSize: 10, bold: true}, {text: `"${res.reaction_fast}"`, fontSize: 10, color: cGrey, italics: true}], margin: [0, 0, 0, 5] },
                                            { text: [{text: 'Derin Analiz:     ', color: cMage, fontSize: 10, bold: true}, {text: `"${res.reaction_slow}"`, fontSize: 10, color: cDark}], margin: [0, 0, 0, 5] },
                                            { text: [{text: 'Nihai Karar:       ', color: cDark, fontSize: 10, bold: true}, {text: `"${res.final_verdict}"`, fontSize: 10, color: cDark}], margin: [0, 0, 0, 15] },
                                            
                                            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 1, lineColor: '#E9ECEF' }], margin: [0, 0, 0, 5] },
                                            {
                                                text: `DİKKAT: ${res.score_attention} | İLGİ: ${res.score_interest} | ARZU: ${res.score_desire} | AKSİYON: ${res.score_action}`,
                                                fontSize: 8, color: cGrey
                                            }
                                        ]
                                    }
                                ]
                            ]
                        },
                        layout: {
                            hLineWidth: function () { return 1; },
                            vLineWidth: function () { return 1; },
                            hLineColor: function () { return '#DEE2E6'; },
                            vLineColor: function () { return '#DEE2E6'; },
                            paddingLeft: function() { return 15; },
                            paddingRight: function() { return 15; },
                            paddingTop: function() { return 15; },
                            paddingBottom: function() { return 15; }
                        },
                        margin: [0, 0, 0, 15]
                    };
                    
                    docDefinition.content.push(card);
                });

                let filenameName = (campaign.name || 'Rapor').replace(/[^a-zA-Z0-9_\-]/g,'');
                pdfMake.createPdf(docDefinition).download(`GozguAI_${filenameName}.pdf`);
                btnDownloadPdf.innerHTML = originalText;
                
            } catch (err) {
                console.error("PDF generation err", err);
                alert("PDF oluşturulurken hata meydana geldi.");
                btnDownloadPdf.innerHTML = originalText;
            }
        });
    }

    if (navCampaignsBtn) {
        navCampaignsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if(pollingIntervalId) clearInterval(pollingIntervalId);
            loadUserCampaigns();
            showView(campaignsView);
            window.history.replaceState({}, document.title, window.location.pathname);
        });
    }



    // ==========================================
    // KAMPANYALARIM LİSTESİ
    // ==========================================
    const loadUserCampaigns = async () => {
        try {
            const { data: campaigns, error } = await supabase
                .from('campaigns')
                .select('*')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            campaignCountDisplay.innerText = campaigns.length;

            if (campaigns.length === 0) {
                campaignsGrid.classList.add('hidden');
                noCampaignsMsg.classList.remove('hidden');
                noCampaignsMsg.classList.add('flex');
            } else {
                noCampaignsMsg.classList.add('hidden');
                noCampaignsMsg.classList.remove('flex');
                campaignsGrid.classList.remove('hidden');
                
                campaignsGrid.innerHTML = '';
                campaigns.forEach(c => {
                    const isPending = c.status === 'pending';
                    const isFailed = c.status === 'failed';
                    
                    let statusColor = 'neon-cyan';
                    let statusText = 'TAMAMLANDI';
                    let statusIcon = 'done_all';
                    let spinClass = '';

                    if (isPending) {
                        statusColor = 'neon-magenta';
                        statusText = 'ANALİZ EDİLİYOR';
                        statusIcon = 'autorenew';
                        spinClass = 'animate-spin';
                    } else if (isFailed) {
                        statusColor = 'red-500';
                        statusText = 'BAŞARISIZ';
                        statusIcon = 'error';
                    }

                    // Eğer AI tarafından optimize edilmişse ve tamamlanmışsa farklı metin göster
                    if (c.is_ai_optimized && !isPending && !isFailed) {
                        statusText = 'AI OLUŞTURDU';
                        statusColor = 'neon-cyan'; 
                    }

                    const aiBadge = c.is_ai_optimized ? `<span class="bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-[8px] px-1.5 py-0.5 font-bold tracking-widest leading-none ml-2 uppercase rounded-full shadow-[0_0_10px_rgba(99,102,241,0.2)] whitespace-nowrap">AI OPTIMIZED</span>` : '';
                    const card = `
                    <div class="hud-border p-5 hover:-translate-y-1 transition-transform cursor-pointer group" data-id="${c.id}">
                        <div class="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-r from-transparent via-${statusColor}/50 to-transparent"></div>
                        <div class="flex justify-between items-start mb-4 gap-3">
                            <h3 class="font-cyber font-bold text-lg text-white group-hover:text-${statusColor} transition-colors uppercase truncate flex-1 min-width-0 flex items-center pr-2">
                                <span class="truncate">${c.name}</span>
                                ${aiBadge}
                            </h3>
                            <div class="flex-shrink-0 flex items-center gap-1 text-[10px] font-mono border border-${statusColor}/30 bg-${statusColor}/10 text-${statusColor} px-2 py-1 rounded-sm whitespace-nowrap h-fit">
                                <span class="material-symbols-outlined text-[12px] ${spinClass}">${statusIcon}</span>
                                ${statusText}
                            </div>
                        </div>
                        <p class="text-xs text-gray-400 font-mono mb-4 h-8 overflow-hidden line-clamp-2">"${c.ad_slogan}"</p>
                        <div class="flex justify-between items-end border-t border-white/5 pt-3">
                            <div>
                                <span class="block text-[8px] text-gray-500 font-mono uppercase mb-0.5">Objective</span>
                                <span class="block text-[10px] text-gray-300 font-tech uppercase">${c.objective}</span>
                            </div>
                            <button class="text-[10px] font-mono text-neon-cyan/70 hover:text-neon-cyan group-hover:underline flex items-center gap-1 uppercase">
                                View Intel <span class="material-symbols-outlined text-[12px]">arrow_forward</span>
                            </button>
                        </div>
                    </div>
                    `;
                    campaignsGrid.innerHTML += card;
                });

                // Tıklanma Eventleri
                document.querySelectorAll('#campaigns-grid > div').forEach(card => {
                    card.addEventListener('click', () => {
                        const id = card.getAttribute('data-id');
                        window.history.pushState({}, '', `?id=${id}`);
                        startPollingCampaign(id);
                    });
                });
            }

        } catch (err) {
            console.error("Error loading campaigns:", err);
        }
    };

    // ==========================================
    // DETAY VE POLLING (Eski dashboard.js logic)
    // ==========================================
    const startPollingCampaign = (campaignId) => {
        showView(loadingView);
        
        let secondsPassed = 0;
        const MAX_POLL_SECONDS = 100; // 100 saniye zaman aşımı (DB Cron Job ile uyumlu)
        
        loadingTimer.innerText = '0s';
        if(pollingIntervalId) clearInterval(pollingIntervalId);
        
        pollingIntervalId = setInterval(() => {
            secondsPassed++;
            loadingTimer.innerText = secondsPassed + 's';
            
            // Frontend Sadece Görsel Zaman Aşımı Verir, DB Güncellemesini Supabase Cron Job Yapar
            if (secondsPassed >= MAX_POLL_SECONDS) {
                console.error("Timeout: Analysis took too long (Over 100s)");
                clearInterval(pollingIntervalId);
                pollingIntervalId = null;
                
                alert("Sistem Mesajı: Analiz zaman aşımına uğradı (100 saniye sınırı). Lütfen n8n sunucusunu kontrol edin.");
                window.history.replaceState({}, document.title, window.location.pathname);
                loadUserCampaigns();
                showView(campaignsView);
            }
        }, 1000);

        const fetchCampaignData = async () => {
            // Eğer setInterval durdurulmuşsa (timeout vs), artık fetch yapma
            if (!pollingIntervalId) return;

            try {
                // Statüyü kontrol et
                const { data: campaign, error: cErr } = await supabase
                    .from('campaigns')
                    .select('*, macro_economic_snapshots(*)')
                    .eq('id', campaignId)
                    .single();

                if (cErr) throw cErr;

                // Eğer zaman aşımına düştüyse veya admin panelden iptal edildiyse
                if (campaign.status === 'failed') {
                     clearInterval(pollingIntervalId);
                     alert("Sistem Mesajı: Bu kampanya analizi başarısız oldu.");
                     window.history.replaceState({}, document.title, window.location.pathname);
                     loadUserCampaigns();
                     showView(campaignsView);
                     return;
                }

                if (campaign.status !== 'completed') {
                    // Hala "pending"
                    setTimeout(fetchCampaignData, 3000);
                    return;
                }

                // "completed" ise sonuçları al
                const { data: results, error: rErr } = await supabase
                    .from('analysis_results')
                    .select('*, personas(*)')
                    .eq('campaign_id', campaignId);

                if (rErr) throw rErr;

                let originalResults = null;
                if (campaign.is_ai_optimized && campaign.original_campaign_id) {
                    const { data: origRes } = await supabase
                        .from('analysis_results')
                        .select('*')
                        .eq('campaign_id', campaign.original_campaign_id);
                    if (origRes && origRes.length > 0) {
                        originalResults = origRes;
                    }
                }

                // Global veri kaydı
                window.currentPdfData = {
                    campaign,
                    results,
                    originalResults
                };

                // Analiz Makinesi global state
                allAnalysisResults = results;
                allOriginalResults = originalResults;
                demographicRendered = false;
                personaFiltersInitialized = false;

                clearInterval(pollingIntervalId);
                showView(resultsView);

                // Tab sistemini başlat
                initTabs();

                // Ekonomik ortam panelini renderla
                await renderEconomyPanel(campaign.macro_economic_snapshots, results);
                // Trend Radar panelini renderla (Yeni Eklenen Adım)
                await renderTrendRadar(campaign);

                renderCampaignDetails(campaign);
                renderAggregateMetrics(results, originalResults);
                renderConversionFunnel(results);
                renderWillBuyDonutChart(results);
                renderOverviewStats(results);
                await renderSegmentInsights(results, originalResults);
                renderMediaBudget(results);
                renderPersonaIntel(results, originalResults);
                initPersonaFilters();
                await initOptimizationUI(campaignId);

            } catch (err) {
                console.error("Data fetch error:", err);
                clearInterval(pollingIntervalId);
                alert("Sonuçlar getirilemedi: " + err.message);
                showView(campaignsView);
            }
        };

        fetchCampaignData();
    };

    const renderEconomyPanel = async (snapshotData, results) => {
        const panel = document.getElementById('eco-env-panel');
        if (!panel) return;

        let data = snapshotData;

        // Eğer mevcut kampanyanın snapshot verisi yoksa, tablodan en son ekleneni çek
        if (!data) {
            const { data: latestEco, error } = await supabase
                .from('macro_economic_snapshots')
                .select('*')
                .order('snapshot_date', { ascending: false })
                .limit(1)
                .single();
                
            if (latestEco && !error) {
                data = latestEco;
            }
        }

        if (!data) {
            panel.classList.add('hidden');
            return;
        }

        panel.classList.remove('hidden');

        // Tarih Formatı
        const dateObj = new Date(data.snapshot_date);
        const options = { day: 'numeric', month: 'long', year: 'numeric' };
        const dateStr = dateObj.toLocaleDateString('tr-TR', options).toUpperCase();
        
        document.getElementById('eco-source-date').innerText = `TCMB_EVDS // ${dateStr}`;
        document.getElementById('eco-sentiment').innerText = data.economic_sentiment || 'DURAĞAN';

        // Veriler
        document.getElementById('eco-cpi').innerText = data.cpi_annual_pct ? `${data.cpi_annual_pct}%` : '--%';
        document.getElementById('eco-usd').innerText = data.usd_try_rate ? `${data.usd_try_rate}₺` : '--₺';
        document.getElementById('eco-eur').innerText = data.eur_try_rate ? `${data.eur_try_rate}₺` : '--₺';
        document.getElementById('eco-rate').innerText = data.policy_rate_pct ? `${data.policy_rate_pct}%` : '--%';
        document.getElementById('eco-conf').innerText = data.consumer_confidence_idx ? `${data.consumer_confidence_idx}` : '--';
        document.getElementById('eco-unemp').innerText = data.unemployment_rate_pct ? `${data.unemployment_rate_pct}%` : '--%';
        
        const powerStr = data.real_purchasing_power ? data.real_purchasing_power.replace('_', ' ').toUpperCase() : 'ORTA';
        document.getElementById('eco-power').innerText = powerStr;

        // Ekonomik Sahne Önizlemesi Göster/Gizle İşlemleri
        const ecoScenePreview = document.getElementById('eco-scene-preview');
        const ecoSceneContent = document.getElementById('eco-scene-content');
        if (results && results.length > 0 && results[0].economic_context_given) {
             if (ecoSceneContent) ecoSceneContent.innerText = results[0].economic_context_given.replace(/\\n/g, '\n');
             if (ecoScenePreview) ecoScenePreview.classList.remove('hidden');
        } else {
             if (ecoScenePreview) ecoScenePreview.classList.add('hidden');
        }

        const btnToggleEcoScene = document.getElementById('btn-toggle-eco-scene');
        if (btnToggleEcoScene && !btnToggleEcoScene.dataset.listener) {
             btnToggleEcoScene.dataset.listener = 'true';
             btnToggleEcoScene.addEventListener('click', () => {
                 ecoSceneContent.classList.toggle('hidden');
                 const arrow = document.getElementById('eco-scene-arrow');
                 arrow.style.transform = ecoSceneContent.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
             });
        }
    };

    // ==========================================
    // GERÇEK ZAMANLI GÜNDEM (TREND RADARI)
    // ==========================================
    const renderTrendRadar = async (campaign) => {
        const panel = document.getElementById('trend-radar-panel');
        if (!panel) return;

        let snapshot = null;
        
        // 1. Kampanyaya bağlı snapshot var mı?
        if (campaign.trend_snapshot_id) {
            const { data } = await supabase.from('cultural_trend_snapshots').select('*').eq('id', campaign.trend_snapshot_id).single();
            snapshot = data;
        }

        // 2. Yoksa en sonuncuyu almayı dene
        if (!snapshot) {
            const { data } = await supabase.from('cultural_trend_snapshots').select('*').order('snapshot_date', { ascending: false }).limit(1).single();
            snapshot = data;
        }

        // 3. Hala yoksa (Veritabanı var ama n8n veri basmadıysa), UI'ın çalışması için sahte MOCK data üret
        if (!snapshot) {
            snapshot = {
                snapshot_date: new Date().toISOString(),
                trending_topics: ['#Ekonomi', 'Orman Yangınları', 'Fenerbahçe'],
                societal_mood: 'Karmaşık / Hassas',
                risk_level: 70
            };
        }

        panel.classList.remove('hidden');

        // Tarih
        const dateObj = new Date(snapshot.snapshot_date);
        document.getElementById('trend-source-date').innerText = `X & Google Trends // ${dateObj.toLocaleDateString('tr-TR')} ${dateObj.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}`;
        
        // Duygu Durumu
        document.getElementById('trend-societal-mood').innerText = snapshot.societal_mood || 'Belirsiz';
        
        const topicsList = document.getElementById('trend-topics-list');
        topicsList.innerHTML = '';
        
        // Supabase veya N8N'den kaynaklı string array gelme ihtimaline karşı güvenlik Parse'ı
        let topicsArray = snapshot.trending_topics || [];
        if (typeof topicsArray === 'string') {
            try { topicsArray = JSON.parse(topicsArray); } catch(e) { topicsArray = []; }
        }

        topicsArray.forEach((topic, idx) => {
            const colors = ['border-blue-500/50 text-blue-400', 'border-purple-500/50 text-purple-400', 'border-emerald-500/50 text-emerald-400'];
            const clr = colors[idx % colors.length];
            topicsList.innerHTML += `<span class="border bg-white/5 px-2 py-1 text-[10px] font-cyber tracking-wider rounded-sm ${clr}">${topic}</span>`;
        });

        // Risk Skoru ve Analiz Texti
        const riskScoreObj = document.getElementById('trend-risk-score');
        const textObj = document.getElementById('trend-analysis-text');
        
        let riskScore = campaign.trend_risk_score;
        let analysisText = campaign.trend_risk_analysis;

        // DB'de kampanya bazlı risk analizi henüz yoksa (eski kampanyalar veya simülasyon)
        if (riskScore === null || riskScore === undefined || !analysisText) {
            // Eğer yeni sistemden 0-100 arası risk level geldiyse onu kullan. Yoksa rastgele oluştur.
            let baseRisk = snapshot.risk_level || 50; 
            if (baseRisk > 60) {
                riskScore = baseRisk; // 60+ (Yüksek Risk)
                analysisText = "DİKKAT: Ülke gündemindeki gerginlik sebebiyle AI Guardrail, bu kreatif için yüksek linç potansiyeli tespit etti. Kampanya tonunun mevcut trendler ile örtüşmediği görülüyor.";
            } else {
                riskScore = baseRisk;  // Düşük/Orta Risk
                analysisText = "Kampanya tonu, mevcut sükunet ve trend başlıkları ile uyumlu. Gündeme ters düşen veya tepki çekebilecek majör bir mantıksızlık saptanmadı. Yayınlanması genel hatlarıyla güvenli.";
            }
        }

        riskScoreObj.innerText = `%${riskScore}`;
        
        // Risklere Göre Renklendirme
        if (riskScore > 50) {
            riskScoreObj.className = "text-rose-500 font-bold";
            textObj.parentElement.className = "bg-rose-500/10 border border-rose-500/20 p-2 rounded-sm w-full";
        } else {
            riskScoreObj.className = "text-emerald-400 font-bold";
            textObj.parentElement.className = "bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-sm w-full flex items-start gap-3";
            const icon = textObj.parentElement.querySelector('span.material-symbols-outlined');
            if(icon) {
                icon.className = "material-symbols-outlined text-emerald-400 text-xl flex-shrink-0";
                icon.innerText = "verified_user";
            }
        }
        textObj.innerText = analysisText;
    };


    const renderCampaignDetails = (c) => {
        const aiBadge = c.is_ai_optimized ? `<span class="bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-[10px] px-2 py-0.5 font-bold tracking-widest leading-none ml-3 uppercase rounded-full shadow-[0_0_10px_rgba(99,102,241,0.2)]">AI OPTIMIZED CONCEPT</span>` : '';
        document.getElementById('cmp-id').innerText = c.id.substring(0, 8);
        const nameEl = document.getElementById('cmp-name');
        nameEl.innerHTML = (c.name || 'İsimsiz') + aiBadge;
        document.getElementById('cmp-slogan').innerText = c.ad_slogan || 'Slogan/Başlık bulunmuyor.';
        document.getElementById('cmp-obj').innerText = c.objective || '-';
        
        // Yeni Bağlamsal Veriler
        document.getElementById('cmp-tone').innerText = c.brand_tone || 'Belirtilmemiş';
        document.getElementById('cmp-cta').innerText = c.call_to_action || 'Belirtilmemiş';
        
        const vpEl = document.getElementById('cmp-value-prop');
        vpEl.innerText = c.value_proposition || '-';
        vpEl.title = c.value_proposition || '';

        document.getElementById('cmp-target').innerText = c.intended_audience_desc || 'Özel hedef kitle notu girilmemiş.';
        document.getElementById('cmp-guidelines').innerText = c.brand_guidelines || 'Herhangi bir marka kısıtlaması/kuralı belirtilmemiş.';

        // Kanal badge'leri render et
        const channelsDisplay = document.getElementById('cmp-channels-display');
        if (channelsDisplay && c.channel_type) {
            const channelColors = { DISPLAY: 'neon-cyan', STORIES: 'neon-magenta', FEEDS: 'neon-violet', EMAIL: 'white', WEB_UI: 'neon-cyan' };
            const channelNames = { DISPLAY: 'Görüntülü', STORIES: 'Hikayeler', FEEDS: 'Akışlar', EMAIL: 'E-Posta', WEB_UI: 'Web' };
            channelsDisplay.innerHTML = c.channel_type.split(',').map(ch => {
                const tag = ch.trim();
                const color = channelColors[tag] || 'gray-400';
                const name = channelNames[tag] || tag;
                return `<span class="text-[8px] font-mono text-${color} border border-${color}/30 bg-${color}/5 px-2 py-0.5 uppercase">${name}</span>`;
            }).join('');
        }

        if(c.media_url) {
            document.getElementById('cmp-img-element').src = c.media_url;
        } else {
            document.getElementById('cmp-img-element').src = '';
        }

        // Isı haritası UI'ını her seferinde tertemiz başlat
        resetHeatmapUI();

        // Medya AI Analizi panelini render et
        renderMediaAnalysis(c);

        // Video Player toggle
        renderVideoPlayer(c);

        // Eğer zaten optimize edilmiş bir kampanya ise optimizasyon panelini gizle
        const optContainer = document.getElementById('optimization-container');
        if (optContainer) {
            if (c.is_ai_optimized) {
                optContainer.classList.add('hidden');
            } else {
                // Sadece tamamlanmış ve optimize edilmemişse gösterilir (initOptimizationUI içinde de kontrol var)
                optContainer.classList.remove('hidden');
            }
        }
    };

    const renderAggregateMetrics = (resArray, originalResArray) => {
        if (!resArray || resArray.length === 0) return;
        
        let att = 0, int = 0, des = 0, act = 0;
        
        resArray.forEach(r => {
            att += r.score_attention || 0;
            int += r.score_interest || 0;
            des += r.score_desire || 0;
            act += r.score_action || 0;
        });

        const len = resArray.length;
        const avg = (val) => Math.round(val / len);

        let origAvg = { att: null, int: null, des: null, act: null };
        if (originalResArray && originalResArray.length > 0) {
            let oAtt = 0, oInt = 0, oDes = 0, oAct = 0;
            originalResArray.forEach(r => {
                oAtt += r.score_attention || 0;
                oInt += r.score_interest || 0;
                oDes += r.score_desire || 0;
                oAct += r.score_action || 0;
            });
            const oLen = originalResArray.length;
            origAvg.att = Math.round(oAtt / oLen);
            origAvg.int = Math.round(oInt / oLen);
            origAvg.des = Math.round(oDes / oLen);
            origAvg.act = Math.round(oAct / oLen);
        }

        const metricsHTML = `
           ${createMetricBar('DİKKAT', avg(att), 'neon-cyan', origAvg.att)}
           ${createMetricBar('İLGİ', avg(int), 'neon-violet', origAvg.int)}
           ${createMetricBar('ARZU', avg(des), 'neon-magenta', origAvg.des)}
           ${createMetricBar('AKSİYON', avg(act), 'white', origAvg.act)}
        `;
        document.getElementById('avg-metrics').innerHTML = metricsHTML;
    };

    const createMetricBar = (label, score, colorClass, origScore) => {
        let deltaHtml = '';
        if (origScore !== undefined && origScore !== null) {
            const delta = score - origScore;
            let badgeClass = 'text-gray-500';
            let icon = '-';
            let formattedDelta = '0%';
            
            if (delta > 0) {
                badgeClass = 'text-green-400';
                icon = '↑';
                formattedDelta = `+${delta}%`;
            } else if (delta < 0) {
                badgeClass = 'text-red-400';
                icon = '↓';
                formattedDelta = `${delta}%`;
            }
            
            deltaHtml = `<div class="text-[10px] font-mono mt-1 whitespace-nowrap"><span class="text-gray-500 mr-2">ORJ: %${origScore}</span><span class="${badgeClass} font-bold tracking-wider">${icon} ${formattedDelta}</span></div>`;
        }

        return `
        <div class="hud-border p-4 flex flex-col justify-between">
            <div class="flex justify-between items-start mb-2 gap-2">
                <div>
                    <span class="text-xs text-gray-400 font-mono block mb-1">${label}</span>
                    ${deltaHtml}
                </div>
                <span class="text-[24px] font-cyber text-${colorClass} leading-none mt-1">${score}%</span>
            </div>
            <div class="w-full h-2 bg-gray-800 progress-bar-bg mt-2">
                <div class="h-full bg-${colorClass} animate-pulse-fast" style="width: ${score}%"></div>
            </div>
        </div>
        `;
    };

    const renderSegmentInsights = async (resArray, originalResArray) => {
        const container = document.getElementById('segment-summary-list');
        const view = document.getElementById('segment-insights-view');
        if (!container || !view) return;

        try {
            // 1. Tüm segment-persona ilişkilerini çek
            const { data: segmentMap, error } = await supabase
                .from('segment_personas')
                .select('segment_id, segments(name, icon, color_theme), persona_id');

            if (error) throw error;

            // 2. Sonuçlardaki personaları segmentlere göre grupla
            const segmentScores = {};
            
            resArray.forEach(res => {
                const personaSegments = segmentMap.filter(sm => sm.persona_id === res.persona_id);
                personaSegments.forEach(sm => {
                    const segId = sm.segment_id;
                    if (!segmentScores[segId]) {
                        segmentScores[segId] = {
                            name: sm.segments.name,
                            icon: sm.segments.icon,
                            color: sm.segments.color_theme,
                            count: 0,
                            att: 0, int: 0, des: 0, act: 0
                        };
                    }
                    segmentScores[segId].count++;
                    segmentScores[segId].att += res.score_attention || 0;
                    segmentScores[segId].int += res.score_interest || 0;
                    segmentScores[segId].des += res.score_desire || 0;
                    segmentScores[segId].act += res.score_action || 0;
                });
            });

            const originalSegmentScores = {};
            if (originalResArray && originalResArray.length > 0) {
                originalResArray.forEach(res => {
                    const personaSegments = segmentMap.filter(sm => sm.persona_id === res.persona_id);
                    personaSegments.forEach(sm => {
                        const segId = sm.segment_id;
                        if (!originalSegmentScores[segId]) {
                            originalSegmentScores[segId] = {
                                count: 0, att: 0, int: 0, des: 0, act: 0
                            };
                        }
                        originalSegmentScores[segId].count++;
                        originalSegmentScores[segId].att += res.score_attention || 0;
                        originalSegmentScores[segId].int += res.score_interest || 0;
                        originalSegmentScores[segId].des += res.score_desire || 0;
                        originalSegmentScores[segId].act += res.score_action || 0;
                    });
                });
            }

            // 3. Render
            const segmentIds = Object.keys(segmentScores);
            if (segmentIds.length === 0) {
                view.classList.add('hidden');
                return;
            }

            view.classList.remove('hidden');
            container.innerHTML = segmentIds.map(id => {
                const s = segmentScores[id];
                const avg = (val) => Math.round(val / s.count);
                const totalAvg = Math.round((avg(s.att) + avg(s.int) + avg(s.des) + avg(s.act)) / 4);
                
                let origAvg = { att: null, int: null, des: null, act: null, total: null };
                const os = originalSegmentScores[id];
                if (os) {
                    const oAvg = (val) => Math.round(val / os.count);
                    origAvg.att = oAvg(os.att);
                    origAvg.int = oAvg(os.int);
                    origAvg.des = oAvg(os.des);
                    origAvg.act = oAvg(os.act);
                    origAvg.total = Math.round((origAvg.att + origAvg.int + origAvg.des + origAvg.act) / 4);
                }

                let totalDeltaHtml = '';
                if (origAvg.total !== null) {
                    const delta = totalAvg - origAvg.total;
                    if (delta > 0) totalDeltaHtml = `<span class="text-[10px] text-green-400 font-mono ml-2">↑ +${delta}%</span>`;
                    else if (delta < 0) totalDeltaHtml = `<span class="text-[10px] text-red-400 font-mono ml-2">↓ ${delta}%</span>`;
                }

                return `
                <div class="hud-border p-4 bg-black/60 border-${s.color}/20">
                    <div class="flex items-center gap-2 mb-3">
                        <span class="material-symbols-outlined text-${s.color} text-sm">${s.icon || 'groups'}</span>
                        <h4 class="font-cyber font-bold text-[11px] text-white uppercase truncate">${s.name}</h4>
                    </div>
                    <div class="flex justify-between items-end mb-1">
                        <span class="text-[8px] font-mono text-gray-500 uppercase">Segment Skoru</span>
                        <div>
                            <span class="text-lg font-cyber text-${s.color}">${totalAvg}%</span>
                            ${totalDeltaHtml}
                        </div>
                    </div>
                    <div class="w-full h-1 bg-gray-800 mb-4">
                        <div class="h-full bg-${s.color}" style="width: ${totalAvg}%"></div>
                    </div>
                    <div class="grid grid-cols-2 gap-x-4 gap-y-2">
                        ${createMiniMetric('ATT', avg(s.att), origAvg.att)}
                        ${createMiniMetric('INT', avg(s.int), origAvg.int)}
                        ${createMiniMetric('DES', avg(s.des), origAvg.des)}
                        ${createMiniMetric('ACT', avg(s.act), origAvg.act)}
                    </div>
                </div>
                `;
            }).join('');

        } catch (err) {
            console.error("Segment insights error:", err);
            view.classList.add('hidden');
        }
    };

    const createMiniMetric = (label, val, origVal) => {
        let deltaHtml = '';
        if (origVal !== undefined && origVal !== null) {
            const delta = val - origVal;
            if (delta > 0) deltaHtml = `<span class="text-[8px] text-green-400 ml-1 font-bold">↑+${delta}</span>`;
            else if (delta < 0) deltaHtml = `<span class="text-[8px] text-red-400 ml-1 font-bold">↓${delta}</span>`;
        }
        return `
        <div class="flex justify-between items-center">
            <span class="text-[8px] font-mono text-gray-600">${label}</span>
            <div class="flex items-center">
                <span class="text-[10px] font-mono text-gray-300">${val}%</span>
                ${deltaHtml}
            </div>
        </div>
        `;
    };

    const renderPersonaIntel = (resArray, originalResArray) => {
        const container = document.getElementById('persona-list');
        container.innerHTML = '';

        if(resArray.length === 0){
             container.innerHTML = '<p class="text-red-500 font-mono">Simülasyon verisi bulunamadı.</p>';
             return;
        }

        resArray.forEach(res => {
            const p = res.personas;
            
            let origRes = null;
            if (originalResArray) {
                origRes = originalResArray.find(o => o.persona_id === res.persona_id);
            }

            let buyStatus = res.will_buy 
                ? '<span class="text-green-400 font-bold border border-green-500/50 bg-green-900/20 px-2 py-1 uppercase text-[10px]">&gt; OLUMLU (Satın Alır)</span>'
                : '<span class="text-red-400 font-bold border border-red-500/50 bg-red-900/20 px-2 py-1 uppercase text-[10px]">&gt; OLUMSUZ (Almaz)</span>';

            if (origRes) {
                 if (res.will_buy && !origRes.will_buy) {
                     buyStatus += `<div class="text-[8px] font-mono text-green-400 mt-1 uppercase opacity-90 border border-green-500/30 bg-green-900/10 px-1 py-0.5 inline-block">ESKİ: OLUMSUZ <span class="material-symbols-outlined text-[8px] translate-y-[2px]">arrow_forward</span> YENİ: OLUMLU</div>`;
                 } else if (!res.will_buy && origRes.will_buy) {
                     buyStatus += `<div class="text-[8px] font-mono text-red-400 mt-1 uppercase opacity-90 border border-red-500/30 bg-red-900/10 px-1 py-0.5 inline-block">ESKİ: OLUMLU <span class="material-symbols-outlined text-[8px] translate-y-[2px]">arrow_forward</span> YENİ: OLUMSUZ</div>`;
                 }
            }

            const getDelta = (newVal, oldVal) => {
                 if(oldVal === undefined || oldVal === null) return '';
                 const d = newVal - oldVal;
                 if(d > 0) return `<span class="text-green-400 ml-1 font-bold">↑+${d}</span>`;
                 if(d < 0) return `<span class="text-red-400 ml-1 font-bold">↓${d}</span>`;
                 return '';
            };

            const aDelta = origRes ? getDelta(res.score_attention, origRes.score_attention) : '';
            const iDelta = origRes ? getDelta(res.score_interest, origRes.score_interest) : '';
            const dDelta = origRes ? getDelta(res.score_desire, origRes.score_desire) : '';
            const cDelta = origRes ? getDelta(res.score_action, origRes.score_action) : '';

            const card = `
            <div class="hud-border relative p-6 hover:-translate-y-1 transition-transform shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                <div class="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                <div class="flex items-start justify-between mb-4 pb-4 border-b border-white/5">
                    <div>
                        <h3 class="text-xl font-cyber font-bold text-white mb-1 uppercase">${p.name}</h3>
                        <p class="text-xs text-neon-cyan font-mono uppercase">${p.age} Y/O | ${p.job_title} | ${p.primary_archetype} | ${p.ses_group}-${getGeneration(p.age)}</p>
                        <div class="flex items-center gap-2 mt-2">
                           <span class="text-[8px] font-mono text-gray-400 border border-gray-600 px-1.5 py-0.5 uppercase">${p.ses_group || 'SES'}</span>
                           <span class="text-[8px] font-mono text-gray-400 border border-gray-600 px-1.5 py-0.5 uppercase">${(p.monthly_income_band || 'Bilinmiyor').replace(/_/g, ' ')} Gelir</span>
                           <span class="text-[8px] font-mono text-gray-400 border border-gray-600 px-1.5 py-0.5 uppercase">${p.vals_segment || ''}</span>
                        </div>
                    </div>
                    <div class="text-right flex flex-col items-end gap-1">
                        ${buyStatus}
                    </div>
                </div>
                
                <div class="space-y-4 font-tech text-sm text-gray-300">
                    <div>
                        <span class="text-neon-violet font-mono text-[10px] uppercase block mb-1">Baskın Duygu</span>
                        <p class="border-l-2 border-neon-violet pl-2">${res.dominant_emotion}</p>
                    </div>
                    <div>
                        <span class="text-neon-cyan font-mono text-[10px] uppercase block mb-1">Hızlı Reaksiyon (Sistem 1)</span>
                        <p class="border-l-2 border-neon-cyan pl-2 font-mono italic text-gray-400">"${res.reaction_fast}"</p>
                    </div>
                    <div>
                        <span class="text-neon-magenta font-mono text-[10px] uppercase block mb-1">Derin Analiz (Sistem 2)</span>
                        <p class="border-l-2 border-neon-magenta pl-2 leading-relaxed">"${res.reaction_slow}"</p>
                    </div>
                    <div>
                        <span class="text-white font-mono text-[10px] uppercase block mb-1">Nihai Karar</span>
                        <p class="border-l-2 border-gray-500 pl-2">"${res.final_verdict}"</p>
                    </div>
                    ${createMediaImpactHTML(res)}
                </div>
                
                <div class="flex justify-between mt-5 pt-3 border-t border-white/5 font-cyber text-[10px] text-gray-500 tracking-wider">
                    <span class="flex items-center gap-3">
                       <span>A:${res.score_attention}${aDelta}</span> 
                       <span>M:${res.score_interest}${iDelta}</span> 
                       <span>D:${res.score_desire}${dDelta}</span> 
                       <span>C:${res.score_action}${cDelta}</span>
                    </span>
                    <span>_NODE_ID:${res.persona_id.substring(0,8)}</span>
                </div>
            </div>
            `;
            container.innerHTML += card;
        });
    }

    // ==========================================
    // MEDYA ANALİZ RENDER FONKSİYONLARI
    // ==========================================

    /**
     * Medya analizi panellerini render eder (SmolVLM2 + Whisper).
     */
    const renderMediaAnalysis = (campaign) => {
        const container = document.getElementById('media-analysis-view');
        if (!container) return;

        const hasVisual = campaign.media_analysis_visual && 
                          campaign.media_analysis_visual.visual_analyzed === true;
        const hasAudio = campaign.media_analysis_transcript && 
                         campaign.media_analysis_transcript.trim().length > 0;

        if (!hasVisual && !hasAudio && campaign.media_analysis_status !== 'processing') {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        renderVisualAnalysisPanel(campaign);
        renderAudioAnalysisPanel(campaign);
    };

    const renderVisualAnalysisPanel = (campaign) => {
        const contentEl = document.getElementById('visual-analysis-content');
        const badgeEl = document.getElementById('visual-analysis-badge');
        if (!contentEl) return;

        if (campaign.media_analysis_status === 'processing') {
            contentEl.innerHTML = `<div class="flex items-center gap-2"><div class="animate-spin w-3 h-3 border border-neon-violet border-t-transparent rounded-full"></div><span class="text-xs text-neon-violet font-mono">SmolVLM2 analiz ediyor...</span></div>`;
            return;
        }

        const visualData = campaign.media_analysis_visual;
        if (!visualData || visualData.media_analyzed === false) {
            contentEl.innerHTML = `<p class="text-gray-600 text-xs italic">${visualData?.visual_description || 'Görsel analiz yapılamadı veya medya yüklenmedi.'}</p>`;
            if (badgeEl) badgeEl.textContent = 'N/A';
            return;
        }

        const description = visualData.visual_description || '';
        const lines = description.split('\n').filter(l => l.trim().length > 0);
        let formattedHTML = '';
        lines.forEach(line => {
            const labelMatch = line.match(/^\d+\.\s*(.+?):\s*(.+)/);
            if (labelMatch) {
                formattedHTML += `<div class="flex gap-2"><span class="text-neon-violet font-mono text-[9px] uppercase whitespace-nowrap min-w-[80px]">${labelMatch[1].trim()}</span><span class="text-gray-300 text-xs">${labelMatch[2].trim()}</span></div>`;
            } else {
                formattedHTML += `<p class="text-gray-400 text-xs">${line.trim()}</p>`;
            }
        });
        if (!formattedHTML) formattedHTML = `<p class="text-gray-300 text-xs leading-relaxed">${description}</p>`;
        contentEl.innerHTML = formattedHTML;
        if (badgeEl) badgeEl.textContent = 'SmolVLM2 ✓';
    };

    const renderAudioAnalysisPanel = (campaign) => {
        const contentEl = document.getElementById('audio-analysis-content');
        const badgeEl = document.getElementById('audio-analysis-badge');
        const timestampsEl = document.getElementById('transcript-timestamps');
        const timestampsDetailEl = document.getElementById('timestamps-detail');
        if (!contentEl) return;

        if (campaign.media_analysis_status === 'processing') {
            contentEl.innerHTML = `<div class="flex items-center gap-2"><div class="animate-spin w-3 h-3 border border-neon-magenta border-t-transparent rounded-full"></div><span class="text-xs text-neon-magenta font-mono">Whisper transkripsiyon yapılıyor...</span></div>`;
            return;
        }

        const transcript = campaign.media_analysis_transcript;
        if (!transcript || transcript.trim().length === 0) {
            contentEl.innerHTML = `<p class="text-gray-600 text-xs italic">Ses transkripti mevcut değil. Reklam sessiz görsel veya medya yüklenmemiş olabilir.</p>`;
            if (badgeEl) badgeEl.textContent = 'N/A';
            if (timestampsEl) timestampsEl.classList.add('hidden');
            return;
        }

        contentEl.innerHTML = `
            <p class="text-gray-200 text-sm leading-relaxed border-l-2 border-neon-magenta/50 pl-3 italic">"${transcript}"</p>
            <div class="flex items-center gap-2 mt-2">
                <span class="text-[8px] font-mono text-gray-600 uppercase">Kelime sayısı: ${transcript.split(' ').length}</span>
                ${campaign.media_duration_seconds ? `<span class="text-[8px] font-mono text-gray-600">|</span><span class="text-[8px] font-mono text-gray-600 uppercase">Video süresi: ${campaign.media_duration_seconds}sn</span>` : ''}
            </div>`;
        if (badgeEl) badgeEl.textContent = 'Whisper ✓';

        const visualData = campaign.media_analysis_visual;
        if (visualData?.transcript_with_timestamps && timestampsEl && timestampsDetailEl) {
            timestampsEl.classList.remove('hidden');
            timestampsDetailEl.textContent = visualData.transcript_with_timestamps;
        } else if (timestampsEl) {
            timestampsEl.classList.add('hidden');
        }
    };

    /**
     * Video kampanyalarında görsel yerine video player gösterir.
     */
    const renderVideoPlayer = (campaign) => {
        const imgEl = document.getElementById('cmp-img-element');
        const videoEl = document.getElementById('cmp-video-element');
        const imgContainer = document.getElementById('cmp-img-container');
        if (!videoEl) return;

        const isVideo = campaign.media_type === 'video';
        if (isVideo && campaign.media_url) {
            if (imgContainer) imgContainer.classList.add('hidden');
            videoEl.src = campaign.media_url;
            videoEl.classList.remove('hidden');
        } else {
            videoEl.src = '';
            videoEl.classList.add('hidden');
            if (imgContainer) imgContainer.classList.remove('hidden');
        }
    };

    /**
     * Persona kartlarına medya etki notları ekler.
     */
    const createMediaImpactHTML = (res) => {
        let html = '';
        if (res.visual_impact_note && res.visual_impact_note.trim().length > 0) {
            html += `<div class="mt-2"><span class="text-neon-violet font-mono text-[10px] uppercase block mb-1">Görsel Etki (Sistem 1)</span><p class="border-l-2 border-neon-violet/40 pl-2 text-xs text-gray-400 italic">"${res.visual_impact_note}"</p></div>`;
        }
        if (res.audio_impact_note && res.audio_impact_note.trim().length > 0) {
            html += `<div class="mt-2"><span class="text-neon-magenta font-mono text-[10px] uppercase block mb-1">Ses Etkisi</span><p class="border-l-2 border-neon-magenta/40 pl-2 text-xs text-gray-400 italic">"${res.audio_impact_note}"</p></div>`;
        }
        return html;
    };

    /**
     * PDF raporuna medya analiz bölümü ekler.
     */
    const createPDFMediaSection = (campaign) => {
        const sections = [];
        sections.push({ text: 'MEDYA AI ANALİZİ', fontSize: 11, bold: true, color: '#00CED1', margin: [0, 20, 0, 10] });

        const visualData = campaign.media_analysis_visual;
        if (visualData && visualData.visual_analyzed) {
            sections.push({ text: 'Görsel Analiz (SmolVLM2-500M)', fontSize: 10, bold: true, color: '#6C757D', margin: [0, 5, 0, 5] });
            sections.push({ text: visualData.visual_description || 'Veri yok', fontSize: 10, margin: [10, 0, 0, 10] });
        }

        const transcript = campaign.media_analysis_transcript;
        if (transcript && transcript.trim().length > 0) {
            sections.push({ text: 'Ses Transkripsiyonu (Whisper)', fontSize: 10, bold: true, color: '#6C757D', margin: [0, 5, 0, 5] });
            sections.push({ text: `"${transcript}"`, fontSize: 10, italics: true, margin: [10, 0, 0, 10] });
        }

        if ((!visualData || !visualData.visual_analyzed) && (!transcript || transcript.trim().length === 0)) {
            sections.push({ text: 'Bu kampanya için medya AI analizi yapılmamıştır.', fontSize: 10, color: '#888888', margin: [10, 0, 0, 10] });
        }
        return sections;
    };

    // ==========================================
    // OPTIMIZATION & POMELLI LOGIC
    // ==========================================
    const initOptimizationUI = async (campaignId) => {
        const container = document.getElementById('optimization-container');
        const btnOpt = document.getElementById('btn-optimize-campaign');
        const loading = document.getElementById('opt-loading');
        const results = document.getElementById('opt-results');
        
        if (!container) return;

        // Ek kontrol: Eğer kampanya zaten optimize edilmişse bu paneli tamamen kapat
        const { data: campaign } = await supabase.from('campaigns').select('is_ai_optimized').eq('id', campaignId).single();
        if (campaign?.is_ai_optimized) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        loading.classList.add('hidden');
        results.classList.add('hidden');
        btnOpt.classList.remove('hidden');

        const checkDB = async () => {
            const { data, error } = await supabase
                .from('campaign_optimizations')
                .select('*')
                .eq('campaign_id', campaignId)
                .single();
            return data;
        };

        const displayOpt = (data) => {
            document.getElementById('opt-slogan').innerText = data.better_slogan_idea || 'Bilgi yok';
            document.getElementById('opt-trigger').innerText = data.psychological_trigger_advice || 'Bilgi yok';
            document.getElementById('opt-visual').innerText = data.visual_concept_idea || 'Bilgi yok';
            
            const promptEl = document.getElementById('opt-pomelli-prompt');
            if (promptEl) promptEl.innerText = data.pomelli_prompt || 'Pomelli promptu oluşturulamadı.';
            
            // Re-analyze butonu için datayı sakla
            const btnReanalyze = document.getElementById('btn-reanalyze-concept');
            if (btnReanalyze) {
                btnReanalyze.onclick = () => {
                    const optData = {
                        name: data.opt_name,
                        objective: data.opt_objective,
                        brand_tone: data.opt_brand_tone,
                        call_to_action: data.opt_call_to_action,
                        value_proposition: data.opt_value_proposition,
                        slogan: data.better_slogan_idea, // optimize edilmiş slogan
                        media_url: data.opt_media_url,
                        audience: data.opt_audience,
                        brand_guidelines: data.opt_brand_guidelines,
                        channels: data.opt_channels ? data.opt_channels.split(',') : [],
                        is_ai_optimized: true,
                        original_campaign_id: campaignId
                    };
                    sessionStorage.setItem('optimized_campaign_data', JSON.stringify(optData));
                    window.location.href = 'new-analysis.html';
                };
            }

            btnOpt.classList.add('hidden');
            loading.classList.add('hidden');
            results.classList.remove('hidden');
        };

        const existingOpt = await checkDB();
        if (existingOpt) {
            displayOpt(existingOpt);
        }

        const newBtnOpt = btnOpt.cloneNode(true);
        btnOpt.parentNode.replaceChild(newBtnOpt, btnOpt);
        
        newBtnOpt.addEventListener('click', async () => {
            newBtnOpt.classList.add('hidden');
            loading.classList.remove('hidden');
            
            try {
                fetch(import.meta.env.VITE_N8N_OPTIMIZE_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ campaign_id: campaignId })
                }).catch(e => console.warn("Webhook fetch issue", e));

                let attempts = 0;
                const pollInterval = setInterval(async () => {
                    attempts++;
                    const optData = await checkDB();
                    if (optData) {
                        clearInterval(pollInterval);
                        displayOpt(optData);
                    } else if (attempts > 30) {
                        clearInterval(pollInterval);
                        alert("Optimizasyon zaman aşımına uğradı (60s). Lütfen sayfayı yenileyin.");
                        loading.classList.add('hidden');
                        newBtnOpt.classList.remove('hidden');
                    }
                }, 2000);

            } catch(e) {
                console.error("Optimization error", e);
                loading.classList.add('hidden');
                newBtnOpt.classList.remove('hidden');
            }
        });

        // Prompt Kopyalama Mantığı
        const btnCopy = document.getElementById('btn-copy-prompt');
        const copyFeedback = document.getElementById('copy-feedback');
        
        if (btnCopy) {
            btnCopy.addEventListener('click', () => {
                const text = document.getElementById('opt-pomelli-prompt').innerText;
                navigator.clipboard.writeText(text).then(() => {
                    if (copyFeedback) {
                        copyFeedback.classList.remove('opacity-0');
                        setTimeout(() => copyFeedback.classList.add('opacity-0'), 2000);
                    }
                });
            });
        }
    };

    // ==========================================
    // MEDYA BÜTÇESİ DAĞILIM ÖNERİSİ
    // ==========================================
    const renderMediaBudget = (results) => {
        const budgetView = document.getElementById('media-budget-view');
        const chartContainer = document.getElementById('media-budget-chart');
        const adviceContainer = document.getElementById('media-budget-advice-text');
        
        if (!budgetView || !chartContainer || !adviceContainer) return;

        // Filtreleme: Yalnızca satın alma eğilimi olan veya action skoru yüksek olanlar (eğer hiç yoksa en iyisini almak için)
        let convertedPersonas = results.filter(r => r.will_buy);
        
        if (convertedPersonas.length === 0) {
            // Eğer kimse almadıysa, action skoru 50'den büyük olanları almayı deneyelim
            convertedPersonas = results.filter(r => r.score_action > 50);
        }

        if (convertedPersonas.length === 0) {
            budgetView.classList.remove('hidden');
            chartContainer.innerHTML = '<div class="text-red-500 font-mono text-sm border border-red-500/20 bg-red-500/10 p-4">Bu kampanya için yeterli dönüşüm eğilimi görülmemiştir. Bütçe harcaması yapılmadan önce kreatif revizyonu tavsiye edilir.</div>';
            adviceContainer.innerHTML = '<span class="text-gray-400">Tahmin motoru kârlı bir medya döngüsü saptayamadı.</span>';
            return;
        }

        const channelCounts = {};
        let totalCount = 0;

        convertedPersonas.forEach(res => {
            const channels = res.personas?.preferred_channels || [];
            channels.forEach(ch => {
                channelCounts[ch] = (channelCounts[ch] || 0) + 1;
                totalCount++;
            });
        });

        if (totalCount === 0) {
             budgetView.classList.add('hidden');
             return;
        }

        // Kanalları sırala (Büyükten küçüğe)
        const sortedChannels = Object.keys(channelCounts).map(key => {
            return {
                id: key,
                count: channelCounts[key],
                percentage: Math.round((channelCounts[key] / totalCount) * 100)
            };
        }).sort((a, b) => b.percentage - a.percentage);

        // UI Kanalları İsimleri ve Renkleri
        const channelMap = {
            'DISPLAY': { name: 'Görüntülü Reklam Ağı (Display)', color: 'neon-cyan', bg: '#00f3ff' },
            'STORIES': { name: 'Hikayeler (Stories)', color: 'neon-magenta', bg: '#ff00ff' },
            'FEEDS': { name: 'Sosyal Akışlar (Feeds)', color: 'neon-violet', bg: '#bc13fe' },
            'EMAIL': { name: 'E-Posta (Bülten / Email)', color: 'gray-300', bg: '#d1d5db' },
            'WEB_UI': { name: 'Web Arayüzü / Yerel (Native)', color: 'orange-400', bg: '#fb923c' }
        };

        // Bar grafikleri çizimi
        chartContainer.innerHTML = '';
        sortedChannels.forEach(ch => {
            const mapped = channelMap[ch.id] || { name: ch.id, color: 'white', bg: '#ffffff' };
            
            const row = `
            <div class="mb-4">
                <div class="flex justify-between items-end mb-1 text-xs font-mono">
                    <span class="text-${mapped.color} uppercase truncate pr-2">${mapped.name}</span>
                    <span class="font-bold text-white">%${ch.percentage}</span>
                </div>
                <div class="w-full h-3 bg-gray-800 rounded-sm overflow-hidden relative">
                    <div class="h-full rounded-sm absolute top-0 left-0 transition-all duration-1000 w-0" style="background-color: ${mapped.bg}; box-shadow: 0 0 10px ${mapped.bg}80;" data-width="${ch.percentage}%"></div>
                </div>
            </div>`;
            chartContainer.innerHTML += row;
        });

        // Animasyonu tetikle
        setTimeout(() => {
            chartContainer.querySelectorAll('div[data-width]').forEach(el => {
                el.style.width = el.getAttribute('data-width');
            });
        }, 100);

        // AI Tavsiye Logic'i
        const topChannel = sortedChannels[0];
        const secondChannel = sortedChannels.length > 1 ? sortedChannels[1] : null;
        const topMapped = channelMap[topChannel.id] || { name: topChannel.id };

        let adviceHtml = '';
        
        if (topChannel.percentage > 60) {
            adviceHtml = `<p>Tüketicilerin ezici bir çoğunluğu <strong>${topMapped.name}</strong> formatını tüketiyor. Bütçenizin en az <strong>%${topChannel.percentage}</strong> kısmını bu kanala yönlendirin. Agresif bir CPC (Tıklama Başına Maliyet) teklifi ile rakip payını alabilirsiniz.</p>`;
        } else if (secondChannel && (topChannel.percentage - secondChannel.percentage < 15)) {
            const secondMapped = channelMap[secondChannel.id] || { name: secondChannel.id };
            adviceHtml = `<p>Hedef kitleniz <strong>${topMapped.name}</strong> ve <strong>${secondMapped.name}</strong> arasında bölünmüş durumda. A/B testi yaparak bütçenizi bu iki ana damara eşit olarak dağıtmanız önerilir.</p>`;
        } else {
            adviceHtml = `<p>Bu kampanya genel olarak <strong>${topMapped.name}</strong> kanalında daha iyi performans gösterecek. Ancak geniş bir kitle hedeflendiği için bütçeyi pazar penetrasyonu amacıyla bölmeniz faydalı olacaktır.</p>`;
        }

        adviceContainer.innerHTML = adviceHtml;
        budgetView.classList.remove('hidden');
    };

    // ==========================================
    // TAB NAVİGASYON SİSTEMİ
    // ==========================================
    const initTabs = () => {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabBtns.forEach(btn => {
            // Eski listener varsa temizlenmesi için clone
            if (btn.dataset.tabListener) return;
            btn.dataset.tabListener = 'true';

            btn.addEventListener('click', () => {
                const targetTab = btn.dataset.tab;

                tabBtns.forEach(b => {
                    b.classList.remove('active', 'text-white');
                    b.classList.add('text-gray-500');
                });

                btn.classList.add('active', 'text-white');
                btn.classList.remove('text-gray-500');

                tabContents.forEach(c => c.classList.add('hidden'));
                const target = document.getElementById(`tab-${targetTab}`);
                if (target) target.classList.remove('hidden');

                // Lazy load: DEMOGRAFİK sekme ilk açılışta render
                if (targetTab === 'demographic' && !demographicRendered && allAnalysisResults) {
                    renderDemographicTab();
                    demographicRendered = true;
                }
            });
        });
    };

    // ==========================================
    // DÖNÜŞÜM HUNİSİ (Overview tab)
    // ==========================================
    const renderConversionFunnel = (results) => {
        const container = document.getElementById('funnel-bars');
        if (!container || !results || results.length === 0) return;

        const total = results.length;
        const funnelData = [
            { label: 'DİKKAT', count: results.filter(r => (r.score_attention || 0) >= 50).length, color: 'neon-cyan', bg: '#00f3ff' },
            { label: 'İLGİ', count: results.filter(r => (r.score_interest || 0) >= 50).length, color: 'neon-violet', bg: '#bc13fe' },
            { label: 'ARZU', count: results.filter(r => (r.score_desire || 0) >= 50).length, color: 'neon-magenta', bg: '#ff00ff' },
            { label: 'AKSİYON', count: results.filter(r => (r.score_action || 0) >= 50).length, color: 'white', bg: '#ffffff' },
            { label: 'SATIN ALMA', count: results.filter(r => r.will_buy === true).length, color: 'green-400', bg: '#4ade80' }
        ];

        container.innerHTML = funnelData.map(d => {
            const pct = Math.round((d.count / total) * 100);
            return `
            <div class="flex items-center gap-4">
                <span class="text-[9px] font-mono text-gray-500 uppercase w-24 text-right shrink-0">${d.label}</span>
                <div class="flex-1 h-7 bg-gray-800/60 rounded-sm overflow-hidden relative">
                    <div class="h-full rounded-sm transition-all duration-1000 flex items-center px-3" 
                         style="width: ${pct}%; background: ${d.bg}20; border-left: 3px solid ${d.bg};">
                        <span class="text-[10px] font-mono font-bold" style="color: ${d.bg}">${d.count}/${total} (%${pct})</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    };

    // ==========================================
    // WILL BUY DONUT CHART (Overview tab)
    // ==========================================
    const renderWillBuyDonutChart = (results) => {
        const canvas = document.getElementById('willbuy-donut-canvas');
        if (!canvas || !results || results.length === 0) return;
        if (typeof Chart === 'undefined') return;

        if (chartInstances['willbuy']) chartInstances['willbuy'].destroy();

        const buyCount = results.filter(r => r.will_buy).length;
        const noBuyCount = results.length - buyCount;

        chartInstances['willbuy'] = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: ['Satın Alır', 'Almaz'],
                datasets: [{
                    data: [buyCount, noBuyCount],
                    backgroundColor: ['rgba(0,243,255,0.6)', 'rgba(255,0,255,0.3)'],
                    borderColor: ['#00f3ff', '#ff00ff'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#888', font: { family: 'monospace', size: 10 } }
                    }
                }
            }
        });
    };

    // ==========================================
    // OVERVIEW STATS (Overview tab)
    // ==========================================
    const renderOverviewStats = (results) => {
        const container = document.getElementById('overview-stats-content');
        if (!container || !results || results.length === 0) return;

        const total = results.length;
        const buyCount = results.filter(r => r.will_buy).length;
        const avgAtt = Math.round(results.reduce((s,r) => s + (r.score_attention||0), 0) / total);
        const avgInt = Math.round(results.reduce((s,r) => s + (r.score_interest||0), 0) / total);
        const avgDes = Math.round(results.reduce((s,r) => s + (r.score_desire||0), 0) / total);
        const avgAct = Math.round(results.reduce((s,r) => s + (r.score_action||0), 0) / total);
        const avgTotal = Math.round((avgAtt + avgInt + avgDes + avgAct) / 4);

        // En iyi & en kötü persona
        const sorted = [...results].sort((a,b) => {
            const aAvg = ((a.score_attention||0)+(a.score_interest||0)+(a.score_desire||0)+(a.score_action||0))/4;
            const bAvg = ((b.score_attention||0)+(b.score_interest||0)+(b.score_desire||0)+(b.score_action||0))/4;
            return bAvg - aAvg;
        });
        const best = sorted[0];
        const worst = sorted[sorted.length - 1];

        const stat = (label, value, color) => `
            <div class="flex justify-between items-center border-b border-white/5 pb-2">
                <span class="text-[10px] font-mono text-gray-500 uppercase">${label}</span>
                <span class="text-sm font-cyber font-bold text-${color}">${value}</span>
            </div>`;

        container.innerHTML = 
            stat('Toplam Persona', total, 'white') +
            stat('Satın Alma Oranı', `%${Math.round((buyCount/total)*100)} (${buyCount}/${total})`, buyCount > total/2 ? 'green-400' : 'red-400') +
            stat('Genel AIDA Ortalaması', `%${avgTotal}`, 'neon-cyan') +
            stat('En Güçlü Persona', best?.personas?.name || '-', 'green-400') +
            stat('En Zayıf Persona', worst?.personas?.name || '-', 'red-400');
    };

    // ==========================================
    // DEMOGRAFİK TAB ORCHESTRATOR
    // ==========================================
    const renderDemographicTab = () => {
        if (!allAnalysisResults) return;
        renderSESBreakdown(allAnalysisResults);
        renderSESRadarChart(allAnalysisResults);
        renderGenerationBreakdown(allAnalysisResults);
        renderGenderBreakdown(allAnalysisResults);
        renderCrossTabHeatmap(allAnalysisResults);
        renderEmotionMap(allAnalysisResults);
    };

    // ==========================================
    // SES KIRILIM
    // ==========================================
    const calculateGroupAIDA = (group) => {
        if (group.length === 0) return { att: 0, int: 0, des: 0, act: 0, total: 0 };
        const att = Math.round(group.reduce((s,r) => s+(r.score_attention||0),0)/group.length);
        const int = Math.round(group.reduce((s,r) => s+(r.score_interest||0),0)/group.length);
        const des = Math.round(group.reduce((s,r) => s+(r.score_desire||0),0)/group.length);
        const act = Math.round(group.reduce((s,r) => s+(r.score_action||0),0)/group.length);
        return { att, int, des, act, total: Math.round((att+int+des+act)/4) };
    };

    const renderSESBreakdown = (results) => {
        const grid = document.getElementById('ses-breakdown-grid');
        if (!grid) return;

        const sesGroups = ['AB', 'C1', 'C2_DE'];
        grid.innerHTML = sesGroups.map(ses => {
            const group = results.filter(r => r.personas?.ses_group === ses);
            if (group.length === 0) return '';
            const avg = calculateGroupAIDA(group);
            const buyCount = group.filter(r => r.will_buy).length;
            const buyPct = Math.round((buyCount / group.length) * 100);
            const colorMap = { 'AB': 'neon-cyan', 'C1': 'neon-violet', 'C2_DE': 'neon-magenta' };
            const color = colorMap[ses] || 'gray-400';

            return `
            <div class="hud-border p-5">
                <div class="flex justify-between items-center mb-3">
                    <h4 class="font-cyber font-bold text-lg text-${color}">${ses}</h4>
                    <span class="text-[9px] font-mono text-gray-500">${group.length} Persona</span>
                </div>
                <div class="w-full h-2 bg-gray-800 mb-4"><div class="h-full bg-${color}" style="width:${avg.total}%"></div></div>
                <div class="text-2xl font-cyber font-bold text-white mb-3">${avg.total}%</div>
                <div class="grid grid-cols-2 gap-2 text-[10px] font-mono">
                    <div class="flex justify-between"><span class="text-gray-600">ATT</span><span class="text-gray-300">${avg.att}%</span></div>
                    <div class="flex justify-between"><span class="text-gray-600">INT</span><span class="text-gray-300">${avg.int}%</span></div>
                    <div class="flex justify-between"><span class="text-gray-600">DES</span><span class="text-gray-300">${avg.des}%</span></div>
                    <div class="flex justify-between"><span class="text-gray-600">ACT</span><span class="text-gray-300">${avg.act}%</span></div>
                </div>
                <div class="mt-3 pt-3 border-t border-white/5 text-xs font-mono">
                    <span class="text-gray-500">Satın Alır:</span> 
                    <span class="${buyPct > 50 ? 'text-green-400' : 'text-red-400'} font-bold">${buyCount}/${group.length} (%${buyPct})</span>
                </div>
            </div>`;
        }).join('');
    };

    // ==========================================
    // SES RADAR CHART (Chart.js)
    // ==========================================
    const renderSESRadarChart = (results) => {
        const canvas = document.getElementById('ses-radar-canvas');
        if (!canvas || typeof Chart === 'undefined') return;
        if (chartInstances['sesRadar']) chartInstances['sesRadar'].destroy();

        const sesGroups = ['AB', 'C1', 'C2_DE'];
        const colors = ['#00f3ff', '#bc13fe', '#ff00ff'];

        const datasets = sesGroups.map((ses, i) => {
            const group = results.filter(r => r.personas?.ses_group === ses);
            const avg = calculateGroupAIDA(group);
            return {
                label: ses,
                data: [avg.att, avg.int, avg.des, avg.act],
                borderColor: colors[i],
                backgroundColor: colors[i] + '20',
                borderWidth: 2,
                pointRadius: 3
            };
        });

        chartInstances['sesRadar'] = new Chart(canvas, {
            type: 'radar',
            data: {
                labels: ['Dikkat', 'İlgi', 'Arzu', 'Aksiyon'],
                datasets
            },
            options: {
                responsive: true,
                scales: {
                    r: {
                        min: 0, max: 100,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#666', font: { family: 'monospace', size: 9 }, backdropColor: 'transparent' },
                        pointLabels: { color: '#888', font: { family: 'monospace', size: 10 } }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#888', font: { family: 'monospace', size: 10 } } }
                }
            }
        });
    };

    // ==========================================
    // KUŞAK KIRILIM
    // ==========================================
    const renderGenerationBreakdown = (results) => {
        const grid = document.getElementById('generation-breakdown-grid');
        if (!grid) return;

        const gens = ['Gen-Z', 'Millennial', 'Gen-X', 'Boomer+'];
        const genColors = { 'Gen-Z': 'neon-cyan', 'Millennial': 'neon-violet', 'Gen-X': 'neon-magenta', 'Boomer+': 'white' };

        grid.innerHTML = gens.map(gen => {
            const group = results.filter(r => getGeneration(r.personas?.age) === gen);
            if (group.length === 0) return `<div class="hud-border p-5 opacity-50"><h4 class="font-cyber text-sm text-gray-500">${gen}</h4><p class="text-[10px] text-gray-600 font-mono">Veri yok</p></div>`;
            const avg = calculateGroupAIDA(group);
            const buyCount = group.filter(r => r.will_buy).length;
            const color = genColors[gen] || 'gray-400';

            return `
            <div class="hud-border p-5">
                <div class="flex justify-between items-center mb-2">
                    <h4 class="font-cyber font-bold text-${color}">${gen}</h4>
                    <span class="text-[9px] font-mono text-gray-500">${group.length}</span>
                </div>
                <div class="text-xl font-cyber font-bold text-white mb-2">${avg.total}%</div>
                <div class="w-full h-1.5 bg-gray-800 mb-3"><div class="h-full bg-${color}" style="width:${avg.total}%"></div></div>
                <div class="text-[10px] font-mono text-gray-400 space-y-1">
                    <div>A:${avg.att} İ:${avg.int} D:${avg.des} C:${avg.act}</div>
                    <div>Alır: <span class="${buyCount > 0 ? 'text-green-400' : 'text-red-400'}">${buyCount}/${group.length}</span></div>
                </div>
            </div>`;
        }).join('');
    };

    // ==========================================
    // CİNSİYET KIRILIM
    // ==========================================
    const renderGenderBreakdown = (results) => {
        const grid = document.getElementById('gender-breakdown-grid');
        if (!grid) return;

        const genders = [
            { key: 'Kadın', label: 'Kadın', icon: 'female', color: 'neon-magenta' },
            { key: 'Erkek', label: 'Erkek', icon: 'male', color: 'neon-cyan' }
        ];

        grid.innerHTML = genders.map(g => {
            const group = results.filter(r => r.personas?.gender === g.key);
            if (group.length === 0) return '';
            const avg = calculateGroupAIDA(group);
            const buyCount = group.filter(r => r.will_buy).length;

            return `
            <div class="hud-border p-5">
                <div class="flex items-center gap-2 mb-3">
                    <span class="material-symbols-outlined text-${g.color}">${g.icon}</span>
                    <h4 class="font-cyber font-bold text-${g.color}">${g.label}</h4>
                    <span class="text-[9px] font-mono text-gray-500 ml-auto">${group.length} Persona</span>
                </div>
                <div class="text-2xl font-cyber font-bold text-white mb-3">${avg.total}%</div>
                <div class="grid grid-cols-4 gap-2 text-[10px] font-mono text-center mb-3">
                    <div><span class="block text-gray-600">ATT</span><span class="text-gray-300">${avg.att}</span></div>
                    <div><span class="block text-gray-600">INT</span><span class="text-gray-300">${avg.int}</span></div>
                    <div><span class="block text-gray-600">DES</span><span class="text-gray-300">${avg.des}</span></div>
                    <div><span class="block text-gray-600">ACT</span><span class="text-gray-300">${avg.act}</span></div>
                </div>
                <div class="pt-3 border-t border-white/5 text-xs font-mono">
                    Satın Alır: <span class="${buyCount > group.length/2 ? 'text-green-400' : 'text-red-400'} font-bold">${buyCount}/${group.length} (%${Math.round((buyCount/group.length)*100)})</span>
                </div>
            </div>`;
        }).join('');
    };

    // ==========================================
    // CROSS-TAB HEATMAP (SES × Kuşak)
    // ==========================================
    const renderCrossTabHeatmap = (results) => {
        const container = document.getElementById('crosstab-heatmap-container');
        if (!container) return;

        const sesGroups = ['AB', 'C1', 'C2_DE'];
        const gens = ['Gen-Z', 'Millennial', 'Gen-X', 'Boomer+'];

        const getHeatColor = (score) => {
            if (score >= 75) return 'bg-green-500/20 text-green-400 border-green-500/30';
            if (score >= 55) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
            if (score >= 40) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
            if (score >= 25) return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
            return 'bg-red-500/20 text-red-400 border-red-500/30';
        };

        let html = '<table class="w-full text-center">';
        html += '<thead><tr><th class="text-[9px] font-mono text-gray-600 p-2"></th>';
        gens.forEach(g => { html += `<th class="text-[9px] font-mono text-gray-400 p-2 uppercase">${g}</th>`; });
        html += '</tr></thead><tbody>';

        sesGroups.forEach(ses => {
            html += `<tr><td class="text-[10px] font-mono text-gray-400 p-2 font-bold text-left">${ses}</td>`;
            gens.forEach(gen => {
                const group = results.filter(r => r.personas?.ses_group === ses && getGeneration(r.personas?.age) === gen);
                if (group.length === 0) {
                    html += '<td class="p-2"><span class="text-[10px] text-gray-700 font-mono">—</span></td>';
                } else {
                    const avg = calculateGroupAIDA(group);
                    html += `<td class="p-1.5"><div class="border ${getHeatColor(avg.total)} rounded-sm p-2 font-mono text-sm font-bold">${avg.total}</div></td>`;
                }
            });
            html += '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;
    };

    // ==========================================
    // DUYGU FREKANS HARİTASI
    // ==========================================
    const renderEmotionMap = (results) => {
        const container = document.getElementById('emotion-map-container');
        if (!container) return;

        const emotionCounts = {};
        results.forEach(r => {
            const emotion = r.dominant_emotion || 'Belirsiz';
            emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
        });

        const sorted = Object.entries(emotionCounts).sort((a,b) => b[1] - a[1]);
        const maxCount = sorted.length > 0 ? sorted[0][1] : 1;

        container.innerHTML = sorted.map(([emotion, count]) => {
            const pct = Math.round((count / maxCount) * 100);
            return `
            <div class="flex items-center gap-3">
                <span class="text-[10px] font-mono text-gray-400 w-28 text-right truncate shrink-0">${emotion}</span>
                <div class="flex-1 h-5 bg-gray-800/60 rounded-sm overflow-hidden">
                    <div class="h-full bg-neon-violet/40 border-l-2 border-neon-violet rounded-sm flex items-center px-2 transition-all duration-700"
                         style="width: ${pct}%">
                        <span class="text-[9px] font-mono text-neon-violet font-bold">${count}</span>
                    </div>
                </div>
            </div>`;
        }).join('');
    };

    // ==========================================
    // PERSONA FİLTRE VE SIRALAMA SİSTEMİ
    // ==========================================
    const initPersonaFilters = () => {
        if (personaFiltersInitialized || !allAnalysisResults) return;
        personaFiltersInitialized = true;

        const count = document.getElementById('persona-count');
        if (count) count.textContent = `${allAnalysisResults.length}/${allAnalysisResults.length} persona`;

        const ids = ['filter-ses', 'filter-generation', 'filter-gender', 'filter-willbuy', 'sort-by'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', applyPersonaFilters);
        });
    };

    const applyPersonaFilters = () => {
        if (!allAnalysisResults) return;

        let filtered = [...allAnalysisResults];
        const ses = document.getElementById('filter-ses')?.value;
        const gen = document.getElementById('filter-generation')?.value;
        const gender = document.getElementById('filter-gender')?.value;
        const buy = document.getElementById('filter-willbuy')?.value;
        const sort = document.getElementById('sort-by')?.value;

        if (ses && ses !== 'all') filtered = filtered.filter(r => r.personas?.ses_group === ses);
        if (gen && gen !== 'all') filtered = filtered.filter(r => getGeneration(r.personas?.age) === gen);
        if (gender && gender !== 'all') filtered = filtered.filter(r => r.personas?.gender === gender);
        if (buy && buy !== 'all') filtered = filtered.filter(r => String(r.will_buy) === buy);

        const avgAIDA = (r) => ((r.score_attention||0)+(r.score_interest||0)+(r.score_desire||0)+(r.score_action||0))/4;

        if (sort === 'score_desc') filtered.sort((a,b) => avgAIDA(b) - avgAIDA(a));
        else if (sort === 'score_asc') filtered.sort((a,b) => avgAIDA(a) - avgAIDA(b));
        else if (sort === 'age_asc') filtered.sort((a,b) => (a.personas?.age||0) - (b.personas?.age||0));
        else if (sort === 'age_desc') filtered.sort((a,b) => (b.personas?.age||0) - (a.personas?.age||0));
        else if (sort === 'name') filtered.sort((a,b) => (a.personas?.name||'').localeCompare(b.personas?.name||'', 'tr'));

        const count = document.getElementById('persona-count');
        if (count) count.textContent = `${filtered.length}/${allAnalysisResults.length} persona`;

        renderPersonaIntel(filtered, allOriginalResults);
    };

    // ==========================================
    // INITIALIZATION ROUTER
    // ==========================================
    const urlParams = new URLSearchParams(window.location.search);
    const initialCampaignId = urlParams.get('id');
    
    // Uygulama Başlangıcı
    setupHeatmapToggle();

    if (initialCampaignId) {
        startPollingCampaign(initialCampaignId);
    } else {
        loadUserCampaigns();
        showView(campaignsView);
    }
});
