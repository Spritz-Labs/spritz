"use client";

import { useState, useEffect } from "react";
import { WeatherWidgetConfig, WidgetSize } from "../ProfileWidgetTypes";

interface WeatherWidgetProps {
    config: WeatherWidgetConfig;
    size: WidgetSize;
}

type WeatherData = {
    temp: number;
    condition: string;
    icon: string;
    humidity?: number;
    wind?: number;
};

// Weather condition to emoji mapping
const WEATHER_ICONS: Record<string, string> = {
    clear: '☀️',
    sunny: '☀️',
    'partly cloudy': '⛅',
    cloudy: '☁️',
    overcast: '☁️',
    rain: '🌧️',
    'light rain': '🌦️',
    drizzle: '🌦️',
    thunderstorm: '⛈️',
    snow: '🌨️',
    'light snow': '❄️',
    fog: '🌫️',
    mist: '🌫️',
    haze: '🌫️',
    windy: '💨',
    default: '🌡️',
};

function getWeatherIcon(condition: string): string {
    const lowerCondition = condition.toLowerCase();
    for (const [key, icon] of Object.entries(WEATHER_ICONS)) {
        if (lowerCondition.includes(key)) {
            return icon;
        }
    }
    return WEATHER_ICONS.default;
}

export function WeatherWidget({ config, size }: WeatherWidgetProps) {
    const { city, country, units = 'celsius' } = config;
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const isSmall = size === '1x1';
    
    useEffect(() => {
        const fetchWeather = async () => {
            if (!city) {
                setLoading(false);
                setError("No city configured");
                return;
            }
            
            try {
                // Using wttr.in - free weather API that doesn't require API key
                const location = encodeURIComponent(country ? `${city}, ${country}` : city);
                const unitParam = units === 'fahrenheit' ? 'u' : 'm';
                const response = await fetch(
                    `https://wttr.in/${location}?format=j1&${unitParam}`,
                    { cache: 'no-store' }
                );
                
                if (!response.ok) throw new Error('Weather fetch failed');
                
                const data = await response.json();
                const current = data.current_condition?.[0];
                
                if (current) {
                    const temp = units === 'fahrenheit' 
                        ? parseInt(current.temp_F) 
                        : parseInt(current.temp_C);
                    
                    setWeather({
                        temp,
                        condition: current.weatherDesc?.[0]?.value || 'Unknown',
                        icon: getWeatherIcon(current.weatherDesc?.[0]?.value || ''),
                        humidity: parseInt(current.humidity),
                        wind: units === 'fahrenheit'
                            ? parseInt(current.windspeedMiles)
                            : parseInt(current.windspeedKmph),
                    });
                    setError(null);
                }
            } catch (err) {
                console.error('[Weather Widget] Error:', err);
                // Fallback to a placeholder
                setWeather({
                    temp: 20,
                    condition: 'Unavailable',
                    icon: '🌡️',
                });
                setError('Weather unavailable');
            } finally {
                setLoading(false);
            }
        };
        
        fetchWeather();
        // Refresh every 30 minutes
        const interval = setInterval(fetchWeather, 30 * 60 * 1000);
        
        return () => clearInterval(interval);
    }, [city, country, units]);
    
    const unitSymbol = units === 'fahrenheit' ? '°F' : '°C';
    
    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-sky-500/20 to-blue-500/20 border border-sky-500/30">
            {loading ? (
                <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            ) : weather ? (
                <>
                    <span className={`${isSmall ? 'text-3xl' : 'text-4xl'} mb-1`}>{weather.icon}</span>
                    <p className={`text-white font-bold ${isSmall ? 'text-2xl' : 'text-3xl'}`}>
                        {weather.temp}{unitSymbol}
                    </p>
                    {!isSmall && (
                        <p className="text-sky-200 text-sm mt-1">{weather.condition}</p>
                    )}
                    <p className="text-sky-300/70 text-xs mt-1 truncate max-w-full">
                        {city}{country && !isSmall ? `, ${country}` : ''}
                    </p>
                </>
            ) : (
                <>
                    <span className="text-3xl mb-1">🌡️</span>
                    <p className="text-zinc-400 text-sm">{error || 'No weather data'}</p>
                </>
            )}
        </div>
    );
}
