"use client";

import { motion } from "motion/react";
import { 
    BaseWidget, 
    WidgetType, 
    getGridSpanClasses,
    MapWidgetConfig,
    ImageWidgetConfig,
    TextWidgetConfig,
    LinkWidgetConfig,
    NFTWidgetConfig,
    SpotifyWidgetConfig,
    VideoWidgetConfig,
    CountdownWidgetConfig,
    ClockWidgetConfig,
    TechStackWidgetConfig,
    CurrentlyWidgetConfig,
    StatsWidgetConfig,
    WeatherWidgetConfig,
    GitHubWidgetConfig,
    SocialEmbedWidgetConfig,
    TipJarWidgetConfig,
    // Spritz widget configs
    MessageMeWidgetConfig,
    WalletWidgetConfig,
    ScheduleWidgetConfig,
    AgentWidgetConfig,
    SocialLinkWidgetConfig,
    // Interactive widget configs
    PollWidgetConfig,
    GuestbookWidgetConfig,
    ReactionWallWidgetConfig,
    PetWidgetConfig,
    FortuneCookieWidgetConfig,
    // Aesthetic widget configs
    PhotoCarouselWidgetConfig,
    MoodBoardWidgetConfig,
    ColorPaletteWidgetConfig,
    VinylRecordWidgetConfig,
    PolaroidStackWidgetConfig,
    ZodiacWidgetConfig,
    // Entertainment widget configs
    BookshelfWidgetConfig,
    GameNowPlayingWidgetConfig,
    MovieQueueWidgetConfig,
    PodcastFavoritesWidgetConfig,
    // Productivity widget configs
    AvailabilityStatusWidgetConfig,
    TimezoneOverlapWidgetConfig,
    StreakCounterWidgetConfig,
    GoalsChecklistWidgetConfig,
    // Fun widget configs
    FunCounterWidgetConfig,
    VisitorCounterWidgetConfig,
    RandomFactWidgetConfig,
    LanguagesWidgetConfig,
} from "./ProfileWidgetTypes";

// Widget components
import { MapWidget } from "./widgets/MapWidget";
import { ImageWidget } from "./widgets/ImageWidget";
import { TextWidget } from "./widgets/TextWidget";
import { LinkWidget } from "./widgets/LinkWidget";
import { NFTWidget } from "./widgets/NFTWidget";
import { SpotifyWidget } from "./widgets/SpotifyWidget";
import { VideoWidget } from "./widgets/VideoWidget";
import { CountdownWidget } from "./widgets/CountdownWidget";
import { ClockWidget } from "./widgets/ClockWidget";
import { TechStackWidget } from "./widgets/TechStackWidget";
import { CurrentlyWidget } from "./widgets/CurrentlyWidget";
import { StatsWidget } from "./widgets/StatsWidget";
import { WeatherWidget } from "./widgets/WeatherWidget";
import { GitHubWidget } from "./widgets/GitHubWidget";
import { SocialEmbedWidget } from "./widgets/SocialEmbedWidget";
import { TipJarWidget } from "./widgets/TipJarWidget";
// Spritz feature widgets
import { MessageMeWidget } from "./widgets/MessageMeWidget";
import { WalletWidget } from "./widgets/WalletWidget";
import { ScheduleWidget } from "./widgets/ScheduleWidget";
import { AgentWidget } from "./widgets/AgentWidget";
import { SocialLinkWidget } from "./widgets/SocialLinkWidget";
// Interactive widgets
import { PollWidget } from "./widgets/PollWidget";
import { GuestbookWidget } from "./widgets/GuestbookWidget";
import { ReactionWallWidget } from "./widgets/ReactionWallWidget";
import { PetWidget } from "./widgets/PetWidget";
import { FortuneCookieWidget } from "./widgets/FortuneCookieWidget";
// Aesthetic widgets
import { PhotoCarouselWidget } from "./widgets/PhotoCarouselWidget";
import { MoodBoardWidget } from "./widgets/MoodBoardWidget";
import { ColorPaletteWidget } from "./widgets/ColorPaletteWidget";
import { VinylRecordWidget } from "./widgets/VinylRecordWidget";
import { PolaroidStackWidget } from "./widgets/PolaroidStackWidget";
import { ZodiacWidget } from "./widgets/ZodiacWidget";
// Entertainment widgets
import { BookshelfWidget } from "./widgets/BookshelfWidget";
import { GameNowPlayingWidget } from "./widgets/GameNowPlayingWidget";
import { MovieQueueWidget } from "./widgets/MovieQueueWidget";
import { PodcastFavoritesWidget } from "./widgets/PodcastFavoritesWidget";
// Productivity widgets
import { AvailabilityStatusWidget } from "./widgets/AvailabilityStatusWidget";
import { TimezoneOverlapWidget } from "./widgets/TimezoneOverlapWidget";
import { StreakCounterWidget } from "./widgets/StreakCounterWidget";
import { GoalsChecklistWidget } from "./widgets/GoalsChecklistWidget";
// Fun widgets
import { FunCounterWidget } from "./widgets/FunCounterWidget";
import { VisitorCounterWidget } from "./widgets/VisitorCounterWidget";
import { RandomFactWidget } from "./widgets/RandomFactWidget";
import { LanguagesWidget } from "./widgets/LanguagesWidget";

interface ProfileWidgetRendererProps {
    widgets: BaseWidget[];
    isEditing?: boolean;
    onWidgetClick?: (widget: BaseWidget) => void;
}

// Export for direct use in editors
export function renderWidget(widget: BaseWidget): React.ReactNode {
    const { widget_type, config, size } = widget;
    
    switch (widget_type) {
        case 'map':
            return <MapWidget config={config as unknown as MapWidgetConfig} size={size} />;
        case 'image':
            return <ImageWidget config={config as unknown as ImageWidgetConfig} size={size} />;
        case 'text':
            return <TextWidget config={config as unknown as TextWidgetConfig} size={size} />;
        case 'link':
            return <LinkWidget config={config as unknown as LinkWidgetConfig} size={size} />;
        case 'nft':
            return <NFTWidget config={config as unknown as NFTWidgetConfig} size={size} />;
        case 'spotify':
            return <SpotifyWidget config={config as unknown as SpotifyWidgetConfig} size={size} />;
        case 'video':
            return <VideoWidget config={config as unknown as VideoWidgetConfig} size={size} />;
        case 'countdown':
            return <CountdownWidget config={config as unknown as CountdownWidgetConfig} size={size} />;
        case 'clock':
            return <ClockWidget config={config as unknown as ClockWidgetConfig} size={size} />;
        case 'tech_stack':
            return <TechStackWidget config={config as unknown as TechStackWidgetConfig} size={size} />;
        case 'currently':
            return <CurrentlyWidget config={config as unknown as CurrentlyWidgetConfig} size={size} />;
        case 'stats':
            return <StatsWidget config={config as unknown as StatsWidgetConfig} size={size} />;
        case 'weather':
            return <WeatherWidget config={config as unknown as WeatherWidgetConfig} size={size} />;
        case 'github':
            return <GitHubWidget config={config as unknown as GitHubWidgetConfig} size={size} />;
        case 'social_embed':
            return <SocialEmbedWidget config={config as unknown as SocialEmbedWidgetConfig} size={size} />;
        case 'tip_jar':
            return <TipJarWidget config={config as unknown as TipJarWidgetConfig} size={size} />;
        // Spritz feature widgets
        case 'message_me':
            return <MessageMeWidget config={config as unknown as MessageMeWidgetConfig} size={size} />;
        case 'wallet':
            return <WalletWidget config={config as unknown as WalletWidgetConfig} size={size} />;
        case 'schedule':
            return <ScheduleWidget config={config as unknown as ScheduleWidgetConfig} size={size} />;
        case 'agent':
            return <AgentWidget config={config as unknown as AgentWidgetConfig} size={size} />;
        case 'social_link':
            return <SocialLinkWidget config={config as unknown as SocialLinkWidgetConfig} size={size} />;
        // Interactive widgets
        case 'poll':
            return <PollWidget config={config as unknown as PollWidgetConfig} size={size} />;
        case 'guestbook':
            return <GuestbookWidget config={config as unknown as GuestbookWidgetConfig} size={size} />;
        case 'reaction_wall':
            return <ReactionWallWidget config={config as unknown as ReactionWallWidgetConfig} size={size} />;
        case 'pet':
            return <PetWidget config={config as unknown as PetWidgetConfig} size={size} />;
        case 'fortune_cookie':
            return <FortuneCookieWidget config={config as unknown as FortuneCookieWidgetConfig} size={size} />;
        // Aesthetic widgets
        case 'photo_carousel':
            return <PhotoCarouselWidget config={config as unknown as PhotoCarouselWidgetConfig} size={size} />;
        case 'mood_board':
            return <MoodBoardWidget config={config as unknown as MoodBoardWidgetConfig} size={size} />;
        case 'color_palette':
            return <ColorPaletteWidget config={config as unknown as ColorPaletteWidgetConfig} size={size} />;
        case 'vinyl_record':
            return <VinylRecordWidget config={config as unknown as VinylRecordWidgetConfig} size={size} />;
        case 'polaroid_stack':
            return <PolaroidStackWidget config={config as unknown as PolaroidStackWidgetConfig} size={size} />;
        case 'zodiac':
            return <ZodiacWidget config={config as unknown as ZodiacWidgetConfig} size={size} />;
        // Entertainment widgets
        case 'bookshelf':
            return <BookshelfWidget config={config as unknown as BookshelfWidgetConfig} size={size} />;
        case 'game_now_playing':
            return <GameNowPlayingWidget config={config as unknown as GameNowPlayingWidgetConfig} size={size} />;
        case 'movie_queue':
            return <MovieQueueWidget config={config as unknown as MovieQueueWidgetConfig} size={size} />;
        case 'podcast_favorites':
            return <PodcastFavoritesWidget config={config as unknown as PodcastFavoritesWidgetConfig} size={size} />;
        // Productivity widgets
        case 'availability_status':
            return <AvailabilityStatusWidget config={config as unknown as AvailabilityStatusWidgetConfig} size={size} />;
        case 'timezone_overlap':
            return <TimezoneOverlapWidget config={config as unknown as TimezoneOverlapWidgetConfig} size={size} />;
        case 'streak_counter':
            return <StreakCounterWidget config={config as unknown as StreakCounterWidgetConfig} size={size} />;
        case 'goals_checklist':
            return <GoalsChecklistWidget config={config as unknown as GoalsChecklistWidgetConfig} size={size} />;
        // Fun widgets
        case 'fun_counter':
            return <FunCounterWidget config={config as unknown as FunCounterWidgetConfig} size={size} />;
        case 'visitor_counter':
            return <VisitorCounterWidget config={config as unknown as VisitorCounterWidgetConfig} size={size} />;
        case 'random_fact':
            return <RandomFactWidget config={config as unknown as RandomFactWidgetConfig} size={size} />;
        case 'languages':
            return <LanguagesWidget config={config as unknown as LanguagesWidgetConfig} size={size} />;
        default:
            // Fallback for unknown widget types
            return (
                <div className="w-full h-full flex items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800">
                    <p className="text-zinc-500">Unknown widget</p>
                </div>
            );
    }
}

export function ProfileWidgetRenderer({ 
    widgets, 
    isEditing = false,
    onWidgetClick,
}: ProfileWidgetRendererProps) {
    // Sort widgets by position
    const sortedWidgets = [...widgets]
        .filter(w => w.is_visible || isEditing)
        .sort((a, b) => a.position - b.position);
    
    if (sortedWidgets.length === 0) {
        return (
            <div className="text-center py-12">
                <p className="text-zinc-500">No widgets added yet</p>
            </div>
        );
    }
    
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 auto-rows-[minmax(120px,auto)]">
            {sortedWidgets.map((widget, index) => (
                <motion.div
                    key={widget.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`${getGridSpanClasses(widget.size)} ${
                        isEditing ? 'cursor-move' : ''
                    } ${!widget.is_visible ? 'opacity-50' : ''}`}
                    onClick={() => isEditing && onWidgetClick?.(widget)}
                >
                    {isEditing && (
                        <div className="absolute top-2 right-2 z-10 flex gap-1">
                            <button className="w-6 h-6 rounded bg-black/50 text-white flex items-center justify-center hover:bg-black/70">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                            </button>
                        </div>
                    )}
                    {renderWidget(widget)}
                </motion.div>
            ))}
        </div>
    );
}
