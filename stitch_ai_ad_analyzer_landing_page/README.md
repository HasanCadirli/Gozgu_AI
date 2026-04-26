# Stitch AI — Ad Analyzer Platform

AI-powered advertisement analysis platform that simulates **52 demographically calibrated personas** to predict campaign performance before launch.

## 🎯 Overview

Stitch AI uses large language models (Gemini) to simulate how real people from different demographic segments would react to your advertisement. Each persona has unique psychological profiles (Big Five traits), socioeconomic backgrounds, and behavioral patterns based on Turkish demographic data (TÜİK/TÜAD).

### Key Features

- **AIDA Analysis** — Attention, Interest, Desire, Action scoring per persona
- **52 Persona Ecosystem** — Segmented by SES (AB, C1, C2_DE), generation, gender
- **Real-time Economic Context** — Macro-economic data integration (CPI, exchange rates)
- **Cultural Trend Radar** — Social media trend tracking with PR risk scoring
- **Media AI Analysis** — Visual analysis (SmolVLM2) + audio transcription (Whisper)
- **Heatmap Analysis** — OpenCV.js powered saliency maps on ad creatives
- **AI Optimization** — Automatic slogan, visual concept, and psychological trigger suggestions
- **PDF Reporting** — Comprehensive campaign analysis reports
- **Multi-channel Support** — Display, Stories, Feeds, Email, Web UI
- **Dark/Light Theme** — Professional UI with theme persistence

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + Vanilla JS + Tailwind CSS |
| Backend | Supabase (Auth, PostgreSQL, Storage) |
| Automation | n8n (webhook-driven workflows) |
| AI Models | Google Gemini, SmolVLM2, Whisper |
| Charts | Chart.js |
| Image Processing | OpenCV.js, heatmap.js |
| PDF | pdfMake |

## 📁 Project Structure

```
├── index.html              # Landing page (auth, campaign creation)
├── app.js                  # Landing page logic (login/signup, modals)
├── new-analysis.html       # 3-step campaign creation wizard
├── new-analysis.js         # Wizard logic (persona selection, video upload)
├── dashboard.html          # Analysis dashboard (5-tab system)
├── dashboard.js            # Dashboard engine (polling, rendering, charts)
├── create-segment.html     # Custom segment builder
├── create-segment.js       # Segment creation logic
├── supabase-config.js      # Supabase client initialization
├── theme.css               # Design system & theming
├── theme.js                # Dark/light mode toggle
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules
└── package.json            # Project dependencies
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [n8n](https://n8n.io) instance with configured workflows

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/stitch-ai-ad-analyzer.git
cd stitch-ai-ad-analyzer

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your actual credentials

# Start development server
npm run dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous key |
| `VITE_N8N_ANALYZE_WEBHOOK_URL` | n8n webhook URL for campaign analysis |
| `VITE_N8N_OPTIMIZE_WEBHOOK_URL` | n8n webhook URL for campaign optimization |

## 📊 Dashboard Tabs

1. **Overview** — Conversion funnel, will-buy donut chart, top/bottom personas
2. **Demographic Analysis** — SES breakdown, generation charts, cross-tab heatmap, emotion frequency map
3. **Persona Intel** — Individual persona cards with filtering (SES, generation, gender, buy status)
4. **Media Analysis** — SmolVLM2 visual analysis, Whisper transcription, OpenCV heatmap
5. **Optimization** — AI-powered creative suggestions, Pomelli prompt generation

## 🗄️ Database Schema

The platform uses 9 interconnected PostgreSQL tables:

- `personas` — 52 calibrated personas with Big Five traits, SES data
- `segments` / `segment_personas` — Persona grouping system
- `campaigns` — Campaign data including media analysis results
- `analysis_results` — AIDA scores, emotions, buy decisions per persona
- `campaign_optimizations` — AI optimization suggestions
- `macro_economic_snapshots` — Real-time economic indicators
- `cultural_trend_snapshots` — Social media trends and risk levels
- `profiles` — User profiles and subscription plans

## 📄 License

This project is proprietary software. All rights reserved.
