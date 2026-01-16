"use client";

import { BookshelfWidgetConfig } from "../ProfileWidgetTypes";

interface BookshelfWidgetProps {
    config: BookshelfWidgetConfig;
    size: string;
}

const STATUS_COLORS = {
    reading: 'bg-blue-500',
    finished: 'bg-emerald-500',
    want_to_read: 'bg-amber-500',
};

const STATUS_LABELS = {
    reading: 'Reading',
    finished: 'Finished',
    want_to_read: 'Want to Read',
};

export function BookshelfWidget({ config, size }: BookshelfWidgetProps) {
    const { books, title = "Currently Reading" } = config;
    
    const isSmall = size === '2x1';
    const isWide = size === '4x1' || size === '4x2';
    const displayBooks = books.slice(0, isWide ? 6 : isSmall ? 3 : 4);
    
    if (books.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-900/20 to-orange-900/20 rounded-2xl">
                <div className="text-center">
                    <span className="text-4xl">📚</span>
                    <p className="text-zinc-500 text-sm mt-2">Add books</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="w-full h-full p-3 bg-gradient-to-br from-amber-900/20 to-orange-900/20 rounded-2xl flex flex-col">
            <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-2">
                <span>📚</span> {title}
            </h3>
            
            {/* Bookshelf */}
            <div className={`flex-1 flex ${isWide ? 'flex-row' : 'flex-row'} gap-2 items-end`}>
                {displayBooks.map((book, index) => (
                    <div
                        key={index}
                        className="flex flex-col items-center group cursor-pointer"
                        style={{ flex: isSmall ? '0 0 auto' : 1 }}
                    >
                        {/* Book cover */}
                        <div 
                            className="relative rounded shadow-lg transition-transform group-hover:-translate-y-1 overflow-hidden"
                            style={{ 
                                width: isSmall ? '40px' : isWide ? '50px' : '55px',
                                height: isSmall ? '60px' : isWide ? '75px' : '80px',
                            }}
                        >
                            {book.coverUrl ? (
                                <img
                                    src={book.coverUrl}
                                    alt={book.title}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center p-1">
                                    <span className="text-[8px] text-white text-center leading-tight line-clamp-3">
                                        {book.title}
                                    </span>
                                </div>
                            )}
                            
                            {/* Status indicator */}
                            {book.status && (
                                <div className={`absolute top-0.5 right-0.5 w-2 h-2 rounded-full ${STATUS_COLORS[book.status]}`} />
                            )}
                        </div>
                        
                        {/* Book info (on hover or always for larger sizes) */}
                        {!isSmall && (
                            <div className="mt-1 text-center max-w-full">
                                <p className="text-[10px] text-white truncate font-medium">{book.title}</p>
                                <p className="text-[9px] text-zinc-400 truncate">{book.author}</p>
                                {book.rating && (
                                    <p className="text-[9px] text-amber-400">
                                        {'★'.repeat(book.rating)}{'☆'.repeat(5 - book.rating)}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            
            {/* Shelf */}
            <div className="h-2 bg-gradient-to-r from-amber-800 via-amber-700 to-amber-800 rounded-sm mt-1 shadow-inner" />
        </div>
    );
}
