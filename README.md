# Shout 📞

Voice calls for Web3. Connect with friends using passkeys or wallets and make real-time voice calls.

## Features

-   🔐 **Passkey Authentication** - Passwordless login using device biometrics (Face ID, Touch ID, Windows Hello)
-   💼 **Wallet Connection** - Connect MetaMask, Coinbase Wallet, and 300+ wallets via WalletConnect
-   🧠 **Smart Accounts** - ERC-4337 smart accounts powered by Pimlico and Safe
-   👥 **Friends List** - Add friends by wallet address or ENS name with avatar resolution
-   📞 **Voice Calling** - Real-time voice calls between friends using Agora
-   🎨 **Beautiful UI** - Modern, animated interface with glass morphism effects

## Tech Stack

-   **Framework**: Next.js 15 with App Router
-   **Styling**: Tailwind CSS 4
-   **Animations**: Motion (Framer Motion)
-   **Web3**: viem, wagmi, permissionless.js
-   **Account Abstraction**: Pimlico, Safe Smart Accounts
-   **Wallet Connection**: WalletConnect AppKit
-   **Voice Calling**: Agora RTC SDK

## Getting Started

### Prerequisites

-   Node.js 18+
-   npm or yarn

### Installation

1. Clone the repository:

```bash
git clone https://github.com/kmjones1979/shout.git
cd shout
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
# Required for WalletConnect
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id

# Required for Pimlico Smart Accounts
NEXT_PUBLIC_PIMLICO_API_KEY=your_pimlico_api_key

# Required for Voice Calling (use APP ID only mode, no certificate)
NEXT_PUBLIC_AGORA_APP_ID=your_agora_app_id
```

### Getting API Keys

#### WalletConnect Project ID

1. Go to [WalletConnect Cloud](https://cloud.walletconnect.com/)
2. Create a new project
3. Copy your Project ID

#### Pimlico API Key

1. Go to [Pimlico Dashboard](https://dashboard.pimlico.io/)
2. Create an account and project
3. Copy your API key
4. Make sure to enable Base Sepolia network

#### Agora App ID

1. Go to [Agora Console](https://console.agora.io/)
2. Create a new project
3. **Important**: Select "APP ID" authentication (no certificate/token required)
4. Copy your App ID
5. Free tier includes 10,000 minutes/month

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

### Authentication

1. **Passkey**: Creates a WebAuthn credential stored securely on your device, then deploys an ERC-4337 Safe smart account
2. **Wallet**: Standard EOA wallet connection via WalletConnect

### Friends & Calling

1. **Add Friends**: Enter an Ethereum address or ENS name (e.g., `vitalik.eth`)
2. **ENS Resolution**: Automatically resolves ENS names to addresses and fetches avatars
3. **Voice Call**: Click the call button to start a real-time voice call

## Project Structure

```
src/
├── app/
│   ├── globals.css         # Global styles and animations
│   ├── layout.tsx          # Root layout with providers
│   └── page.tsx            # Main app entry point
├── components/
│   ├── PasskeyAuth.tsx     # Passkey authentication
│   ├── WalletConnect.tsx   # Wallet connection
│   ├── Dashboard.tsx       # Main dashboard after login
│   ├── FriendsList.tsx     # Friends list with call buttons
│   ├── AddFriendModal.tsx  # Add friend modal
│   ├── VoiceCallUI.tsx     # In-call UI
│   └── IncomingCallModal.tsx # Incoming call notification
├── config/
│   ├── wagmi.ts            # Wagmi and WalletConnect config
│   ├── agora.ts            # Agora RTC config
│   └── supabase.ts         # Supabase client (optional)
├── context/
│   └── Web3Provider.tsx    # Web3 context provider
└── hooks/
    ├── usePasskey.ts       # Passkey authentication
    ├── useFriends.ts       # Friends management
    ├── useVoiceCall.ts     # Voice call functionality
    └── useENS.ts           # ENS resolution
```

## License

MIT

---

Built with 💜 using [Pimlico](https://pimlico.io), [WalletConnect](https://walletconnect.com), and [Agora](https://agora.io)
