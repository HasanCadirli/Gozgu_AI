import { supabase } from './supabase-config.js';

document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. Session Kontrolü
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError || !session) {
        window.location.href = 'index.html';
        return;
    }

    const currentUser = session.user;

    const createSegmentForm = document.getElementById('create-segment-form');
    const csAlert = document.getElementById('cs-alert');

    let loadedPersonasDb = [];
    let currentMatchedPersonas = [];

    // ==========================================
    // ÖZEL SEGMENT WIZARD MANTIĞI
    // ==========================================
    const calculateMatchingPersonas = () => {
        const vSES = document.getElementById('wiz_ses')?.value || 'any';
        const vLifestage = document.getElementById('wiz_lifestage')?.value || 'any';
        const vVals = document.getElementById('wiz_vals')?.value || 'any';
        const vNeuro = document.getElementById('wiz_neuro')?.value || 'any';
        const vB2b = document.getElementById('wiz_b2b')?.value || 'any';

        const matched = [];
        const matchedNames = [];

        loadedPersonasDb.forEach(p => {
            if (vSES !== 'any' && p.ses_group !== vSES) return;
            if (vLifestage !== 'any' && p.life_stage !== vLifestage) return;
            if (vVals !== 'any' && p.vals_segment !== vVals) return;
            if (vNeuro !== 'any' && p.neuro_trigger !== vNeuro) return;
            if (vB2b !== 'any' && p.b2b_segment !== vB2b) return;

            matched.push(p.id);
            matchedNames.push(p.name);
        });

        currentMatchedPersonas = matched;
        const countSpan = document.getElementById('wizard-match-count');
        const namesSpan = document.getElementById('wizard-match-names');
        const saveBtn = document.getElementById('btn-save-segment');

        if (countSpan) countSpan.innerText = matched.length;
        if (namesSpan) namesSpan.innerText = matchedNames.join(', ') || 'Bu kriterlere uyan aktif persona bulunamadı.';
        
        if (saveBtn) {
            saveBtn.disabled = matched.length === 0;
        }
    };

    // Attach listeners to wizard dropdowns
    ['wiz_ses', 'wiz_lifestage', 'wiz_vals', 'wiz_neuro', 'wiz_b2b'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', calculateMatchingPersonas);
    });

    const initWizard = async () => {
        try {
            const { data, error } = await supabase.from('personas').select('id, name, ses_group, life_stage, vals_segment, neuro_trigger, b2b_segment').eq('is_active', true);
            if (!error) {
                loadedPersonasDb = data || [];
            }
        } catch(e) {
            console.error("Personalar yüklenemedi", e);
        }
        
        if (createSegmentForm) {
            document.getElementById('wiz_ses').value = 'any';
            document.getElementById('wiz_lifestage').value = 'any';
            document.getElementById('wiz_vals').value = 'any';
            document.getElementById('wiz_neuro').value = 'any';
            document.getElementById('wiz_b2b').value = 'any';
        }
        calculateMatchingPersonas();
    };

    // İkon Seçici Mantığı
    const iconOptions = document.querySelectorAll('.icon-option');
    const csIconInput = document.getElementById('cs_icon');
    const csIconDisplay = document.getElementById('cs-icon-display');
    const csIconPreviewBox = document.getElementById('cs-icon-preview-box');
    const csColorSelect = document.getElementById('cs_color');

    // Renk Teması Değişimi
    if (csColorSelect && csIconPreviewBox) {
        csColorSelect.addEventListener('change', (e) => {
            const color = e.target.value;
            csIconPreviewBox.className = "w-10 h-10 flex items-center justify-center border shrink-0 transition-colors";
            
            if (color === 'white') {
                csIconPreviewBox.classList.add('border-white', 'bg-white/20', 'text-white');
            } else if (color === 'neon-cyan') {
                csIconPreviewBox.classList.add('border-neon-cyan', 'bg-neon-cyan/20', 'text-neon-cyan');
            } else if (color === 'neon-magenta') {
                csIconPreviewBox.classList.add('border-neon-magenta', 'bg-neon-magenta/20', 'text-neon-magenta');
            } else if (color === 'neon-violet') {
                csIconPreviewBox.classList.add('border-neon-violet', 'bg-neon-violet/20', 'text-neon-violet');
            }
        });
    }

    iconOptions.forEach(opt => {
        opt.addEventListener('click', (e) => {
            const iconName = e.currentTarget.getAttribute('data-icon');
            
            if (csIconInput) csIconInput.value = iconName;
            if (csIconDisplay) csIconDisplay.innerText = iconName;
            
            iconOptions.forEach(o => {
                o.classList.remove('bg-neon-cyan/20', 'text-white');
                o.classList.add('hover:bg-neon-cyan/20', 'text-gray-400', 'hover:text-white');
            });
            
            e.currentTarget.classList.remove('hover:bg-neon-cyan/20', 'text-gray-400', 'hover:text-white');
            e.currentTarget.classList.add('bg-neon-cyan/20', 'text-white');
        });
    });

    if (createSegmentForm) {
        createSegmentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('cs_name').value.trim();
            const desc = document.getElementById('cs_desc').value.trim();
            const color = document.getElementById('cs_color').value;
            const icon = document.getElementById('cs_icon').value.trim() || 'groups';
            
            const selectedPersonas = currentMatchedPersonas;
            
            const btn = document.getElementById('btn-save-segment');
            const btnText = document.getElementById('cs-btn-text');
            
            if (selectedPersonas.length === 0) {
                csAlert.className = 'font-mono text-[10px] p-2 mt-2 border border-red-500/50 bg-red-500/10 text-red-400 block';
                csAlert.innerText = 'Hata: Kriterlere uyan en az bir persona olmalıdır.';
                return;
            }

            try {
                btn.disabled = true;
                btnText.innerHTML = '<span class="material-symbols-outlined animate-spin text-sm">refresh</span> KAYDEDİLİYOR...';
                
                // 1. Segment oluştur
                const { data: segmentData, error: segmentError } = await supabase
                    .from('segments')
                    .insert([{
                        name: name,
                        description: desc,
                        color_theme: color,
                        icon: icon,
                        user_id: currentUser.id
                    }])
                    .select()
                    .single();

                if (segmentError) throw segmentError;

                // 2. Segment-Persona ilişkilerini oluştur
                const spInserts = selectedPersonas.map(pid => ({
                    segment_id: segmentData.id,
                    persona_id: pid
                }));

                const { error: spError } = await supabase.from('segment_personas').insert(spInserts);
                if (spError) throw spError;

                csAlert.className = 'font-mono text-[10px] p-2 mt-2 border border-green-500/50 bg-green-500/10 text-green-400 block';
                csAlert.innerText = 'Başarılı! Yeni analiz sayfasına yönlendiriliyorsunuz...';
                
                setTimeout(() => {
                    window.location.href = 'new-analysis.html';
                }, 1500);

            } catch (err) {
                console.error("Error saving segment:", err);
                csAlert.className = 'font-mono text-[10px] p-2 mt-2 border border-red-500/50 bg-red-500/10 text-red-400 block';
                csAlert.innerText = 'Hata: ' + err.message;
            } finally {
                btn.disabled = false;
                btnText.innerHTML = '<span class="material-symbols-outlined text-sm">save</span> KAYDET';
            }
        });
    }

    // Init the wizard on page load
    initWizard();
});
