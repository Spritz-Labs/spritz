# Spritz 🍊

Real-time messaging and video calls for Web3. Connect with friends using passkeys or wallets, chat via decentralized messaging, and make HD video calls.

**Live at [app.spritz.chat](https://app.spritz.chat)**

## Features

### Communication

-   📹 **HD Video Calls** - Real-time video and voice calls powered by Huddle01
-   💬 **Decentralized Messaging** - End-to-end encrypted chat via Waku protocol
-   👥 **Group Calls** - Multi-party video calls with friends
-   🔔 **Push Notifications** - Get notified of incoming calls and messages

### Identity & Social

-   🔐 **Passkey Authentication** - Passwordless login using Face ID, Touch ID, or Windows Hello
-   💼 **Multi-Wallet Support** - Connect MetaMask, Coinbase Wallet, Rainbow, and 300+ wallets
-   🔍 **ENS Integration** - Resolve ENS names with live avatar preview
-   🎨 **Pixel Art Avatars** - Create custom pixel art profile pictures
-   📱 **Phone Verification** - Optionally link your phone number
-   🌐 **Social Links** - Connect Twitter, Farcaster, and Lens profiles

### Experience

-   📲 **PWA Support** - Install as a native app on iOS, Android, and desktop
-   🌍 **3D Globe** - Beautiful interactive globe visualization
-   ✨ **Status Updates** - Share what you're up to with friends
-   🎯 **QR Code Scanning** - Quickly add friends by scanning their QR code

## Tech Stack

-   **Framework**: Next.js 15 with App Router
-   **Styling**: Tailwind CSS 4
-   **Animations**: Motion (Framer Motion)
-   **3D Graphics**: Three.js with React Three Fiber
-   **Web3**: viem, wagmi, permissionless.js
-   **Account Abstraction**: Pimlico, Safe Smart Accounts
-   **Wallet Connection**: Reown AppKit (WalletConnect)
-   **Video Calls**: Huddle01 SDK
-   **Messaging**: Waku Protocol
-   **Database**: Supabase (Postgres + Realtime)
-   **Push Notifications**: Web Push API

## Getting Started

### Prerequisites

-   Node.js 18+
-   npm or yarn

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

4. Configure your environment variables in `.env.local`:

```env
# WalletConnect / Reown
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id

# Pimlico (Smart Accounts)
NEXT_PUBLIC_PIMLICO_API_KEY=your_pimlico_api_key

# Huddle01 (Video Calls)
NEXT_PUBLIC_HUDDLE01_PROJECT_ID=your_huddle01_project_id
HUDDLE01_API_KEY=your_huddle01_api_key

# Supabase (Database & Realtime)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Push Notifications (optional)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
```

### Getting API Keys

#### Reown (WalletConnect)

1. Go to [Reown Cloud](https://cloud.reown.com/)
2. Create a new project
3. Copy your Project ID

#### Pimlico

1. Go to [Pimlico Dashboard](https://dashboard.pimlico.io/)
2. Create an account and project
3. Copy your API key
4. Enable Base Sepolia network

#### Huddle01

1. Go to [Huddle01 Dashboard](https://docs.huddle01.com/)
2. Create an account and project
3. Copy your Project ID and API Key

#### Supabase

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project
3. Go to Settings → API
4. Copy your Project URL and anon public key

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
src/
├── app/
│   ├── api/                    # API routes
│   │   ├── huddle01/           # Huddle01 room & token generation
│   │   ├── phone/              # Phone verification
│   │   ├── pixel-art/          # Pixel art upload
│   │   └── push/               # Push notification sending
│   ├── globals.css             # Global styles
│   ├── layout.tsx              # Root layout with providers
│   └── page.tsx                # Main app entry point
├── components/
│   ├── AddFriendModal.tsx      # Send friend request
│   ├── ChatModal.tsx           # 1:1 chat interface
│   ├── CreateGroupModal.tsx    # Create group
│   ├── Dashboard.tsx           # Main dashboard
│   ├── FriendRequests.tsx      # Incoming/outgoing requests
│   ├── FriendsList.tsx         # Friends list with actions
│   ├── Globe.tsx               # 3D globe visualization
│   ├── GroupCallUI.tsx         # Group call interface
│   ├── GroupChatModal.tsx      # Group chat interface
│   ├── GroupsList.tsx          # Groups list
│   ├── IncomingCallModal.tsx   # Incoming call notification
│   ├── PasskeyAuth.tsx         # Passkey authentication
│   ├── PhoneVerificationModal.tsx
│   ├── PixelArtEditor.tsx      # Pixel art avatar creator
│   ├── PWAInstallPrompt.tsx    # PWA install banner
│   ├── QRCodeModal.tsx         # QR code display
│   ├── QRCodeScanner.tsx       # QR code scanner
│   ├── SettingsModal.tsx       # User settings
│   ├── SocialsModal.tsx        # Social links
│   ├── StatusModal.tsx         # Status updates
│   ├── UsernameClaimModal.tsx  # Username registration
│   ├── VoiceCallUI.tsx         # Voice/video call UI
│   └── WalletConnect.tsx       # Wallet connection
├── config/
│   ├── agora.ts                # Agora config (legacy)
│   ├── huddle01.ts             # Huddle01 config
│   ├── supabase.ts             # Supabase client
│   └── wagmi.ts                # Wagmi & wallet config
├── context/
│   ├── PasskeyProvider.tsx     # Passkey auth context
│   ├── WakuProvider.tsx        # Waku messaging context
│   └── Web3Provider.tsx        # Web3 context
├── hooks/
│   ├── useCallSignaling.ts     # Call signaling
│   ├── useENS.ts               # ENS resolution
│   ├── useFriendRequests.ts    # Friend requests
│   ├── useFriends.ts           # Friends list
│   ├── useGroupCallSignaling.ts
│   ├── useGroupInvitations.ts
│   ├── useHuddle01Call.ts      # Huddle01 video calls
│   ├── useNotifications.ts     # In-app notifications
│   ├── usePhoneVerification.ts
│   ├── usePushNotifications.ts # Push notifications
│   ├── useReactions.ts         # Message reactions
│   ├── useSocials.ts           # Social links
│   ├── useUsername.ts          # Username system
│   ├── useUserSettings.ts      # User preferences
│   ├── useVoiceCall.ts         # Voice calls (Agora)
│   ├── useWaku.ts              # Waku messaging
│   └── useWalletType.ts        # Wallet detection
└── utils/
    └── address.ts              # Address utilities
```

## How It Works

### Authentication

1. **Passkey**: Creates a WebAuthn credential stored securely on your device, then deploys an ERC-4337 Safe smart account
2. **Wallet**: Connect any Ethereum wallet via Reown AppKit

### Messaging

-   Messages are sent via the Waku decentralized protocol
-   End-to-end encryption ensures privacy
-   No messages are stored on centralized servers

### Video Calls

-   Powered by Huddle01's WebRTC infrastructure
-   Supports 1:1 and group video calls
-   Works on desktop and mobile browsers

## PWA Installation

Spritz works as a Progressive Web App:

-   **iOS**: Tap Share → "Add to Home Screen"
-   **Android**: Tap the install banner or Menu → "Install App"
-   **Desktop**: Click the install icon in the address bar

## License

MIT

---

Built with 🍊 by the Spritz team using [Huddle01](https://huddle01.com), [Waku](https://waku.org), [Pimlico](https://pimlico.io), and [Reown](https://reown.com)
