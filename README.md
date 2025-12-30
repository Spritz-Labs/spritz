# Spritz 🍊

Real-time messaging, video calls, livestreaming, and AI agents for Web3. Connect with friends using passkeys or wallets, chat via decentralized messaging, make HD video calls, go live with WebRTC streaming, and create custom AI agents.

**Live at [app.spritz.chat](https://app.spritz.chat)**

## Features

### 🤖 AI Agents (Beta)

- **Custom AI Agents** - Create personalized AI assistants with unique personalities
- **Google Gemini Powered** - Leverages Gemini 2.0 Flash for intelligent conversations
- **Knowledge Base (RAG)** - Add URLs to give agents domain-specific knowledge
- **Web Search Grounding** - Agents can search the web for real-time information
- **x402 Micropayments** - Monetize your agents with Coinbase's x402 protocol
- **Agent Discovery** - Explore public agents and share with friends
- **Tags & Search** - Tag agents for easy discovery
- **Favorites** - Star your favorite agents for quick access

### 📹 Communication

- **HD Video Calls** - Real-time video and voice calls powered by Huddle01
- **Decentralized Messaging** - End-to-end encrypted chat via Waku protocol
- **Group Calls** - Multi-party video calls with friends
- **Voice Messages** - Record and send voice notes
- **Push Notifications** - Get notified of incoming calls and messages
- **Link Previews** - Rich previews for shared URLs

### 📺 Livestreaming

- **Go Live** - Broadcast live video to your friends with one tap
- **WebRTC Streaming** - Low-latency streaming powered by Livepeer
- **Vertical Video** - Optimized 9:16 portrait mode for mobile
- **Real-time Viewer Count** - See how many people are watching live
- **Auto-Recording** - Streams are automatically recorded for later playback
- **HLS Playback** - Viewers watch via adaptive HLS streaming
- **Live Badge** - Friends see when you're live on their dashboard

### 🔐 Identity & Authentication

- **Multi-Chain Support** - Connect Ethereum, Base, and Solana wallets
- **SIWE/SIWS** - Sign-In With Ethereum/Solana for secure authentication
- **Passkey Authentication** - Passwordless login using Face ID, Touch ID, or Windows Hello
- **Multi-Wallet Support** - Connect MetaMask, Coinbase Wallet, Phantom, and 300+ wallets
- **ENS Integration** - Resolve ENS names with live avatar preview
- **Smart Accounts** - ERC-4337 account abstraction with Safe

### 👥 Social

- **Friends System** - Add friends, manage requests, and organize with tags
- **Groups** - Create and join group chats
- **Pixel Art Avatars** - Create custom 8-bit profile pictures
- **Status Updates** - Share what you're up to with friends
- **QR Code Scanning** - Quickly add friends by scanning their QR code
- **Phone/Email Verification** - Optionally verify your identity
- **Social Links** - Connect Twitter, Farcaster, and Lens profiles

### 📊 Admin & Analytics

- **Admin Dashboard** - Manage users, invite codes, and permissions
- **Analytics** - Track usage metrics with beautiful charts
- **Beta Access Control** - Gate features for beta testers
- **Points & Leaderboard** - Gamification with daily rewards

### 📱 Experience

- **PWA Support** - Install as a native app on iOS, Android, and desktop
- **3D Globe** - Beautiful interactive globe visualization
- **Dark Mode** - Sleek dark UI throughout
- **Mobile Optimized** - Fully responsive design
- **Censorship Resistance** - Optional decentralized calling via Huddle01

## Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 16 with App Router |
| **Styling** | Tailwind CSS 4 |
| **Animations** | Motion (Framer Motion) |
| **3D Graphics** | Three.js with React Three Fiber |
| **Web3 (EVM)** | viem, wagmi, permissionless.js |
| **Web3 (Solana)** | @solana/wallet-adapter |
| **Account Abstraction** | Pimlico, Safe Smart Accounts |
| **Wallet Connection** | Reown AppKit (WalletConnect) |
| **Video Calls** | Huddle01 SDK |
| **Livestreaming** | Livepeer (WebRTC/WHIP + HLS) |
| **Messaging** | Waku Protocol |
| **AI/LLM** | Google Gemini API |
| **Vector Search** | Supabase pgvector |
| **Database** | Supabase (Postgres + Realtime) |
| **Push Notifications** | Web Push API |
| **Payments** | x402 Protocol (Coinbase) |

## Getting Started

### Prerequisites

- Node.js 18+
- npm (recommended) or yarn
- Supabase project
- Google Cloud account (for Gemini API)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/kmjones1979/spritz.git
cd spritz
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp .env.example .env.local
```

4. Configure your environment variables (see [Environment Variables](#environment-variables))

5. Run database migrations (see [Database Setup](#database-setup))

6. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

### Required

```env
# Supabase (Database & Realtime)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# WalletConnect / Reown
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
```

### AI Agents

```env
# Google Gemini (required for AI agents)
GOOGLE_GEMINI_API_KEY=your_gemini_api_key
```

### Video Calls

```env
# Huddle01
NEXT_PUBLIC_HUDDLE01_PROJECT_ID=your_huddle01_project_id
HUDDLE01_API_KEY=your_huddle01_api_key
```

### Livestreaming

```env
# Livepeer
LIVEPEER_API_KEY=your_livepeer_api_key
```

### Smart Accounts (Passkeys)

```env
# Pimlico (ERC-4337)
NEXT_PUBLIC_PIMLICO_API_KEY=your_pimlico_api_key
```

### Push Notifications

```env
# VAPID Keys (generate with web-push)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:your@email.com
```

### Phone Verification (Optional)

```env
# Twilio
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
TWILIO_VERIFY_SERVICE_SID=your_verify_service_sid
```

### Email Verification (Optional)

```env
# Resend
RESEND_API_KEY=your_resend_api_key
```

### Pixel Art Storage (Optional)

```env
# Pinata (IPFS)
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret_key
NEXT_PUBLIC_PINATA_GATEWAY=gateway.pinata.cloud
```

### Solana (Optional)

```env
# Helius RPC
NEXT_PUBLIC_HELIUS_API_KEY=your_helius_api_key
```

### x402 Payments (Optional)

```env
# x402 Configuration
NEXT_PUBLIC_APP_URL=https://app.spritz.chat
X402_FACILITATOR_URL=https://x402.org/facilitator
```

## Getting API Keys

### Supabase

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project
3. Go to Settings → API
4. Copy your Project URL, anon key, and service role key

### Google Gemini

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Click "Get API Key"
3. Create a new API key
4. Free tier: 15 RPM, 1,500 requests/day

### Reown (WalletConnect)

1. Go to [Reown Cloud](https://cloud.reown.com/)
2. Create a new project
3. Copy your Project ID

### Pimlico

1. Go to [Pimlico Dashboard](https://dashboard.pimlico.io/)
2. Create an account and project
3. Copy your API key
4. Enable Base Sepolia network

### Huddle01

1. Go to [Huddle01 Dashboard](https://docs.huddle01.com/)
2. Create an account and project
3. Copy your Project ID and API Key

### Livepeer

1. Go to [Livepeer Studio](https://livepeer.studio/)
2. Create an account
3. Go to Developers → API Keys
4. Create a new API key with Stream and Asset permissions

## Database Setup

Spritz uses Supabase with several tables. Run these migrations in your Supabase SQL editor:

### Core Tables

```sql
-- Users table
CREATE TABLE shout_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    wallet_address TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    is_admin BOOLEAN DEFAULT FALSE,
    beta_access BOOLEAN DEFAULT FALSE,
    -- Analytics
    messages_sent INTEGER DEFAULT 0,
    friends_count INTEGER DEFAULT 0,
    voice_minutes NUMERIC DEFAULT 0,
    video_minutes NUMERIC DEFAULT 0,
    groups_joined INTEGER DEFAULT 0
);

-- Friends table
CREATE TABLE shout_friends (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_address TEXT NOT NULL,
    friend_address TEXT NOT NULL,
    tag TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_address, friend_address)
);

-- Friend requests
CREATE TABLE shout_friend_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### AI Agents Tables

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Agents table
CREATE TABLE shout_agents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_address TEXT NOT NULL,
    name TEXT NOT NULL,
    personality TEXT,
    system_instructions TEXT,
    model TEXT DEFAULT 'gemini-2.0-flash',
    avatar_emoji TEXT DEFAULT '🤖',
    visibility TEXT DEFAULT 'private',
    web_search_enabled BOOLEAN DEFAULT TRUE,
    use_knowledge_base BOOLEAN DEFAULT TRUE,
    message_count INTEGER DEFAULT 0,
    tags JSONB DEFAULT '[]',
    -- x402 configuration
    x402_enabled BOOLEAN DEFAULT FALSE,
    x402_price_cents INTEGER DEFAULT 1,
    x402_network TEXT DEFAULT 'base-sepolia',
    x402_wallet_address TEXT,
    x402_pricing_mode TEXT DEFAULT 'global',
    -- MCP & API tools
    mcp_servers JSONB DEFAULT '[]',
    api_tools JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agent chat history
CREATE TABLE shout_agent_chats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_id UUID REFERENCES shout_agents(id) ON DELETE CASCADE,
    user_address TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge base chunks with embeddings
CREATE TABLE shout_knowledge_chunks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_id UUID REFERENCES shout_agents(id) ON DELETE CASCADE,
    knowledge_id UUID NOT NULL,
    content TEXT NOT NULL,
    embedding vector(768),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for vector similarity search
CREATE INDEX ON shout_knowledge_chunks 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Agent favorites
CREATE TABLE shout_agent_favorites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_address TEXT NOT NULL,
    agent_id UUID REFERENCES shout_agents(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_address, agent_id)
);
```

### Livestreaming Tables

```sql
-- Streams table
CREATE TABLE shout_streams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_address TEXT NOT NULL,
    stream_id TEXT NOT NULL,           -- Livepeer stream ID
    stream_key TEXT,                    -- Livepeer stream key (for WHIP)
    playback_id TEXT,                   -- Livepeer playback ID
    title TEXT,
    description TEXT,
    status TEXT DEFAULT 'idle',         -- idle, live, ended
    viewer_count INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stream assets (recordings)
CREATE TABLE shout_stream_assets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stream_id UUID REFERENCES shout_streams(id) ON DELETE CASCADE,
    user_address TEXT NOT NULL,
    asset_id TEXT NOT NULL UNIQUE,      -- Livepeer asset ID
    playback_id TEXT,
    playback_url TEXT,
    download_url TEXT,
    duration_seconds NUMERIC,
    size_bytes BIGINT,
    status TEXT DEFAULT 'processing',   -- processing, ready, failed
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX idx_streams_user ON shout_streams(user_address);
CREATE INDEX idx_streams_status ON shout_streams(status);
CREATE INDEX idx_stream_assets_stream ON shout_stream_assets(stream_id);
```

See the `/migrations` folder for complete migration scripts.

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── admin/          # Admin endpoints
│   │   ├── agents/         # AI agent CRUD & chat
│   │   ├── auth/           # SIWE/SIWS verification
│   │   ├── huddle01/       # Video call rooms
│   │   ├── streams/        # Livestreaming API
│   │   ├── public/         # Public agent API (x402)
│   │   └── ...
│   ├── admin/              # Admin pages
│   └── page.tsx            # Main app
├── components/
│   ├── AgentsSection.tsx   # AI agents UI
│   ├── AgentChatModal.tsx  # Agent chat interface
│   ├── CreateAgentModal.tsx
│   ├── EditAgentModal.tsx
│   ├── ExploreAgentsModal.tsx
│   ├── Dashboard.tsx       # Main dashboard
│   ├── ChatModal.tsx       # P2P chat
│   ├── VoiceCallUI.tsx     # Video/voice calls
│   ├── GoLiveModal.tsx     # Livestream broadcaster
│   ├── LiveStreamPlayer.tsx # Livestream viewer
│   └── ...
├── context/
│   ├── AuthProvider.tsx    # SIWE/SIWS auth
│   ├── WakuProvider.tsx    # Messaging
│   └── Web3Provider.tsx    # Wallet connection
├── hooks/
│   ├── useAgents.ts        # Agent management
│   ├── useAuth.ts          # Authentication
│   ├── useStreams.ts       # Livestream management
│   ├── useBetaAccess.ts    # Feature flags
│   └── ...
└── lib/
    ├── livepeer.ts         # Livepeer API utils
    └── x402.ts             # x402 payment utils
```

## AI Agents

### Creating an Agent

1. Click "Create Agent" in the Agents section
2. Choose a name and personality
3. Select visibility (private/friends/public)
4. Optionally add tags for discovery

### Knowledge Base (RAG)

Add URLs to your agent's knowledge base:

1. Open the agent's knowledge settings
2. Add URLs (GitHub repos, documentation, web pages)
3. Click "Index" to process the content
4. The agent will use this knowledge in conversations

### x402 Monetization

Enable x402 to charge for agent usage:

1. Edit your agent's capabilities
2. Enable x402 payments
3. Set your price (in cents per message)
4. Configure your wallet address
5. Share the public API endpoint

External developers can integrate your agent using:

```typescript
import { wrapFetch } from "x402-fetch";

const paidFetch = wrapFetch(fetch, wallet);
const response = await paidFetch(
  "https://app.spritz.chat/api/public/agents/{id}/chat",
  {
    method: "POST",
    body: JSON.stringify({ message: "Hello!" }),
  }
);
```

## Livestreaming

### Going Live

1. Tap the "Go Live" button on your dashboard
2. Allow camera and microphone access
3. Add an optional title for your stream
4. Tap "Go Live" to start broadcasting
5. Share with friends - they'll see your live badge

### Watching Streams

- Friends who are live show a red "LIVE" badge on their avatar
- Tap their avatar to join the stream
- See real-time viewer count
- Streams auto-retry if connection drops

### Technical Details

- **Broadcast**: WebRTC via WHIP protocol to Livepeer
- **Playback**: HLS adaptive streaming via Livepeer CDN
- **Resolution**: 1080x1920 (9:16 vertical/portrait)
- **Recording**: Automatic recording stored on Livepeer

## PWA Installation

Spritz works as a Progressive Web App:

- **iOS**: Tap Share → "Add to Home Screen"
- **Android**: Tap the install banner or Menu → "Install App"
- **Desktop**: Click the install icon in the address bar

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT

---

Built with 🍊 by the Spritz team

Powered by [Google Gemini](https://ai.google.dev/), [Huddle01](https://huddle01.com), [Livepeer](https://livepeer.org), [Waku](https://waku.org), [Supabase](https://supabase.com), [Pimlico](https://pimlico.io), [Reown](https://reown.com), and [x402](https://x402.org)
