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
- **Decentralized Messaging** - End-to-end encrypted chat via [Logos Messaging](https://logos.co/tech-stack) (prev. Waku) protocols
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

- **Multi-Chain Support** - Connect Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Unichain, and Solana wallets
- **SIWE/SIWS** - Sign-In With Ethereum/Solana for secure authentication
- **Passkey Authentication** - Passwordless login using Face ID, Touch ID, or Windows Hello
- **Multi-Wallet Support** - Connect MetaMask, Coinbase Wallet, Phantom, and 300+ wallets
- **ENS Integration** - Resolve ENS names with live avatar preview
- **Smart Accounts** - ERC-4337 account abstraction with Safe (same address on all EVM chains)

### 💰 Smart Wallet

- **Non-Custodial** - Your keys, your crypto. We never store private keys
- **Passkey Signing** - Sign transactions with Face ID, Touch ID, or Windows Hello
- **Multi-Chain** - Same wallet address on all 7 supported EVM chains
- **Gas Sponsorship** - Free transactions on L2s (Base, Arbitrum, Optimism, Polygon, BNB Chain, Unichain)
- **ERC-20 Gas** - Pay gas in USDC on Ethereum mainnet (no ETH needed)
- **The Graph Integration** - Real-time token balances and transaction history
- **Trusted Tokens** - Spam token filtering with curated whitelist

### 👥 Social

- **Friends System** - Add friends, manage requests, and organize with tags
- **Groups** - Create and join group chats
- **Pixel Art Avatars** - Create custom 8-bit profile pictures
- **Status Updates** - Share what you're up to with friends
- **QR Code Scanning** - Quickly add friends by scanning their QR code
- **Phone/Email Verification** - Optionally verify your identity
- **Social Links** - Connect Twitter, Farcaster, and Lens profiles

### 📅 Calendar Integration

- **Google Calendar Sync** - Connect your Google Calendar to sync availability
- **Availability Windows** - Set up recurring availability windows (like Calendly)
- **Scheduling API** - Coming soon: Schedule calls with others via AI agents or links
- **x402 Payments** - Coming soon: Charge for scheduled calls using x402

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
| **Account Abstraction** | Pimlico, Safe Smart Accounts (ERC-4337) |
| **Token Data** | The Graph Token API |
| **Wallet Connection** | Reown AppKit (WalletConnect) |
| **Video Calls** | Huddle01 SDK |
| **Livestreaming** | Livepeer (WebRTC/WHIP + HLS) |
| **Messaging** | [Logos Messaging](https://logos.co/tech-stack) Protocols |
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
git clone https://github.com/Spritz-Labs/spritz.git
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
# Pimlico (ERC-4337 Bundler & Paymaster)
NEXT_PUBLIC_PIMLICO_API_KEY=your_pimlico_api_key
NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY_ID=sp_your_policy_id

# The Graph Token API (for balances & transactions)
GRAPH_TOKEN_API_KEY=your_graph_token_api_key

# Email Auth (Optional - for email login feature)
EMAIL_AUTH_SECRET=your_secure_secret_for_email_key_derivation
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

### Google Calendar (Optional)

```env
# Google Calendar OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=https://app.spritz.chat/api/calendar/callback
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
4. Create a sponsorship policy and copy the policy ID
5. Fund your paymaster on each chain you want to sponsor:

| Chain | Sponsorship | Fund Paymaster? |
|-------|-------------|-----------------|
| Ethereum | User pays USDC | No |
| Base | Sponsored | Yes |
| Arbitrum | Sponsored | Yes |
| Optimism | Sponsored | Yes |
| Polygon | Sponsored | Yes |
| BNB Chain | Sponsored | Yes |
| Unichain | Sponsored | Yes |

### The Graph Token API

1. Go to [The Graph Token API](https://thegraph.com/studio/apikeys/)
2. Create an API key
3. Token API provides real-time balances and transaction history across all chains

### Huddle01

1. Go to [Huddle01 Dashboard](https://docs.huddle01.com/)
2. Create an account and project
3. Copy your Project ID and API Key

### Livepeer

1. Go to [Livepeer Studio](https://livepeer.studio/)
2. Create an account
3. Go to Developers → API Keys
4. Create a new API key with Stream and Asset permissions

### Google Calendar

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API:
   - Go to "APIs & Services" → "Library"
   - Search for "Google Calendar API"
   - Click "Enable"
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Choose "Web application"
   - Add authorized redirect URI: `https://app.spritz.chat/api/calendar/callback` (or your domain)
   - Copy the Client ID and Client Secret
5. Add the credentials to your `.env` file:
   ```env
   GOOGLE_CLIENT_ID=your_client_id
   GOOGLE_CLIENT_SECRET=your_client_secret
   GOOGLE_REDIRECT_URI=https://app.spritz.chat/api/calendar/callback
   ```

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
│   ├── WakuProvider.tsx    # Messaging (Logos Messaging)
│   └── Web3Provider.tsx    # Wallet connection
├── hooks/
│   ├── useAgents.ts        # Agent management
│   ├── useAuth.ts          # Authentication
│   ├── useStreams.ts       # Livestream management
│   ├── useBetaAccess.ts    # Feature flags
│   ├── useSmartWallet.ts   # Safe wallet address
│   ├── useSafePasskeySend.ts # Passkey transaction signing
│   ├── useWalletBalances.ts  # Multi-chain balances
│   ├── useTransactionHistory.ts # Tx history
│   └── ...
├── lib/
│   ├── safeWallet.ts       # Safe + Pimlico integration
│   ├── smartAccount.ts     # Address calculation
│   ├── livepeer.ts         # Livepeer API utils
│   └── x402.ts             # x402 payment utils
└── config/
    └── chains.ts           # Supported chains config
```

## Authentication & Identity System

Spritz supports multiple authentication methods, each providing a unique "Spritz ID" (identity address) used for social features. Users can also access the Spritz Wallet (a Safe Smart Account) for on-chain transactions.

### Two Address System

Every user has **two addresses**:

| Address Type | Purpose | Stored In |
|--------------|---------|-----------|
| **Spritz ID** | Identity for profile, friends, messages, username | `shout_users.wallet_address` |
| **Spritz Wallet** | Smart contract wallet for on-chain funds | Safe Smart Account (ERC-4337) |

### Authentication Methods Overview

| Method | Spritz ID Source | Can Sign EVM Txs? | Needs Passkey for Wallet? |
|--------|------------------|-------------------|---------------------------|
| **EVM Wallet** | Wallet address (EOA) | ✅ Yes | ❌ No (wallet signs) |
| **Passkey** | Derived from credential ID | ✅ Via passkey | ✅ Built-in |
| **Email** | Existing account OR derived | ❌ No | ✅ Yes |
| **World ID** | `nullifier_hash` from World ID | ❌ No | ✅ Yes |
| **Alien ID** | `alienAddress` from Alien | ❌ No | ✅ Yes |
| **Solana** | Solana wallet address | ❌ No (different chain) | ✅ Yes |

---

## Authentication Method Details

### 1. EVM Wallet (MetaMask, Coinbase Wallet, etc.)

**Authentication Flow:**
```
User connects wallet via Reown AppKit
    ↓
Frontend requests SIWE (Sign-In With Ethereum) message
    ↓
User signs message with wallet
    ↓
Server verifies signature, creates session
    ↓
Spritz ID = wallet address (e.g., 0x1234...)
```

**Spritz Wallet (Safe):**
- Safe address derived from wallet address as owner
- Wallet signs Safe transactions directly
- No passkey needed - the connected wallet IS the signer

**User Flow:**
1. Click "Connect Wallet"
2. Select wallet (MetaMask, Coinbase, etc.)
3. Sign SIWE message
4. Full access to app + wallet features

---

### 2. Passkey (Face ID, Touch ID, Windows Hello)

**Authentication Flow:**
```
User clicks "Login with Passkey"
    ↓
Server generates authentication challenge
    ↓
Browser triggers WebAuthn ceremony
    ↓
User authenticates with biometric
    ↓
Server verifies credential, creates session
    ↓
Spritz ID = stored user_address from passkey_credentials table
```

**Spritz Wallet (Safe):**
- P256 public key extracted from passkey
- Safe WebAuthn Signer address calculated from public key
- Safe address derived from WebAuthn signer as owner
- Passkey signs all transactions via WebAuthn

**New User Registration:**
```
User clicks "Create Account"
    ↓
Server generates registration challenge
    ↓
Browser creates new passkey (WebAuthn)
    ↓
Server extracts P256 public key (x, y coordinates)
    ↓
Spritz ID = deterministic hash of credential ID
    ↓
Safe signer address calculated from public key
```

**Key Storage:**
- `passkey_credentials.credential_id` - WebAuthn credential identifier
- `passkey_credentials.public_key_x/y` - P256 coordinates for Safe signing
- `passkey_credentials.safe_signer_address` - Precomputed WebAuthn signer

---

### 3. Email Login

**Authentication Flow:**
```
User enters email address
    ↓
Server sends 6-digit verification code via Resend
    ↓
User enters code
    ↓
Server verifies code, checks for existing account:
    
    IF email matches existing verified account:
        → Use that account's address (preserves profile!)
    ELSE:
        → Derive new address from email + EMAIL_AUTH_SECRET
    ↓
Session created with final address
```

**Spritz Wallet (Safe):**
- Email users CANNOT sign EVM transactions directly
- Must register a passkey to use Spritz Wallet
- Once passkey registered, Safe uses passkey as signer

**Backwards Compatibility:**
- If user already has account with email (from any auth method)
- Email login finds and uses that existing account
- Prevents duplicate accounts when EMAIL_AUTH_SECRET changes

---

### 4. World ID (Worldcoin)

**Authentication Flow:**
```
User clicks "Sign in with World ID"
    ↓
World ID SDK opens verification
    ↓
User verifies with Orb/Device
    ↓
Server receives proof + nullifier_hash
    ↓
Server verifies proof with World ID API
    ↓
Spritz ID = nullifier_hash (unique per person per app)
```

**Spritz Wallet (Safe):**
- World ID users CANNOT sign EVM transactions
- `nullifier_hash` is a proof identifier, not a real address
- Must register passkey while logged in with World ID
- Passkey links to their World ID identity (nullifier_hash)

**Identity Persistence:**
- `nullifier_hash` is deterministic per person per app
- Same person always gets same Spritz ID
- Sybil-resistant: one person = one account

---

### 5. Alien ID

**Authentication Flow:**
```
User clicks "Sign in with Alien ID"
    ↓
Alien ID SDK opens verification
    ↓
User authenticates with Alien
    ↓
Server receives alienAddress
    ↓
Spritz ID = alienAddress
```

**Spritz Wallet (Safe):**
- Same as World ID - cannot sign EVM transactions
- Must register passkey to use Spritz Wallet
- Passkey links to their Alien ID address

---

### 6. Solana Wallet (Phantom, Solflare, etc.)

**Authentication Flow:**
```
User connects Solana wallet
    ↓
Frontend requests SIWS (Sign-In With Solana) message
    ↓
User signs message with Solana wallet
    ↓
Server verifies signature
    ↓
Spritz ID = Solana address (base58 format)
```

**Spritz Wallet (Safe):**
- Solana wallets cannot sign EVM transactions
- Must register passkey for Spritz Wallet
- EVM funds stored in Safe on EVM chains

---

## Adding Passkey to Existing Account

When a logged-in user registers a passkey:

```
User is logged in (World ID, Email, Wallet, etc.)
    ↓
Session contains their Spritz ID
    ↓
User clicks "Add Passkey" in Wallet settings
    ↓
Server checks getAuthenticatedUser()
    ↓
IF authenticated:
    → Passkey linked to EXISTING Spritz ID ✅
ELSE IF session cookie present but invalid:
    → REJECT: "Session expired, please log in again"
ELSE:
    → Create new account (for passkey-only registration)
```

**Defensive Protections:**
1. If session exists → passkey links to existing account
2. If session cookie present but expired → reject (prevents accidental new account)
3. If userAddress matches existing account → link to it
4. Only create new account if genuinely new user

---

## Spritz Wallet (Safe Smart Account)

### Architecture

Spritz uses Safe Smart Accounts with ERC-4337 (Account Abstraction):

```
┌─────────────────────────────────────────────────────────┐
│                    Spritz Wallet                         │
├─────────────────────────────────────────────────────────┤
│  Safe Smart Account (same address on all EVM chains)    │
│  ├── Owner: EOA address OR WebAuthn Signer              │
│  ├── Bundler: Pimlico                                   │
│  └── Paymaster: Sponsored (L2) or ERC-20 USDC (mainnet) │
└─────────────────────────────────────────────────────────┘
```

### Supported Chains

| Chain | Chain ID | Gas Payment | Sponsorship |
|-------|----------|-------------|-------------|
| Ethereum | 1 | ETH (or USDC if available) | User pays |
| Base | 8453 | Sponsored | Free |
| Arbitrum | 42161 | Sponsored | Free |
| Optimism | 10 | Sponsored | Free |
| Polygon | 137 | Sponsored | Free |
| BNB Chain | 56 | Sponsored | Free |
| Unichain | 130 | Sponsored | Free |

### Safe Address Calculation

**For Wallet Users (EOA signer):**
```typescript
safeAddress = calculateSafeAddress(walletAddress)
// Safe is owned by the user's EOA
```

**For Passkey Users (WebAuthn signer):**
```typescript
webAuthnSignerAddress = calculateWebAuthnSignerAddress(publicKeyX, publicKeyY)
safeAddress = calculateSafeAddress(webAuthnSignerAddress)
// Safe is owned by the passkey's P256 signer
```

### Same Address Everywhere

Your Safe wallet address is **deterministic and identical** across all EVM chains. Send to any chain, funds are never lost - just on a different network at the same address.

---

## Complete User Flows

### Flow 1: New User with Wallet

```
1. User connects MetaMask
2. Signs SIWE message
3. Spritz ID = wallet address
4. Safe address calculated from wallet
5. User can send/receive immediately
   (wallet signs Safe transactions)
```

### Flow 2: New User with Passkey

```
1. User clicks "Create Account"
2. Creates passkey (Face ID/Touch ID)
3. Spritz ID = hash(credential_id)
4. Safe address calculated from passkey signer
5. User can send/receive immediately
   (passkey signs Safe transactions)
```

### Flow 3: New User with World ID

```
1. User verifies with World ID
2. Spritz ID = nullifier_hash
3. User sees profile, can chat, add friends
4. User opens Wallet → "Register Passkey to Send"
5. Creates passkey (linked to nullifier_hash)
6. Safe address calculated from passkey signer
7. User can now send/receive
```

### Flow 4: Existing User Adds Passkey

```
1. User logged in with Email/WorldID/etc.
2. Opens Wallet settings → "Add Passkey"
3. Creates passkey
4. Server detects existing session
5. Passkey linked to EXISTING Spritz ID
6. Safe uses new passkey as signer
7. Profile, friends, messages preserved ✅
```

---

## Key Security Properties

### Identity Persistence
- **Wallet**: Address never changes
- **Passkey**: Credential ID never changes
- **Email**: Finds existing account first, then derives
- **World ID**: Same nullifier_hash for same person
- **Alien ID**: Same address for same account

### Non-Custodial
- Private keys never leave user's device
- Passkeys backed up via iCloud/Google automatically
- Server only stores public keys

### Session Management
- JWT sessions in HTTP-only cookies (7 days)
- Frontend tokens in localStorage (30 days, signed)
- CSRF protection via origin validation

---

## Huddle01 Video Calls

Huddle01 provides decentralized video/voice calls with WebRTC.

### Room Creation Flow

```
User initiates call to friend
    ↓
Server calls Huddle01 API to create room
    POST https://api.huddle01.com/api/v2/sdk/rooms/create-room
    ↓
Returns roomId (unique room identifier)
    ↓
Room shared with callee via push notification
```

### Token Generation Flow

```
User joins room (caller or callee)
    ↓
Server generates access token via Huddle01 SDK
    ↓
Token includes:
    - roomId: The room to join
    - role: HOST (full permissions)
    - permissions: cam, mic, screen, data
    - metadata: displayName, walletAddress
    ↓
Token signed with HUDDLE01_API_KEY
    ↓
Client uses token to connect to room
```

### Token Permissions

```typescript
permissions: {
    admin: true,           // Can manage room
    canConsume: true,      // Can receive media
    canProduce: true,      // Can send media
    canProduceSources: {
        cam: true,         // Camera access
        mic: true,         // Microphone access
        screen: true,      // Screen share
    },
    canRecvData: true,     // Receive data messages
    canSendData: true,     // Send data messages
    canUpdateMetadata: true,
}
```

### Call Types

| Type | Description | Implementation |
|------|-------------|----------------|
| **1:1 Call** | Direct call between two users | Single room, both as HOST |
| **Group Call** | Multi-party call | Single room, all as HOST |
| **Voice Only** | Audio without video | Camera disabled client-side |

### Security Model

- Room IDs are random UUIDs (unguessable)
- Tokens are short-lived JWTs
- Each participant gets their own token
- Wallet address embedded in metadata for identification

---

## Logos Messaging (Waku)

Spritz uses [Logos Messaging](https://logos.co/tech-stack) protocols (formerly Waku) for decentralized, end-to-end encrypted messaging.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Message Flow                          │
├─────────────────────────────────────────────────────────┤
│  Sender                                                  │
│    ↓                                                     │
│  Encrypt message with symmetric key (AES-GCM)           │
│    ↓                                                     │
│  Encode with Protobuf                                   │
│    ↓                                                     │
│  Publish to Waku network (content topic = conversation) │
│    ↓                                                     │
│  Store encrypted copy in Supabase (backup)              │
│    ↓                                                     │
│  Receiver subscribes to content topic                   │
│    ↓                                                     │
│  Decrypt with shared symmetric key                      │
└─────────────────────────────────────────────────────────┘
```

### Initialization Flow

```
User logs in (any auth method)
    ↓
WakuProvider.initialize() called with userAddress
    ↓
Waku light node created (browser-based)
    ↓
Connects to Waku network peers
    ↓
Loads stored encryption keys from localStorage
    ↓
Subscribes to user's content topics
    ↓
Ready to send/receive messages
```

### End-to-End Encryption Across All Login Types

Spritz provides E2E encryption for **all users regardless of authentication method**. This works because every auth method produces a deterministic "Spritz ID" (address) used for key derivation.

**How It Works:**

| Auth Method | Spritz ID Source | E2E Encryption |
|-------------|------------------|----------------|
| **EVM Wallet** | Wallet address (0x...) | ✅ Uses wallet address |
| **Passkey** | Hash of credential ID | ✅ Uses derived address |
| **Email** | Existing account OR derived from email | ✅ Uses account address |
| **World ID** | `nullifier_hash` from verification | ✅ Uses nullifier as address |
| **Alien ID** | `alienAddress` from Alien | ✅ Uses Alien address |
| **Solana** | Solana wallet address (base58) | ✅ Uses Solana address |

**Key Insight:** The encryption system doesn't care *how* you logged in—it only needs your Spritz ID. Since all auth methods produce a stable, unique identifier, E2E encryption works identically for everyone.

```
┌─────────────────────────────────────────────────────────────────┐
│              E2E Encryption Key Establishment                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User A (any auth method)     User B (any auth method)          │
│  Spritz ID: 0xABC...          Spritz ID: 0xDEF...               │
│       │                             │                            │
│       └──────────┬──────────────────┘                            │
│                  ↓                                               │
│  Sort addresses: [0xABC..., 0xDEF...]                           │
│                  ↓                                               │
│  Derive key: SHA256("spritz-dm-key-v1:0xABC:0xDEF")            │
│                  ↓                                               │
│  Both users derive IDENTICAL symmetric key                      │
│  (no key exchange needed!)                                      │
│                  ↓                                               │
│  Messages encrypted with AES-256-GCM                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Cross-Auth-Method Example:**
```
Alice: Logged in with World ID (nullifier_hash = 0x123...)
Bob:   Logged in with MetaMask (wallet address = 0x456...)

Both can message each other with full E2E encryption:
1. Alice's app derives key from sorted(0x123, 0x456)
2. Bob's app derives key from sorted(0x123, 0x456)
3. Same key → encrypted messages work both directions
```

### Encryption Key Derivation

**For Direct Messages (DMs):**
```typescript
// Deterministic key from both addresses (sorted)
const seed = `spritz-dm-key-v1:${address1}:${address2}`;
const symmetricKey = SHA256(seed);
// Both parties derive the same key independently
```

**For Group Chats:**
```typescript
// Random symmetric key generated on group creation
const symmetricKey = generateSymmetricKey(); // 256-bit AES key
// Key shared with members via encrypted channel
```

### Content Topics

Messages are published to specific "content topics" based on conversation:

```
/spritz/1/dm-{sortedAddresses}/proto     # Direct messages
/spritz/1/group-{groupId}/proto          # Group messages
```

### Message Storage

Messages are stored in multiple locations for reliability:

| Storage | Purpose | Encryption |
|---------|---------|------------|
| **Waku Network** | Real-time delivery | Symmetric (AES-GCM) |
| **Supabase** | Backup/history | Symmetric (AES-GCM) |
| **localStorage** | Offline access | Symmetric (AES-GCM) |

### Message Format (Protobuf)

```protobuf
message ChatMessage {
    uint64 timestamp = 1;      // Unix timestamp
    string sender = 2;         // Sender address
    string content = 3;        // Message text
    string messageId = 4;      // Unique ID (UUID)
    string messageType = 5;    // "text", "pixel_art", "system"
}
```

### Group Management

**Creating a Group:**
```
User creates group with name, emoji, members
    ↓
Generate random groupId
    ↓
Generate random symmetric key
    ↓
Store group info in Supabase (shout_groups table)
    ↓
Encrypt group key for each member
    ↓
Members can decrypt key and join conversation
```

**Group Invites:**
```
Owner invites new member
    ↓
Encrypt symmetric key for new member
    ↓
Store encrypted key in shout_group_invites
    ↓
Invitee decrypts key and joins group
```

### Security Properties

| Property | Implementation |
|----------|----------------|
| **End-to-End Encryption** | AES-256-GCM symmetric encryption |
| **Forward Secrecy** | Not currently (would need ratcheting) |
| **Key Storage** | localStorage (encrypted backup in Supabase) |
| **Message Authentication** | GCM mode provides authentication |
| **Sender Verification** | Sender address in signed message |

### Real-time Updates

```typescript
// Subscribe to conversation
streamMessages(peerAddress, (message) => {
    // Decrypt and display new message
    const decrypted = decrypt(message, symmetricKey);
    addToConversation(decrypted);
});

// Also subscribe to Supabase realtime for backup delivery
supabase
    .channel('messages')
    .on('INSERT', handleNewMessage)
    .subscribe();
```

### Offline Support

1. Messages cached in localStorage
2. On reconnect, sync from Supabase backup
3. Deduplicate by messageId
4. Merge with real-time Waku messages

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

[PolyForm Noncommercial License 1.0.0](LICENSE)

Commercial use requires a separate license. Contact connect@spritz.chat for commercial licensing.

---

Built with 🍊 by the Spritz team

Powered by [Google Gemini](https://ai.google.dev/), [Huddle01](https://huddle01.com), [Livepeer](https://livepeer.org), [Logos Messaging](https://logos.co/tech-stack), [Supabase](https://supabase.com), [Pimlico](https://pimlico.io), [Safe](https://safe.global), [The Graph](https://thegraph.com), [Reown](https://reown.com), and [x402](https://x402.org)
