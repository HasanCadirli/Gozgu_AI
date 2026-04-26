# 🔧 DOSYA 1/3 — n8n WORKFLOW DEĞİŞİKLİKLERİ

> **Amaç:** Tüm LLM girdilerini, v2 "Ekonomik Sahne" modeline ve genel prompt mühendisliği en iyi pratiklerine göre yeniden yapılandırmak.
> **Prensip:** "Context over Instructions" — LLM'e talimat değil bağlam ver. "Show, Don't Tell."

---

## DEĞİŞİKLİK SIRASI (Bu sırayla uygula)

---

### 1. YENİ NODE: "Get Economic Snapshot" (Supabase)

**Konum:** `Get many rows` (kampanya verisi) ile paralel veya hemen ardında, Loop'a girmeden **önce**.
**Tip:** Supabase — Get All
**Tablo:** `macro_economic_snapshots`
**Filtre:** Yok (returnAll: false, limit: 1)
**Sıralama:** `snapshot_date` DESC
**executeOnce:** `true`

**Amaç:** Her analiz tetiklendiğinde en güncel makroekonomik veriyi tek seferde çeker. Loop içinde tekrarlanmaz.



---

### 2. YENİ NODE: "Economic Scene Builder" (Code Node — JavaScript)

**Konum:** Loop Personas'ın **İÇİNDE**, `Get many rows1` (persona verisi) ile `Basic LLM Chain1` (ana Gemini prompt) arasında.
**Tip:** n8n Code Node (JavaScript)
**executeOnce:** `false` (her persona için ayrı ayrı çalışmalı)

#### Girdiler:
```
macro = $('Get many rows2').first().json   // veya güncellenen Get Economic Snapshot node adı
persona = $('Loop Personas').item.json
```

#### Çıktılar:
```json
{
  "ekonomik_sahne": "string — nesnel günlük hayat gerçeklikleri, ~5-7 madde",
  "kisisel_ekonomik_durum": "string — personanın gelir seviyesinin somut karşılığı"
}
```

#### İÇ MANTIK — JavaScript Kodu Nasıl Çalışmalı:

```
Adım 1: Makro verilerden NESNEL sahne cümleleri üret
─────────────────────────────────────────────────────
cpi_annual_pct → sayıyı somut hayata çevir:
  - cpi > 60: "Geçen yıl 100₺'ye aldığın market sepeti şimdi 160₺'den fazla."
  - cpi > 40: "Fiyatlar son bir yılda belirgin şekilde arttı. 100₺'lik alışveriş şimdi yaklaşık 140-150₺."
  - cpi > 20: "Fiyatlarda belli bir artış var ama dramatik değil."
  - cpi <= 20: "Fiyatlar nispeten stabil, büyük değişim yok."

usd_try_rate → somutlaştır:
  - usd > 35: "Dolar {{usd}}₺ seviyesinde. İthal ürünler ve yurt dışı hizmetler çok pahalı."
  - usd > 25: "Dolar {{usd}}₺. İthal ürünlerde fiyat artışı hissediliyor."
  - usd <= 25: "Döviz kurları nispeten stabil."

consumer_confidence_idx → (varsa, null olabilir)
  - < 80: "Çevrende insanlar gelecekten kaygılı. İşten çıkarmalar, tasarruf konuşmaları duyuluyor."
  - 80-100: "İnsanlar temkinli ama panikte değil."
  - > 100: "Genel olarak geleceğe dair iyimser bir hava var."

economic_sentiment → genel ortam:
  - "kriz": "Haberler ve sosyal medya sürekli ekonomik krizden bahsediyor."
  - "daralma": "Ekonomide bir yavaşlama var, herkes biraz temkinli."
  - "duragan": "Ekonomi ne iyi ne kötü, işler normal akışında."
  - "buyume": "Ekonomi iyiye gidiyor, iş olanakları ve yatırımlar artıyor."
  - "canlanma": "Uzun bir durgunluktan sonra piyasada hareketlenme başlamış."

unemployment_rate_pct → (varsa):
  - > 10: "İşsizlik yüksek, her 10 kişiden 1'inden fazlası iş bulamıyor."

Adım 2: Personanın kişisel ekonomik durumunu NESNEL olarak yaz
──────────────────────────────────────────────────────────────
ses_group × monthly_income_band → gelir seviyesinin somut karşılığı:

  C2_DE + cok_dusuk/dusuk:
    "Aylık gelirin asgari ücret civarında. Kira ve faturalardan sonra eline çok az kalıyor."

  C2_DE + orta:
    "Aylık gelirin ortalamanın altında. Temel ihtiyaçları karşılıyorsun ama her ekstra harcama bütçeni zorluyor."

  C1 + orta:
    "Aylık gelirin ortalamanın biraz üstünde. Temel ihtiyaçlarını karşılıyorsun ama büyük alımlar için birikim yapmak zor."

  C1 + yuksek:
    "Gelirin rahat bir yaşam sürmeye yetiyor. Hem ihtiyaçlarına hem isteklerine ayırabiliyorsun."

  AB + yuksek/cok_yuksek:
    "Aylık gelirin rahat bir yaşam standardı sağlıyor. Lüks dahil çoğu harcamayı düşünmeden yapabilirsin."

Adım 3: Cümleleri birleştir
───────────────────────────
ekonomik_sahne = tüm makro cümleleri "\n- " ile birleştir (bullet list formatı)
kisisel_ekonomik_durum = adım 2'deki tek cümle
```

> [!WARNING]
> **KRİTİK KURAL — Hiçbir duygu kelimesi YAZMA:**
> ❌ "stresli", "panikli", "rahat", "mutlu", "endişeli", "suçlu" → YASAK
> ❌ "harcama yapma", "kendinle ödüllendir", "dikkat et" → YASAK
> ✅ Sadece gözlemlenebilir, nesnel, sayısal gerçekler yaz

---

### 3. ANA PERSONA PROMPT'U TAM YENİDEN YAPILANDIRMASI

Bu, sistemdeki en kritik değişiklik. Mevcut `Basic LLM Chain1` node'undaki prompt'u **tamamen** değiştir.

#### MEVCUT SORUNLAR (Prompt Audit):

| Satır | Sorun | Bilimsel Problem |
|-------|-------|-----------------|
| `PERSONANIN EKONOMİK PROFİLİ` bölümü | Enflasyon hassasiyeti, döviz farkındalığı gibi RAW SAYILAR veriliyor (50/100, 70/100) | LLM bunu "analist modu" tetikleyicisi olarak algılıyor → **Persona Collapse** |
| `EKONOMİK DAVRANIŞ SİMÜLASYON KURALLARI` (8 madde) | Doğrudan davranış TALİMATI veriliyor ("ASLA will_buy=true vermemeli", "FOMO tetiklenmeli") | **Overprescription** — Anthropic/Stanford araştırmalarına göre en büyük hata |
| System message | "panic_saver davranışlı personalar neredeyse hiçbir şey almaz" | Persona'ya nasıl davranacağını DİKTE ediyor → **Özgürlük kısıtı** |
| `TÜFE Enflasyonu: %30` (hardcoded) | Gerçek snapshot verisinden gelmiyor, sabit yazılmış | **Yanlış veri** |
| Kanal bazlı fark yok | Tüm kanallara aynı prompt gidiyor | Display banner vs Stories vs Feed tamamen farklı dikkat süresi ve davranış |

#### YENİ PROMPT MİMARİSİ:

**System Message (messages → messageValues → message):**

```
Sen bir yapay zeka değilsin. Sen gerçek, nefes alan, hayalleri ve zaafları olan
bir insansın. Birazdan sana kim olduğunu detaylıca anlatacağım. Senden tek istediğim
tamamen o karakterin zihninden düşünmen ve tepki vermen.

Senin için bir ekonomik ortam tarif edilecek. Bu ortamda YAŞAYAN sıradan bir
insansın. Ekonomiyi sayılarla analiz etme — günlük hayatında hissettiğin baskı,
rahatlık veya sıkışıklıkla yansıt. Nasıl yorumlayacağını kendi kişiliğin,
mesleğin ve yaşam önceliklerinin belirlesin.

Cevabını SADECE istenilen JSON formatında ver. Ek açıklama, markdown veya
başka bir formatlama KULLANMA.
```

**Ana Prompt (text):**

```
= KİM OLDUĞUN =
İsim: {{ persona.name }} ({{ persona.age }} yaşında)
Meslek: {{ persona.job_title }}
Kişilik (Big Five): {{ JSON.stringify(persona.big_five_traits) }}
Arketip: {{ persona.primary_archetype }}
Zaafların ve Motivasyonların: {{ persona.shopping_drivers }}
Hayat Hikayen: {{ persona.bio_summary }}

= İÇİNDE YAŞADIĞIN EKONOMİK ORTAM =
(Bunlar senin günlük hayatında karşılaştığın gerçekler — {{ tarih }})
{{ ekonomik_sahne }}

Senin Durumun:
{{ kisisel_ekonomik_durum }}

= TOPLUMSAL HAVA =
Toplumun Genel Duygu Durumu: {{ societal_mood }}
Şu An Konuşulan Konular: {{ trending_topics }}

= KARŞINA ÇIKAN REKLAM =
Kampanya: {{ campaign.name }}
Slogan: {{ campaign.ad_slogan }}
Gördüğün Kanal: {{ campaign.channel_type }}
Reklamın Amacı: {{ campaign.objective }}
Marka Tonu: {{ campaign.brand_tone }}
Değer Teklifi: {{ campaign.value_proposition }}
Eylem Çağrısı (CTA): {{ campaign.call_to_action }}
Hedef Kitle: {{ campaign.intended_audience_desc }}
Marka Kısıtlamaları: {{ campaign.brand_guidelines }}

Reklamın Görsel/Video İçeriği:
{{ gorsel_icerik_sonucu }}

= TEPKİN =
Günlük hayatının sıradan bir anındasın. Belki asansörde bekliyorsun, belki
telefonunda kaydırıyorsun. Dikkatin dağınık. Derken bu reklam karşına çıkıyor.

Lütfen şu adımları SIRASINI TAKIP EDEREK yanıtla:

1. O İlk 3 Saniye: Reklamı gördüğün andaki filtresiz, sansürsüz iç sesin.
   Ekonomiyi düşünme, mantık kurma — sadece görsele, slogana, renklere tepki ver.
   (Örn: "Oha bu renk mükemmel!", "Off yine mi bu marka...", "Aa bu bende de var!")

2. Baskın Duygun: O an göğsünde hissettiğin tek kelimelik his.

3. Mantığa Bürünme: İlk tepkiden sonra biraz durakladın. Hayat durumunu, ekonomik
   ortamını, önceliklerini düşündün. Şimdi kendi kendine ne diyorsun? Ürüne/markaya
   olan ilgin devam mı etti, söndü mü? Neden? (İç sesinle konuş)

4. Nihai Karar: Tüm bunlar ışığında — bu ürünü alır mısın? Neden?

Cevabını SADECE bu formatta ver:

{
  "reaction_fast": "(İlk 3 saniyedeki sansürsüz iç sesin)",
  "dominant_emotion": "(Tek kelime — baskın duygu)",
  "reaction_slow": "(Mantığa bürünme, kendi kendine ikna/vazgeçirme)",
  "final_verdict": "(Nihai kararın ve gerekçesi)",
  "score_attention": (1-100 — reklam dikkatini çekti mi?),
  "score_interest": (1-100 — zaaflarına ve hayatına dokundu mu?),
  "score_desire": (1-100 — ürüne sahip olma arzusu),
  "score_action": (1-100 — tıklama/satın alma ihtimalin),
  "will_buy": true/false
}
```

#### NELER KALDIRILDI VE NEDEN:

| Kaldırılan | Neden |
|-----------|-------|
| `economic_sensitivity` sayısal değerleri (50/100, 70/100) | LLM'i analist moduna sokuyor. Bu veriler persona'nın bio_summary ve shopping_drivers'ında zaten örtük olarak var |
| 8 maddelik "Ekonomik Davranış Simülasyon Kuralları" | **Overprescription.** Persona'ya ne yapacağını dikte ediyor. v2'de LLM kendi kişiliğiyle karar verir |
| Hardcoded `TÜFE: %30` | Gerçek snapshot verisinden dinamik gelecek |
| System message'daki davranış talimatları | "Context over Instructions" prensibine aykırıydı |
| `panic_saver`, `opportunist` gibi etiketler prompt'ta | Bu bilgi persona'nın bio_summary'sinde zaten var. Etiket olarak vermek davranışı kilitliyor |

#### NELER EKLENDİ VE NEDEN:

| Eklenen | Neden |
|---------|-------|
| `ekonomik_sahne` (nesnel gerçekler) | Gibson Affordance: ortam fırsat sunar, emretmez |
| `kisisel_ekonomik_durum` (gelir somutlaştırma) | Shiller Narrative Economics: rakam değil hikâye |
| "Ekonomiyi düşünme" Sistem 1 yönergesi | Gerçek hayatta ilk 3 saniyede kimse TÜFE düşünmez |
| "Ekonomik ortamını... düşündün" Sistem 2'de | Ekonomik bağlam doğal olarak burada devreye girer |
| Kültürel gündem entegrasyonu | Zaten mevcut ama daha doğal akışa oturtuldu |

---

### 4. MEDYA ANALİZ PROMPT'LARININ İYİLEŞTİRİLMESİ

#### 4a. Görsel Analiz Prompt'u (Basic LLM Chain — image)

**Mevcut:** "Bana bu reklam görselinde ne gördüğünü objektif ve doğru bir şekilde anlat kısa ve öz olsun"

**Yeni:**
```
Bu bir reklam görseli. Lütfen şu perspektiflerden kısa ve yapılandırılmış bir
analiz yap:

1. GÖRSEL KOMPOZİSYON: Ana odak noktası, renk paleti, ışık kullanımı,
   görsel hiyerarşi (göz ilk nereye gidiyor?)
2. ÜRÜN/MARKA: Ürün veya marka nasıl konumlandırılmış? Görsel olarak öne mi çıkıyor
   yoksa bağlama mı gömülmüş?
3. İNSAN/KARAKTER: Görsel bir insan figürü varsa — yaş tahmini, ifade, bakış yönü,
   giyim tarzı
4. METİN/TIPOGRAFI: Görseldeki metin içeriği, font boyutu, okunabilirlik
5. DUYGUSAL TON: Görselin genel atmosferi (enerji seviyesi, sıcak/soğuk, lüks/sade)
6. KANAL UYGUNLUĞU: Bu görsel bir mobil ekranda (Stories/Feed) mı yoksa masaüstü
   banner'da mı daha iyi çalışır?

Cevabını düz metin olarak ver, numaralandırılmış maddeler halinde.
```

**Neden:** Mevcut prompt sadece "görselde ne var" soruyor. Yeni prompt, reklamcılık perspektifinden analiz istiyor — bu bilgi persona prompt'una gittiğinde çok daha zengin bağlam sağlar.

#### 4b. Video Analiz Prompt'u (Analyze video)

**Mevcut:** "Sana verilen reklam videosunu hem GÖRSEL hem de İŞİTSEL olarak incelemelisin. Kısa ve öz..."

**Yeni:**
```
Bu bir reklam videosu. Lütfen şu perspektiflerden analiz yap ve cevabını SADECE
aşağıdaki JSON formatında üret:

{
  "visual_description": "(Videodaki görsel akış: açılış karesinin etkisi, renk
    paleti, tempo/ritim, ürün gösterim anı, kapanış karesi. İzleyicinin gözü
    nereye yönlendiriliyor?)",
  "audio_analysis": "(Müzik/ses tasarımı: enerji seviyesi (düşük/orta/yüksek),
    müzik türü, ses tonu (sakin/heyecan verici/dramatik/neşeli). Ses, görseli
    destekliyor mu yoksa çelişiyor mu?)",
  "transcript": "(Videoda duyulan konuşma/seslendirmelerin tam dökümü. Yoksa
    'Konuşma/seslendirme yok, sadece müzik.' yaz)",
  "pacing": "(Video tempo: Hızlı kesme mi, yavaş akış mı? Ortalama sahne
    süresi tahmini)"
}
```

---

### 5. OPTİMİZASYON WORKFLOW PROMPT'U İYİLEŞTİRMESİ

Mevcut `optimize-campaign` webhook'unun prompt'u şu an bilinmiyor (bu workflow n8n'de ayrı). Eğer mevcutsa, şu iyileştirmeleri uygula:

**Optimizasyon AI'ına giden ekstra bağlam:**
```
KAMPANYANIN MEVCUT PERFORMANSI:
- Ortalama AIDA Skorları: Dikkat: X%, İlgi: X%, Arzu: X%, Aksiyon: X%
- Satın Alma Oranı: X% (Y/Z persona)
- En düşük metrik: [hangi AIDA boyutu]
- En tepkisiz persona profili: [düşük skor veren personaların ortak özellikleri]
- En tepkili persona profili: [yüksek skor veren personaların ortak özellikleri]

Ekonomik Ortam: {{ economic_sentiment }}

Bu bilgiler ışığında:
1. Sloganı, EN TEPKİSİZ persona profilinin zaaflarına hitap edecek şekilde güçlendir
2. Görsel konsept önerisini, mevcut ekonomik ortamın tüketici psikolojisiyle uyumlu tut
3. Psikolojik tetikleyiciyi, en düşük AIDA boyutunu hedefleyecek şekilde seç
```

---

### 6. "Get many rows1" (Persona Fetch) — EK ALANLAR

Mevcut persona fetch'i (`Get many rows1`) tüm alanları (`*`) çekiyor olmalı. Emin ol ki şu alanlar prompt'a ulaşıyor:

| Alan | Prompt'ta Kullanım Yeri |
|------|------------------------|
| `name`, `age`, `job_title` | Kimlik bölümü |
| `big_five_traits` | Kişilik bölümü |
| `primary_archetype` | Kişilik bölümü |
| `shopping_drivers` | Motivasyon bölümü |
| `bio_summary` | Hayat hikayesi |
| `ses_group` | Economic Scene Builder girdisi |
| `monthly_income_band` | Economic Scene Builder girdisi |
| `economic_sensitivity` | Economic Scene Builder girdisi (prompt'a DEĞİL) |
| `life_stage` | Economic Scene Builder girdisi (opsiyonel bağlam) |

> [!IMPORTANT]
> `economic_sensitivity`, `ses_group` ve `monthly_income_band` artık doğrudan Gemini prompt'una GİTMEYECEK. Bunlar **sadece** Economic Scene Builder'ın girdisi olarak kullanılacak. Builder'ın ürettiği nesnel sahne metni prompt'a gidecek.

---

### 7. BAĞLANTI (Connection) DEĞİŞİKLİKLERİ

Mevcut akış:
```
Loop Personas → Basic LLM Chain1 → Code in JavaScript → Create a row → Loop
```

Yeni akış:
```
Loop Personas → Economic Scene Builder (Code Node) → Basic LLM Chain1 → Code in JavaScript → Create a row → Loop
```

Economic Scene Builder'ın çıktısı (`ekonomik_sahne`, `kisisel_ekonomik_durum`) prompt'ta şu şekilde referans edilecek:
```
{{ $('Economic Scene Builder').item.json.ekonomik_sahne }}
{{ $('Economic Scene Builder').item.json.kisisel_ekonomik_durum }}
```

---

### 8. KANAL BAZLI PROMPT UYARLAMASI (ÖNCELİK: ORTA)

Mevcut sistemde tüm kanallara aynı prompt gidiyor. Ancak kanal tipi davranışı etkiler:

**Prompt'un "KARŞINA ÇIKAN REKLAM" bölümüne kanal bağlamı eklenmeli:**

```
Gördüğün Kanal: {{ channel_type }}
```

Economic Scene Builder'a veya prompt'a kanal bağlamı ekle:

| Kanal | Ek Bağlam |
|-------|-----------|
| DISPLAY | "Bu reklamı bir web sitesinde gezinirken yan tarafta veya üst tarafta gördün. Dikkat süren kısa, çoğu banner reklamı otomatik görmezden gelirsin." |
| STORIES | "Bu reklamı telefonda Stories kaydırırken gördün. 3-5 saniye süren var, hızla geçebilirsin. Tam ekran, dikey format." |
| FEEDS | "Bu reklamı sosyal medya akışında kaydırırken gördün. Arkadaşlarının paylaşımları arasına karışmış durumda." |
| EMAIL | "Bu reklam gelen kutuna düşen bir e-posta bülteni içinde. Açtıysan zaten bir miktar ilgin var demek." |
| WEB_UI | "Bu reklam bir web sitesinin içeriğine entegre edilmiş. Doğal görünüyor." |

---

## ÖZET — DEĞİŞİKLİK KONTROL LİSTESİ

| # | Görev | Tip | Durum |
|---|-------|-----|-------|
| 1 | `Get many rows2` node'unu `returnAll:false, limit:1, sort:DESC` yap | Node güncelleme | ⬜ |
| 2 | `Economic Scene Builder` Code Node'u oluştur | Yeni node | ⬜ |
| 3 | `Basic LLM Chain1` prompt'unu tamamen değiştir | Prompt yeniden yazım | ⬜ |
| 4 | `Basic LLM Chain1` system message'ı güncelle | System message | ⬜ |
| 5 | Görsel analiz prompt'unu güncelle (`Basic LLM Chain`) | Prompt iyileştirme | ⬜ |
| 6 | Video analiz prompt'unu güncelle (`Analyze video`) | Prompt iyileştirme | ⬜ |
| 7 | Economic Scene Builder → Basic LLM Chain1 bağlantısı | Bağlantı ekleme | ⬜ |
| 8 | Kanal bağlamı ekleme (opsiyonel) | Prompt zenginleştirme | ⬜ |
