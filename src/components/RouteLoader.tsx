/**
 * Shared route-level loading skeleton. Used by loading.tsx files in the App
 * Router so the first paint on navigation is a branded skeleton rather than
 * a flash of white (or, worse, nothing until the JS bundle hydrates).
 */
export function RouteLoader({ label }: { label?: string }) {
    return (
        <div
            role="status"
            aria-live="polite"
            className="min-h-[60vh] w-full flex items-center justify-center bg-zinc-950"
        >
            <div className="flex flex-col items-center gap-3 text-zinc-500">
                <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm">{label ?? "Loading…"}</p>
            </div>
        </div>
    );
}

export default RouteLoader;
