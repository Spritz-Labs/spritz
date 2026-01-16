"use client";

import { TextWidgetConfig } from "../ProfileWidgetTypes";

interface TextWidgetProps {
    config: TextWidgetConfig;
    size: string;
}

export function TextWidget({ config, size }: TextWidgetProps) {
    const { text, style = 'body', alignment = 'left', fontSize = 'md', emoji } = config;
    
    const fontSizeClasses = {
        sm: 'text-sm',
        md: 'text-base',
        lg: 'text-lg',
        xl: 'text-xl sm:text-2xl',
    };
    
    const alignmentClasses = {
        left: 'text-left',
        center: 'text-center',
        right: 'text-right',
    };
    
    const isQuote = style === 'quote';
    const isHeading = style === 'heading';
    const isHighlight = style === 'highlight';
    
    return (
        <div className={`w-full h-full flex flex-col justify-center p-5 sm:p-6 rounded-2xl ${
            isHighlight 
                ? 'bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/30'
                : 'bg-zinc-900 border border-zinc-800'
        }`}>
            {emoji && (
                <span className="text-3xl mb-3">{emoji}</span>
            )}
            
            {isQuote && (
                <svg className="w-8 h-8 text-zinc-600 mb-2" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                </svg>
            )}
            
            <p className={`
                ${fontSizeClasses[fontSize]}
                ${alignmentClasses[alignment]}
                ${isHeading ? 'font-bold' : isQuote ? 'italic text-zinc-300' : 'text-zinc-200'}
                leading-relaxed
            `}>
                {text}
            </p>
            
            {isQuote && (
                <div className={`mt-3 w-12 h-1 rounded-full bg-orange-500 ${
                    alignment === 'center' ? 'mx-auto' : alignment === 'right' ? 'ml-auto' : ''
                }`} />
            )}
        </div>
    );
}
