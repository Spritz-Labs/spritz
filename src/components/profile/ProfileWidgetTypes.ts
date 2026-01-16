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
    | 'tip_jar'
    // Spritz feature widgets
    | 'message_me'
    | 'wallet'
    | 'schedule'
    | 'agent'
    | 'social_link'
    // Interactive & Fun widgets
    | 'poll'
    | 'guestbook'
    | 'reaction_wall'
    | 'pet'
    | 'fortune_cookie'
    // Aesthetic widgets
    | 'photo_carousel'
    | 'mood_board'
    | 'color_palette'
    | 'vinyl_record'
    | 'polaroid_stack'
    | 'zodiac'
    // What I'm Into widgets
    | 'bookshelf'
    | 'game_now_playing'
    | 'movie_queue'
    | 'podcast_favorites'
    // Productivity widgets
    | 'availability_status'
    | 'timezone_overlap'
    | 'streak_counter'
    | 'goals_checklist'
    // Fun Stats widgets
    | 'fun_counter'
    | 'visitor_counter'
    | 'random_fact'
    | 'languages';

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
    platform: 'twitter' | 'x' | 'instagram' | 'tiktok' | 'linkedin' | 'mastodon';
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

// ====== SPRITZ FEATURE WIDGETS ======

// Message Me Widget - Quick chat link
export interface MessageMeWidgetConfig {
    address: string; // User's wallet address
    title?: string; // Custom title, defaults to "Message me"
    subtitle?: string; // Custom subtitle
    showAvatar?: boolean;
}

// Wallet Widget - Show wallet address with copy
export interface WalletWidgetConfig {
    address: string;
    label?: string; // e.g., "Main Wallet", "ETH Address"
    showBalance?: boolean;
    copyEnabled?: boolean;
}

// Schedule Widget - Book a call
export interface ScheduleWidgetConfig {
    slug: string; // Scheduling link slug
    title?: string; // e.g., "Book a call", "Let's meet"
    subtitle?: string; // e.g., "30 min", "Schedule a meeting"
    avatarUrl?: string;
}

// Agent Widget - AI Agent card
export interface AgentWidgetConfig {
    agentId: string;
    name: string;
    personality?: string;
    avatarEmoji?: string;
    avatarUrl?: string;
}

// Social Link Widget - Single social platform link
export interface SocialLinkWidgetConfig {
    platform: 'twitter' | 'x' | 'github' | 'linkedin' | 'instagram' | 'youtube' | 'tiktok' | 'discord' | 'telegram' | 'farcaster' | 'website';
    handle: string;
    url: string;
}

// ====== INTERACTIVE & FUN WIDGETS ======

// Poll Widget - Interactive voting
export interface PollWidgetConfig {
    question: string;
    options: Array<{
        id: string;
        text: string;
        votes?: number;
    }>;
    allowMultiple?: boolean;
    showResults?: boolean;
    endDate?: string;
}

// Guestbook Widget - Visitor messages
export interface GuestbookWidgetConfig {
    title?: string;
    maxMessages?: number;
    messages?: Array<{
        id: string;
        author: string;
        authorAddress?: string;
        content: string;
        timestamp: string;
        emoji?: string;
    }>;
}

// Reaction Wall Widget - Emoji reactions
export interface ReactionWallWidgetConfig {
    allowedEmojis?: string[];
    reactions?: Record<string, number>; // emoji -> count
    maxReactions?: number;
}

// Pet Widget - Virtual pet
export interface PetWidgetConfig {
    petType: 'cat' | 'dog' | 'hamster' | 'bird' | 'fish' | 'alien' | 'robot' | 'ghost';
    name: string;
    mood?: 'happy' | 'sleepy' | 'hungry' | 'playful' | 'excited';
    color?: string;
}

// Fortune Cookie Widget - Random quotes/fortunes
export interface FortuneCookieWidgetConfig {
    fortunes?: string[];
    category?: 'wisdom' | 'funny' | 'motivation' | 'tech' | 'custom';
    showDaily?: boolean;
}

// ====== AESTHETIC WIDGETS ======

// Photo Carousel Widget - Rotating images
export interface PhotoCarouselWidgetConfig {
    images: Array<{
        url: string;
        caption?: string;
    }>;
    autoPlay?: boolean;
    interval?: number; // seconds
    showDots?: boolean;
    showArrows?: boolean;
}

// Mood Board Widget - Image collage
export interface MoodBoardWidgetConfig {
    images: Array<{
        url: string;
        size?: 'small' | 'medium' | 'large';
    }>;
    title?: string;
    gap?: number;
}

// Color Palette Widget - Brand colors
export interface ColorPaletteWidgetConfig {
    colors: Array<{
        hex: string;
        name?: string;
    }>;
    title?: string;
    showHex?: boolean;
}

// Vinyl Record Widget - Album display
export interface VinylRecordWidgetConfig {
    albumArt: string;
    albumName: string;
    artistName: string;
    isSpinning?: boolean;
    spotifyUrl?: string;
}

// Polaroid Stack Widget - Stacked photos
export interface PolaroidStackWidgetConfig {
    photos: Array<{
        url: string;
        caption?: string;
        rotation?: number;
    }>;
    spread?: 'tight' | 'loose' | 'scattered';
}

// Zodiac Widget - Astrological sign
export interface ZodiacWidgetConfig {
    sign: 'aries' | 'taurus' | 'gemini' | 'cancer' | 'leo' | 'virgo' | 'libra' | 'scorpio' | 'sagittarius' | 'capricorn' | 'aquarius' | 'pisces';
    showTraits?: boolean;
    showDates?: boolean;
}

// ====== WHAT I'M INTO WIDGETS ======

// Bookshelf Widget - Books display
export interface BookshelfWidgetConfig {
    books: Array<{
        title: string;
        author: string;
        coverUrl?: string;
        status?: 'reading' | 'finished' | 'want_to_read';
        rating?: number;
    }>;
    title?: string;
}

// Game Now Playing Widget
export interface GameNowPlayingWidgetConfig {
    gameName: string;
    coverUrl?: string;
    platform?: 'pc' | 'playstation' | 'xbox' | 'nintendo' | 'mobile';
    hoursPlayed?: number;
    achievement?: string;
}

// Movie Queue Widget
export interface MovieQueueWidgetConfig {
    items: Array<{
        title: string;
        posterUrl?: string;
        type: 'movie' | 'show';
        status?: 'watching' | 'finished' | 'want_to_watch';
        rating?: number;
    }>;
    title?: string;
}

// Podcast Favorites Widget
export interface PodcastFavoritesWidgetConfig {
    podcasts: Array<{
        name: string;
        coverUrl?: string;
        latestEpisode?: string;
        spotifyUrl?: string;
    }>;
}

// ====== PRODUCTIVITY WIDGETS ======

// Availability Status Widget
export interface AvailabilityStatusWidgetConfig {
    status: 'available' | 'busy' | 'away' | 'dnd' | 'offline';
    customMessage?: string;
    showSchedule?: boolean;
    schedule?: {
        timezone: string;
        workHours?: { start: string; end: string };
    };
}

// Timezone Overlap Widget
export interface TimezoneOverlapWidgetConfig {
    timezone: string;
    label?: string;
    showWorkHours?: boolean;
    workHours?: { start: number; end: number }; // 0-24
}

// Streak Counter Widget
export interface StreakCounterWidgetConfig {
    label: string;
    currentStreak: number;
    longestStreak?: number;
    unit?: 'days' | 'weeks' | 'commits' | 'workouts' | 'custom';
    emoji?: string;
    startDate?: string;
}

// Goals Checklist Widget
export interface GoalsChecklistWidgetConfig {
    title?: string;
    goals: Array<{
        id: string;
        text: string;
        completed: boolean;
        emoji?: string;
    }>;
    showProgress?: boolean;
}

// ====== FUN STATS WIDGETS ======

// Fun Counter Widget (coffee, etc.)
export interface FunCounterWidgetConfig {
    label: string;
    count: number;
    emoji: string;
    unit?: string;
    incrementable?: boolean;
}

// Visitor Counter Widget
export interface VisitorCounterWidgetConfig {
    style: 'retro' | 'modern' | 'minimal';
    count?: number;
    label?: string;
}

// Random Fact Widget
export interface RandomFactWidgetConfig {
    facts: string[];
    title?: string;
    refreshable?: boolean;
}

// Languages Widget
export interface LanguagesWidgetConfig {
    languages: Array<{
        code: string; // ISO 639-1 code
        name: string;
        proficiency?: 'native' | 'fluent' | 'conversational' | 'learning';
    }>;
    showFlags?: boolean;
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

// Widget category type
export type WidgetCategory = 'spritz' | 'location' | 'social' | 'media' | 'personal' | 'web3' | 'utility' | 'interactive' | 'aesthetic' | 'entertainment' | 'productivity' | 'fun';

// Widget metadata for editor
export const WIDGET_METADATA: Record<WidgetType, {
    name: string;
    description: string;
    icon: string;
    defaultSize: WidgetSize;
    allowedSizes: WidgetSize[];
    category: WidgetCategory;
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
    // Spritz feature widgets
    message_me: {
        name: 'Message Me',
        description: 'Quick link to chat with you on Spritz',
        icon: '💬',
        defaultSize: '2x1',
        allowedSizes: ['1x1', '2x1', '2x2'],
        category: 'spritz',
    },
    wallet: {
        name: 'Wallet',
        description: 'Display your wallet address',
        icon: '💎',
        defaultSize: '2x1',
        allowedSizes: ['1x1', '2x1', '2x2'],
        category: 'spritz',
    },
    schedule: {
        name: "Let's Meet",
        description: 'Book a call scheduling link',
        icon: '📅',
        defaultSize: '2x1',
        allowedSizes: ['1x1', '2x1', '2x2'],
        category: 'spritz',
    },
    agent: {
        name: 'AI Agent',
        description: 'Showcase your AI agent',
        icon: '🤖',
        defaultSize: '1x1',
        allowedSizes: ['1x1', '2x1', '2x2'],
        category: 'spritz',
    },
    social_link: {
        name: 'Social Link',
        description: 'Link to a social profile',
        icon: '🔗',
        defaultSize: '1x1',
        allowedSizes: ['1x1', '2x1'],
        category: 'spritz',
    },
    // Interactive & Fun widgets
    poll: {
        name: 'Poll',
        description: 'Let visitors vote on a question',
        icon: '📊',
        defaultSize: '2x2',
        allowedSizes: ['2x1', '2x2'],
        category: 'interactive',
    },
    guestbook: {
        name: 'Guestbook',
        description: 'Let visitors leave messages',
        icon: '📝',
        defaultSize: '2x2',
        allowedSizes: ['2x2', '4x2'],
        category: 'interactive',
    },
    reaction_wall: {
        name: 'Reaction Wall',
        description: 'Collect emoji reactions from visitors',
        icon: '🎉',
        defaultSize: '2x1',
        allowedSizes: ['1x1', '2x1', '2x2'],
        category: 'interactive',
    },
    pet: {
        name: 'Virtual Pet',
        description: 'An adorable animated companion',
        icon: '🐱',
        defaultSize: '1x1',
        allowedSizes: ['1x1', '2x1', '2x2'],
        category: 'interactive',
    },
    fortune_cookie: {
        name: 'Fortune Cookie',
        description: 'Random wisdom for your visitors',
        icon: '🥠',
        defaultSize: '2x1',
        allowedSizes: ['1x1', '2x1', '2x2'],
        category: 'interactive',
    },
    // Aesthetic widgets
    photo_carousel: {
        name: 'Photo Carousel',
        description: 'Rotating slideshow of images',
        icon: '🎠',
        defaultSize: '2x2',
        allowedSizes: ['2x1', '2x2', '4x2'],
        category: 'aesthetic',
    },
    mood_board: {
        name: 'Mood Board',
        description: 'Collage of inspiration images',
        icon: '🎨',
        defaultSize: '2x2',
        allowedSizes: ['2x2', '4x2'],
        category: 'aesthetic',
    },
    color_palette: {
        name: 'Color Palette',
        description: 'Show your brand/favorite colors',
        icon: '🌈',
        defaultSize: '2x1',
        allowedSizes: ['2x1', '4x1'],
        category: 'aesthetic',
    },
    vinyl_record: {
        name: 'Vinyl Record',
        description: 'Spinning album art display',
        icon: '💿',
        defaultSize: '2x2',
        allowedSizes: ['1x1', '2x2'],
        category: 'aesthetic',
    },
    polaroid_stack: {
        name: 'Polaroid Stack',
        description: 'Stacked polaroid-style photos',
        icon: '📸',
        defaultSize: '2x2',
        allowedSizes: ['2x2', '4x2'],
        category: 'aesthetic',
    },
    zodiac: {
        name: 'Zodiac Sign',
        description: 'Display your astrological sign',
        icon: '♈',
        defaultSize: '1x1',
        allowedSizes: ['1x1', '2x1'],
        category: 'aesthetic',
    },
    // What I'm Into widgets
    bookshelf: {
        name: 'Bookshelf',
        description: 'Books you\'re reading',
        icon: '📚',
        defaultSize: '2x2',
        allowedSizes: ['2x1', '2x2', '4x1', '4x2'],
        category: 'entertainment',
    },
    game_now_playing: {
        name: 'Now Playing',
        description: 'Game you\'re currently playing',
        icon: '🎮',
        defaultSize: '2x1',
        allowedSizes: ['2x1', '2x2'],
        category: 'entertainment',
    },
    movie_queue: {
        name: 'Watch List',
        description: 'Movies and shows queue',
        icon: '🎬',
        defaultSize: '2x2',
        allowedSizes: ['2x1', '2x2', '4x2'],
        category: 'entertainment',
    },
    podcast_favorites: {
        name: 'Podcasts',
        description: 'Podcasts you love',
        icon: '🎙️',
        defaultSize: '2x1',
        allowedSizes: ['2x1', '2x2', '4x1'],
        category: 'entertainment',
    },
    // Productivity widgets
    availability_status: {
        name: 'Availability',
        description: 'Show if you\'re available',
        icon: '🟢',
        defaultSize: '2x1',
        allowedSizes: ['1x1', '2x1'],
        category: 'productivity',
    },
    timezone_overlap: {
        name: 'Time Zone',
        description: 'Your local time for visitors',
        icon: '🌍',
        defaultSize: '2x1',
        allowedSizes: ['1x1', '2x1', '2x2'],
        category: 'productivity',
    },
    streak_counter: {
        name: 'Streak',
        description: 'Track your daily streaks',
        icon: '🔥',
        defaultSize: '2x1',
        allowedSizes: ['1x1', '2x1'],
        category: 'productivity',
    },
    goals_checklist: {
        name: 'Goals',
        description: 'Public goals checklist',
        icon: '✅',
        defaultSize: '2x2',
        allowedSizes: ['2x1', '2x2'],
        category: 'productivity',
    },
    // Fun Stats widgets
    fun_counter: {
        name: 'Fun Counter',
        description: 'Count anything (coffees, etc.)',
        icon: '☕',
        defaultSize: '1x1',
        allowedSizes: ['1x1', '2x1'],
        category: 'fun',
    },
    visitor_counter: {
        name: 'Visitor Counter',
        description: 'Retro hit counter',
        icon: '👀',
        defaultSize: '2x1',
        allowedSizes: ['1x1', '2x1'],
        category: 'fun',
    },
    random_fact: {
        name: 'Random Fact',
        description: 'Fun facts about you',
        icon: '💡',
        defaultSize: '2x1',
        allowedSizes: ['2x1', '2x2'],
        category: 'fun',
    },
    languages: {
        name: 'Languages',
        description: 'Languages you speak',
        icon: '🗣️',
        defaultSize: '2x1',
        allowedSizes: ['1x1', '2x1', '2x2'],
        category: 'fun',
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
