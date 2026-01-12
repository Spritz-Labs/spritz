/**
 * Token logo URLs for trusted tokens
 * Using Trust Wallet assets and other reliable CDNs
 */

// Base URL for Trust Wallet assets
const TRUST_WALLET_CDN = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains";

// Chain name mapping for Trust Wallet CDN
const CHAIN_NAMES: Record<string, string> = {
    mainnet: "ethereum",
    bsc: "smartchain",
    base: "base",
    "arbitrum-one": "arbitrum",
    optimism: "optimism",
    polygon: "polygon",
    avalanche: "avalanche",
};

// Native token logos
export const NATIVE_TOKEN_LOGOS: Record<string, string> = {
    ETH: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
    BNB: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png",
    MATIC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png",
    AVAX: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanche/info/logo.png",
};

// Well-known token logos (symbol -> logo URL)
export const TOKEN_LOGOS: Record<string, string> = {
    // Stablecoins
    USDC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
    USDT: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png",
    DAI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EesdeAC495271d0F/logo.png",
    
    // Wrapped tokens
    WETH: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png",
    WBTC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png",
    WBNB: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png",
    WMATIC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png",
    WAVAX: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanche/info/logo.png",
    
    // DeFi tokens
    LINK: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png",
    UNI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png",
    AAVE: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9/logo.png",
    MKR: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2/logo.png",
    
    // Liquid staking
    stETH: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84/logo.png",
    wstETH: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0/logo.png",
    cbETH: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xBe9895146f7AF43049ca1c1AE358B0541Ea49704/logo.png",
    rETH: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xae78736Cd615f374D3085123A210448E74Fc6393/logo.png",
    
    // L2 tokens
    ARB: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/assets/0x912CE59144191C1204E64559FE8253a0e49E6548/logo.png",
    OP: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/assets/0x4200000000000000000000000000000000000042/logo.png",
    
    // Meme coins
    SHIB: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE/logo.png",
    PEPE: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6982508145454Ce325dDbE47a25d4ec3d2311933/logo.png",
    APE: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x4d224452801ACEd8B2F0aebE155379bb5D594381/logo.png",
    
    // DEX tokens
    CAKE: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82/logo.png",
    GMX: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/assets/0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a/logo.png",
};

/**
 * Get logo URL for a token
 */
export function getTokenLogo(symbol: string, contractAddress?: string, network?: string): string | undefined {
    // Check by symbol first
    const upperSymbol = symbol.toUpperCase();
    if (TOKEN_LOGOS[upperSymbol]) {
        return TOKEN_LOGOS[upperSymbol];
    }
    
    // Check native token
    if (NATIVE_TOKEN_LOGOS[upperSymbol]) {
        return NATIVE_TOKEN_LOGOS[upperSymbol];
    }
    
    // Try to construct Trust Wallet URL from contract address
    if (contractAddress && network && CHAIN_NAMES[network]) {
        const chainName = CHAIN_NAMES[network];
        // Checksum the address for Trust Wallet CDN
        return `${TRUST_WALLET_CDN}/${chainName}/assets/${contractAddress}/logo.png`;
    }
    
    return undefined;
}
