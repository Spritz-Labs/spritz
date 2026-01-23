import { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import Link from "next/link";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

interface Agent {
    id: string;
    name: string;
    avatar_emoji: string;
    avatar_url: string | null;
    visibility: string;
}

interface AgentEvent {
    id: string;
    name: string;
    description: string | null;
    event_type: string | null;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    venue: string | null;
    organizer: string | null;
    event_url: string | null;
    source: string | null;
    is_featured: boolean;
}

// Generate metadata
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    
    if (!supabase) {
        return { title: "Events" };
    }

    const { data: agent } = await supabase
        .from("shout_agents")
        .select("name")
        .eq("id", id)
        .single();

    return {
        title: agent ? `${agent.name} - Events` : "Events",
        description: agent ? `Explore events curated by ${agent.name}` : "Explore events",
    };
}

// Event type emoji mapping
const eventTypeEmoji: Record<string, string> = {
    party: "🎉",
    summit: "🏔️",
    meetup: "🤝",
    conference: "🎤",
    hackathon: "💻",
    workshop: "🛠️",
    networking: "🌐",
    other: "📅",
};

// Format time for display
function formatTime(time: string | null): string {
    if (!time) return "";
    try {
        const [hours, minutes] = time.split(":");
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? "PM" : "AM";
        const hour12 = hour % 12 || 12;
        return `${hour12}:${minutes} ${ampm}`;
    } catch {
        return time;
    }
}

// Format date for display
function formatDate(dateStr: string): string {
    try {
        const date = new Date(dateStr + "T00:00:00");
        return date.toLocaleDateString("en-US", { 
            weekday: "short", 
            month: "short", 
            day: "numeric" 
        });
    } catch {
        return dateStr;
    }
}

// Get day of week
function getDayOfWeek(dateStr: string): string {
    try {
        const date = new Date(dateStr + "T00:00:00");
        return date.toLocaleDateString("en-US", { weekday: "long" });
    } catch {
        return "";
    }
}

export default async function AgentEventsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    if (!supabase) {
        return <div className="min-h-screen bg-black text-white flex items-center justify-center">Service unavailable</div>;
    }

    // Fetch agent
    const { data: agent, error: agentError } = await supabase
        .from("shout_agents")
        .select("id, name, avatar_emoji, avatar_url, visibility")
        .eq("id", id)
        .single();

    if (agentError || !agent) {
        notFound();
    }

    // Only allow for public/official agents
    if (!["public", "official"].includes(agent.visibility)) {
        notFound();
    }

    // Fetch events
    const { data: events } = await supabase
        .from("shout_agent_events")
        .select("*")
        .eq("agent_id", id)
        .order("event_date", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: false });

    // Group events by date
    const eventsByDate: Record<string, AgentEvent[]> = {};
    for (const event of events || []) {
        const date = event.event_date;
        if (!eventsByDate[date]) {
            eventsByDate[date] = [];
        }
        eventsByDate[date].push(event);
    }

    const dates = Object.keys(eventsByDate).sort();
    const totalEvents = events?.length || 0;

    return (
        <div className="min-h-screen bg-gradient-to-b from-zinc-900 via-black to-black">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-zinc-800">
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center gap-4">
                        {/* Back to Spritz button */}
                        <Link
                            href="/"
                            className="flex items-center justify-center w-10 h-10 bg-zinc-800 hover:bg-zinc-700 rounded-full transition-colors"
                            title="Back to Spritz"
                        >
                            <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        
                        <Link 
                            href={`/agent/${id}`}
                            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                        >
                            {agent.avatar_url ? (
                                <img 
                                    src={agent.avatar_url} 
                                    alt={agent.name}
                                    className="w-12 h-12 rounded-full object-cover border-2 border-purple-500"
                                />
                            ) : (
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-2xl">
                                    {agent.avatar_emoji || "🤖"}
                                </div>
                            )}
                            <div>
                                <h1 className="text-xl font-bold text-white">{agent.name}</h1>
                                <p className="text-sm text-zinc-400">📅 {totalEvents} Events</p>
                            </div>
                        </Link>
                        
                        <div className="flex-1" />
                        
                        <Link
                            href={`/agent/${id}`}
                            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-full text-sm font-medium transition-colors"
                        >
                            💬 Chat
                        </Link>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-4xl mx-auto px-4 py-8">
                {totalEvents === 0 ? (
                    <div className="text-center py-16">
                        <div className="text-6xl mb-4">📅</div>
                        <h2 className="text-xl font-semibold text-white mb-2">No Events Yet</h2>
                        <p className="text-zinc-400">
                            Events will appear here once they&apos;re added.
                        </p>
                        <Link
                            href={`/agent/${id}`}
                            className="inline-block mt-6 px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-full font-medium transition-colors"
                        >
                            Ask {agent.name} about events →
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {dates.map(date => (
                            <div key={date}>
                                {/* Date Header */}
                                <div className="sticky top-20 z-40 bg-black/90 backdrop-blur-sm py-3 mb-4 border-b border-zinc-800">
                                    <h2 className="text-lg font-bold text-white">
                                        {getDayOfWeek(date)}, {formatDate(date)}
                                    </h2>
                                </div>

                                {/* Events for this date */}
                                <div className="space-y-4">
                                    {eventsByDate[date].map(event => (
                                        <EventCard key={event.id} event={event} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer className="border-t border-zinc-800 mt-16 py-8">
                <div className="max-w-4xl mx-auto px-4 text-center">
                    <p className="text-zinc-500 text-sm">
                        Powered by <Link href="/" className="text-purple-400 hover:text-purple-300">Spritz</Link>
                    </p>
                </div>
            </footer>
        </div>
    );
}

function EventCard({ event }: { event: AgentEvent }) {
    const emoji = eventTypeEmoji[event.event_type || "other"] || "📅";
    const timeRange = event.start_time 
        ? event.end_time 
            ? `${formatTime(event.start_time)} - ${formatTime(event.end_time)}`
            : formatTime(event.start_time)
        : null;

    return (
        <div className={`
            relative p-5 rounded-2xl border transition-all duration-200
            ${event.is_featured 
                ? "bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30 hover:border-purple-500/50" 
                : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
            }
        `}>
            {event.is_featured && (
                <div className="absolute -top-2 -right-2 px-2 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold rounded-full">
                    ⭐ Featured
                </div>
            )}

            <div className="flex gap-4">
                {/* Time column */}
                <div className="flex-shrink-0 w-20 text-center">
                    <div className="text-3xl mb-1">{emoji}</div>
                    {timeRange && (
                        <div className="text-xs text-zinc-400">{timeRange}</div>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white mb-1 truncate">
                        {event.name}
                    </h3>
                    
                    {event.description && (
                        <p className="text-sm text-zinc-400 mb-2 line-clamp-2">
                            {event.description}
                        </p>
                    )}

                    <div className="flex flex-wrap gap-3 text-sm">
                        {event.venue && (
                            <span className="text-zinc-400">
                                📍 {event.venue}
                            </span>
                        )}
                        {event.organizer && (
                            <span className="text-zinc-400">
                                🏢 {event.organizer}
                            </span>
                        )}
                        {event.source && (
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                                event.source === "official" 
                                    ? "bg-blue-500/20 text-blue-400" 
                                    : event.source === "sponsor"
                                    ? "bg-amber-500/20 text-amber-400"
                                    : "bg-zinc-700 text-zinc-300"
                            }`}>
                                {event.source === "official" ? "Official" : 
                                 event.source === "sponsor" ? "Sponsor" : "Community"}
                            </span>
                        )}
                    </div>

                    {event.event_url && (
                        <a
                            href={event.event_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 mt-3 text-sm text-purple-400 hover:text-purple-300 transition-colors"
                        >
                            View Event →
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}
