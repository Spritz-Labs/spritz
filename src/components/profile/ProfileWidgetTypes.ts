// Profile Widget Type Definitions

export type WidgetSize = '1x1' | '2x1' | '1x2' | '2x2' | '4x1' | '4x2';

export type WidgetType = 
    | 'map'
    | 'image'
    | 'text'
    | 'link'
    | 'social_embed'
    | 'nft'
    | 'spotify'
    | 'github'
    | 'video'
    | 'countdown'
    | 'stats'
    | 'weather'
    | 'clock'
    | 'tech_stack'
    | 'currently'
    | 'tip_jar';

// Base widget interface
export interface BaseWidget {
    id: string;
    widget_type: WidgetType;
    size: WidgetSize;
    position: number;
    is_visible: boolean;
    config: Record<string, unknown>;
}

// Map Widget - Shows location
export interface MapWidgetConfig {
    latitude: number;
    longitude: number;
    city?: string;
    country?: string;
    zoom?: number;
    style?: 'streets' | 'satellite' | 'dark' | 'light';
    label?: string; // e.g., "Based in", "Working from"
}

// Image Widget - Custom uploaded image
export interface ImageWidgetConfig {
    url: string;
    alt?: string;
    fit?: 'cover' | 'contain' | 'fill';
    link?: string; // Optional click-through URL
    caption?: string;
}

// Text Widget - Quote, bio, or custom text
export interface TextWidgetConfig {
    text: string;
    style?: 'quote' | 'heading' | 'body' | 'highlight';
    alignment?: 'left' | 'center' | 'right';
    fontSize?: 'sm' | 'md' | 'lg' | 'xl';
    emoji?: string; // Optional leading emoji
}

// Link Widget - Custom link with preview
export interface LinkWidgetConfig {
    url: string;
    title: string;
    description?: string;
    icon?: string; // URL or emoji
    showPreview?: boolean;
}

// Social Embed Widget - Embed tweets, posts, etc.
export interface SocialEmbedWidgetConfig {
    platform: 'twitter' | 'instagram' | 'tiktok' | 'linkedin' | 'mastodon';
    embedUrl: string;
    postId?: string;
}

// NFT Widget - Display owned NFTs
export interface NFTWidgetConfig {
    contractAddress: string;
    tokenId: string;
    chain: 'ethereum' | 'polygon' | 'base' | 'optimism';
    showDetails?: boolean;
    imageUrl?: string; // Cached image URL
    name?: string;
    collection?: string;
}

// Spotify Widget - Now playing or playlist
export interface SpotifyWidgetConfig {
    type: 'track' | 'playlist' | 'album' | 'artist';
    spotifyUri: string; // e.g., spotify:track:xxx
    theme?: 'dark' | 'light';
}

// GitHub Widget - Contribution graph or pinned repos
export interface GitHubWidgetConfig {
    username: string;
    type: 'contributions' | 'repos' | 'profile';
    showStats?: boolean;
}

// Video Widget - YouTube, Vimeo embed
export interface VideoWidgetConfig {
    platform: 'youtube' | 'vimeo' | 'loom';
    videoId: string;
    autoplay?: boolean;
    muted?: boolean;
}

// Countdown Widget - Event countdown
export interface CountdownWidgetConfig {
    targetDate: string; // ISO date string
    label: string;
    emoji?: string;
    showDays?: boolean;
    showHours?: boolean;
    showMinutes?: boolean;
}

// Stats Widget - Custom metrics
export interface StatsWidgetConfig {
    stats: Array<{
        label: string;
        value: string | number;
        emoji?: string;
    }>;
    layout?: 'row' | 'grid';
}

// Weather Widget - Current weather
export interface WeatherWidgetConfig {
    city: string;
    country?: string;
    units?: 'celsius' | 'fahrenheit';
}

// Clock Widget - World clock
export interface ClockWidgetConfig {
    timezone: string; // e.g., 'America/New_York'
    label?: string;
    format?: '12h' | '24h';
}

// Tech Stack Widget - Technologies/skills
export interface TechStackWidgetConfig {
    technologies: Array<{
        name: string;
        icon?: string; // URL or devicon name
        color?: string;
    }>;
    label?: string;
}

// Currently Widget - What they're doing/reading/playing
export interface CurrentlyWidgetConfig {
    type: 'reading' | 'playing' | 'watching' | 'building' | 'learning' | 'listening';
    title: string;
    subtitle?: string;
    imageUrl?: string;
    link?: string;
}

// Tip Jar Widget - Accept payments
export interface TipJarWidgetConfig {
    address: string;
    tokens?: Array<'ETH' | 'USDC' | 'USDT'>;
    message?: string;
    amounts?: number[]; // Suggested amounts
}

// Profile Theme
export interface ProfileTheme {
    background_type: 'solid' | 'gradient' | 'image' | 'mesh';
    background_value: string;
    accent_color: string;
    secondary_color?: string;
    text_color: string;
    card_style: 'rounded' | 'sharp' | 'pill';
    card_background: string;
    card_border?: string;
    font_family: 'system' | 'inter' | 'mono' | 'serif';
    show_spritz_badge: boolean;
    custom_css?: string;
}

// Widget metadata for editor
export const WIDGET_METADATA: Record<WidgetType, {
    name: string;
    description: string;
    icon: string;
    defaultSize: WidgetSize;
    allowedSizes: WidgetSize[];
    category: 'location' | 'social' | 'media' | 'personal' | 'web3' | 'utility';
}> = {
    map: {
        name: 'Map',
        description: 'Show your location on a map',
        icon: '🗺️',
        defaultSize: '2x2',
        allowedSizes: ['1x1', '2x1', '2x2', '4x1', '4x2'],
        category: 'location',
    },
    image: {
        name: 'Image',
        description: 'Display a custom image',
        icon: '📷',
        defaultSize: '2x2',
        allowedSizes: ['1x1', '2x1', '1x2', '2x2', '4x1', '4x2'],
        category: 'media',
    },
    text: {
        name: 'Text',
        description: 'Add a quote or custom text',
        icon: '💬',
        defaultSize: '2x1',
        allowedSizes: ['1x1', '2x1', '2x2', '4x1'],
        category: 'personal',
    },
    link: {
        name: 'Link',
        description: 'Add a custom link',
        icon: '🔗',
        defaultSize: '2x1',
        allowedSizes: ['1x1', '2x1', '2x2'],
        category: 'social',
    },
    social_embed: {
        name: 'Social Post',
        description: 'Embed a tweet or social post',
        icon: '📱',
        defaultSize: '2x2',
        allowedSizes: ['2x2', '4x2'],
        category: 'social',
    },
    nft: {
        name: 'NFT',
        description: 'Showcase an NFT you own',
        icon: '🖼️',
        defaultSize: '1x1',
        allowedSizes: ['1x1', '2x1', '1x2', '2x2'],
        category: 'web3',
    },
    spotify: {
        name: 'Spotify',
        description: 'Share music you love',
        icon: '🎵',
        defaultSize: '2x1',
        allowedSizes: ['2x1', '2x2', '4x1'],
        category: 'media',
    },
    github: {
        name: 'GitHub',
        description: 'Show your contributions',
        icon: '💻',
        defaultSize: '4x1',
        allowedSizes: ['2x1', '2x2', '4x1', '4x2'],
        category: 'social',
    },
    video: {
        name: 'Video',
        description: 'Embed a YouTube or Vimeo video',
        icon: '▶️',
        defaultSize: '2x2',
        allowedSizes: ['2x1', '2x2', '4x2'],
        category: 'media',
    },
    countdown: {
        name: 'Countdown',
        description: 'Count down to an event',
        icon: '⏰',
        defaultSize: '2x1',
        allowedSizes: ['1x1', '2x1', '2x2'],
        category: 'utility',
    },
    stats: {
        name: 'Stats',
        description: 'Display custom metrics',
        icon: '📊',
        defaultSize: '2x1',
        allowedSizes: ['2x1', '2x2', '4x1'],
        category: 'personal',
    },
    weather: {
        name: 'Weather',
        description: 'Show current weather',
        icon: '🌤️',
        defaultSize: '1x1',
        allowedSizes: ['1x1', '2x1'],
        category: 'location',
    },
    clock: {
        name: 'Clock',
        description: 'Display your local time',
        icon: '🕐',
        defaultSize: '1x1',
        allowedSizes: ['1x1', '2x1'],
        category: 'location',
    },
    tech_stack: {
        name: 'Tech Stack',
        description: 'Show technologies you use',
        icon: '🛠️',
        defaultSize: '2x1',
        allowedSizes: ['2x1', '2x2', '4x1'],
        category: 'personal',
    },
    currently: {
        name: 'Currently',
        description: "What you're doing now",
        icon: '🎯',
        defaultSize: '2x1',
        allowedSizes: ['1x1', '2x1', '2x2'],
        category: 'personal',
    },
    tip_jar: {
        name: 'Tip Jar',
        description: 'Accept crypto tips',
        icon: '💰',
        defaultSize: '2x1',
        allowedSizes: ['1x1', '2x1', '2x2'],
        category: 'web3',
    },
};

// Default themes
export const DEFAULT_THEMES: Record<string, Partial<ProfileTheme>> = {
    dark: {
        background_type: 'solid',
        background_value: '#09090b',
        accent_color: '#f97316',
        text_color: '#ffffff',
        card_background: 'rgba(24, 24, 27, 0.8)',
        card_border: 'rgba(63, 63, 70, 0.5)',
    },
    midnight: {
        background_type: 'gradient',
        background_value: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%)',
        accent_color: '#6366f1',
        text_color: '#ffffff',
        card_background: 'rgba(30, 30, 46, 0.8)',
        card_border: 'rgba(99, 102, 241, 0.2)',
    },
    sunset: {
        background_type: 'gradient',
        background_value: 'linear-gradient(135deg, #1a1a2e 0%, #2d1b3d 50%, #1f1135 100%)',
        accent_color: '#f472b6',
        secondary_color: '#fb923c',
        text_color: '#ffffff',
        card_background: 'rgba(45, 27, 61, 0.8)',
        card_border: 'rgba(244, 114, 182, 0.2)',
    },
    ocean: {
        background_type: 'gradient',
        background_value: 'linear-gradient(135deg, #0c1929 0%, #0f2744 50%, #0a1628 100%)',
        accent_color: '#22d3ee',
        text_color: '#ffffff',
        card_background: 'rgba(15, 39, 68, 0.8)',
        card_border: 'rgba(34, 211, 238, 0.2)',
    },
    forest: {
        background_type: 'gradient',
        background_value: 'linear-gradient(135deg, #0d1f0d 0%, #1a2f1a 50%, #0f1f0f 100%)',
        accent_color: '#4ade80',
        text_color: '#ffffff',
        card_background: 'rgba(26, 47, 26, 0.8)',
        card_border: 'rgba(74, 222, 128, 0.2)',
    },
    light: {
        background_type: 'solid',
        background_value: '#fafafa',
        accent_color: '#f97316',
        text_color: '#18181b',
        card_background: 'rgba(255, 255, 255, 0.9)',
        card_border: 'rgba(228, 228, 231, 0.8)',
    },
};

// Helper to get grid span classes
export function getGridSpanClasses(size: WidgetSize): string {
    const spans: Record<WidgetSize, string> = {
        '1x1': 'col-span-1 row-span-1',
        '2x1': 'col-span-2 row-span-1',
        '1x2': 'col-span-1 row-span-2',
        '2x2': 'col-span-2 row-span-2',
        '4x1': 'col-span-4 row-span-1',
        '4x2': 'col-span-4 row-span-2',
    };
    return spans[size];
}

// Helper to get aspect ratio for widget
export function getAspectRatio(size: WidgetSize): string {
    const ratios: Record<WidgetSize, string> = {
        '1x1': 'aspect-square',
        '2x1': 'aspect-[2/1]',
        '1x2': 'aspect-[1/2]',
        '2x2': 'aspect-square',
        '4x1': 'aspect-[4/1]',
        '4x2': 'aspect-[2/1]',
    };
    return ratios[size];
}
