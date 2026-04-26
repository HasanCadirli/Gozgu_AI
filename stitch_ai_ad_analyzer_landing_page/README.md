<div align="center">
  <h1>Gözgü AI — Ad Analyzer Platform</h1>
  <p><b>Advanced AI-powered advertisement analysis platform simulating 52 demographically calibrated personas.</b></p>
  <p>Predict campaign performance, optimize creatives, and understand consumer psychology before spending a dime on ads.</p>
</div>

---

## 🎯 Platform Vision & Overview

Gözgü AI AI is not just an A/B testing tool; it is a **synthetic market simulation environment**. By leveraging Large Language Models (Gemini), advanced Computer Vision (SmolVLM2), and Audio Processing (Whisper), Gözgü AI AI creates a digital twin of your target audience. 

It simulates how real people—with unique psychological profiles, socio-economic backgrounds, and current economic realities—will react to your advertisement. 

###  Roadmap

**Phase 1 (Current): The Static Simulation**
Parallel, independent persona simulations generating AIDA scores and individual feedback based on real-time economic snapshots. Personas act in isolation, simulating a single exposure to an ad.

**Phase 2 (Upcoming): The "Palantir" Ontology & Multi-Agent Network**
Transitioning from a flat relational database to a multidimensional **Knowledge Graph** (Graph Database). In this phase, Gözgü AI AI evolves into a complex adaptive system where personas are no longer isolated—they interact, influence, and cascade information, similar to Palantir's ontological models.

Key Phase 2 Features:
- **Knowledge Graph Architecture (Neo4j):** Everything becomes a connected Node. Personas, Ad Campaigns, Brands, Macro-Economic Events, and Cultural Trends will be dynamically linked by Edges (e.g., `[Persona A] -[INFLUENCES]-> [Persona B]`, `[MacroEvent] -[IMPACTS]-> [Persona C]`).
- **Viral & Word-of-Mouth Simulation:** If a "Trendsetter" persona (high Openness, high Status) reacts positively to an ad, the system dynamically passes this data to "Follower" personas in their network as Social Proof. You can watch an ad go viral or fail within the simulated society.
- **Temporal Event Cascades:** Simulating time. What happens to campaign performance when the Central Bank raises interest rates mid-campaign? The Knowledge Graph ripples this macro-event through the network, instantly altering the purchasing power and psychology of vulnerable personas.
- **Multi-Agent Conversational Framework:** Transitioning from single-shot LLM prompts to an agentic framework (e.g., LangGraph). Personas will be able to "debate" products with each other in simulated focus groups.
- **Network Visualization:** A visual, interactive node-link diagram on the dashboard, allowing marketers to trace exactly *who* influenced *whom* to buy their product.

---

##  Core Capabilities

### 1. The 52 Persona Ecosystem
Built on Turkish demographic data (TÜİK/TÜAD), the platform hosts 52 distinct personas. Each persona is defined by:
- **Big Five Personality Traits:** Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism.
- **Socio-Economic Status (SES):** AB, C1, C2_DE groups.
- **Generational & Life Stage Data:** Single, Married, DINKs (Double Income No Kids), Retirees.
- **Archetypes & Shopping Drivers:** From "The Magician" seeking ROI to "The Caregiver" seeking safety.

### 2. AIDA Psychological Scoring
Every persona evaluates the ad across the AIDA funnel:
- **Attention:** Did the visual/hook grab them in the first 3 seconds?
- **Interest:** Does it resonate with their daily struggles and economic reality?
- **Desire:** Does it trigger their specific psychological vulnerabilities (FOMO, status, logic)?
- **Action:** The final probability of clicking or purchasing.

### 3. Context-Aware Simulation (Economic & Cultural)
Personas do not exist in a vacuum. Before analyzing an ad, Gözgü AI AI injects real-time **Macro-Economic Snapshots** (CPI, exchange rates) and **Cultural Trends**. A "panic saver" persona will react differently to a luxury ad during high inflation compared to an "unfazed" persona.

### 4. Advanced Media Processing
- **SmolVLM2:** Deep visual analysis extracting color palettes, focal points, and visual hierarchy.
- **Whisper:** Audio transcription and sentiment analysis of the voiceover/music.
- **OpenCV.js:** Heatmap generation highlighting the most salient parts of the ad creative.

---

##  Technical Architecture & Stack

Gözgü AI AI operates on a modern, decoupled architecture relying heavily on webhook-driven microservices.

| Layer | Technologies Used | Purpose |
|-------|------------------|---------|
| **Frontend** | Vite, Vanilla JS, Tailwind CSS, Chart.js | Lightning-fast UI, dynamic dashboards, and PDF report generation. |
| **Backend/BaaS** | Supabase (PostgreSQL, Auth, Storage) | User authentication, relational data storage, and secure media hosting. |
| **Orchestration** | n8n (Node-based workflow automation) | Manages the complex API chains, loops through 52 personas, and handles async AI tasks. |
| **AI Layer** | Google Gemini (Pro/Flash), SmolVLM2, Whisper | Cognitive processing, sentiment analysis, and creative optimization. |

###  Database Schema (PostgreSQL)
- `personas`: Core definitions of the 52 synthetic identities.
- `segments` / `segment_personas`: Custom audience grouping logic.
- `campaigns`: Ad metadata, media URLs, and targeting logic.
- `analysis_results`: Granular JSON dumps of every persona's AIDA scores and inner monologue.
- `macro_economic_snapshots`: Historical and current economic indicators (CPI, USD/TRY).
- `cultural_trend_snapshots`: Social media trend tracking.

---

##  Getting Started

Follow these instructions to set up the development environment locally.

### Prerequisites
1. **Node.js** (v18 or higher)
2. **Supabase Project:** You need a free/pro Supabase instance for database and auth.
3. **n8n Instance:** Self-hosted or cloud n8n for workflow automation.
4. **API Keys:** Google Gemini API Key.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/Gözgü AI-ai-ad-analyzer.git
   cd Gözgü AI-ai-ad-analyzer
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Copy the example environment file and fill in your credentials.
   ```bash
   cp .env.example .env
   ```
   **Required `.env` Variables:**
   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   VITE_N8N_ANALYZE_WEBHOOK_URL=https://your-n8n-instance.com/webhook/analyze
   VITE_N8N_OPTIMIZE_WEBHOOK_URL=https://your-n8n-instance.com/webhook/optimize
   ```

4. **Start the Development Server:**
   ```bash
   npm run dev
   ```

---

##  Project Structure

```text
Gözgü AI-ai-ad-analyzer/
├── index.html              # Authentication & Landing Page
├── app.js                  # Global application logic & Auth handlers
├── new-analysis.html       # Campaign Creation Wizard (3-Steps)
├── new-analysis.js         # Wizard logic, media upload (Supabase Storage)
├── dashboard.html          # Comprehensive Analysis Dashboard
├── dashboard.js            # Engine for rendering charts, heatmaps, AI suggestions
├── create-segment.html     # Custom Persona Segment Builder
├── create-segment.js       # Segment CRUD operations
├── supabase-config.js      # Supabase Client Initialization
├── theme.css               # Global Tailwind & Custom CSS directives
└── theme.js                # Dark/Light mode persistence
```

---

##  Dashboard Modules

The analysis results are presented in a 5-tab comprehensive dashboard:
1. **Overview:** Funnel conversion rates, overall 'Will Buy' percentages, and top responding personas.
2. **Demographics:** Heatmaps correlating SES groups with generation and emotion frequency.
3. **Persona Intel:** Granular view of each persona's "Fast Reaction", "Slow Reaction", and "Final Verdict".
4. **Media Analysis:** Breakdown of visual and audio cues, accompanied by OpenCV saliency heatmaps.
5. **Optimization:** AI-generated actionable advice to improve slogans, visuals, and psychological triggers.



