"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
    BaseWidget, 
    WidgetType, 
    WidgetSize,
    WIDGET_METADATA,
    getGridSpanClasses,
    ProfileTheme,
    DEFAULT_THEMES,
} from "./ProfileWidgetTypes";
import { ProfileWidgetRenderer } from "./ProfileWidgetRenderer";

interface ProfileWidgetEditorProps {
    widgets: BaseWidget[];
    theme: ProfileTheme | null;
    onWidgetsChange: (widgets: BaseWidget[]) => void;
    onThemeChange: (theme: Partial<ProfileTheme>) => void;
    onSave: () => Promise<void>;
    isSaving: boolean;
}

type EditorTab = 'widgets' | 'theme' | 'preview';

export function ProfileWidgetEditor({
    widgets,
    theme,
    onWidgetsChange,
    onThemeChange,
    onSave,
    isSaving,
}: ProfileWidgetEditorProps) {
    const [activeTab, setActiveTab] = useState<EditorTab>('widgets');
    const [showAddWidget, setShowAddWidget] = useState(false);
    const [editingWidget, setEditingWidget] = useState<BaseWidget | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    // Group widgets by category
    const widgetsByCategory = Object.entries(WIDGET_METADATA).reduce((acc, [type, meta]) => {
        if (!acc[meta.category]) acc[meta.category] = [];
        acc[meta.category].push({ type: type as WidgetType, ...meta });
        return acc;
    }, {} as Record<string, Array<{ type: WidgetType } & typeof WIDGET_METADATA[WidgetType]>>);

    const categories = [
        { id: 'all', label: 'All', icon: '📦' },
        { id: 'location', label: 'Location', icon: '🗺️' },
        { id: 'social', label: 'Social', icon: '📱' },
        { id: 'media', label: 'Media', icon: '🎬' },
        { id: 'personal', label: 'Personal', icon: '👤' },
        { id: 'web3', label: 'Web3', icon: '💎' },
        { id: 'utility', label: 'Utility', icon: '🔧' },
    ];

    const filteredWidgets = selectedCategory === 'all'
        ? Object.entries(WIDGET_METADATA)
        : Object.entries(WIDGET_METADATA).filter(([, meta]) => meta.category === selectedCategory);

    // Add new widget
    const handleAddWidget = useCallback((type: WidgetType) => {
        const meta = WIDGET_METADATA[type];
        const newWidget: BaseWidget = {
            id: `temp-${Date.now()}`,
            widget_type: type,
            size: meta.defaultSize,
            position: widgets.length,
            is_visible: true,
            config: getDefaultConfig(type),
        };
        
        setEditingWidget(newWidget);
        setShowAddWidget(false);
    }, [widgets.length]);

    // Save widget (add or update)
    const handleSaveWidget = useCallback((widget: BaseWidget) => {
        const isNew = widget.id.startsWith('temp-');
        
        if (isNew) {
            onWidgetsChange([...widgets, { ...widget, id: `widget-${Date.now()}` }]);
        } else {
            onWidgetsChange(widgets.map(w => w.id === widget.id ? widget : w));
        }
        
        setEditingWidget(null);
    }, [widgets, onWidgetsChange]);

    // Delete widget
    const handleDeleteWidget = useCallback((widgetId: string) => {
        onWidgetsChange(widgets.filter(w => w.id !== widgetId));
        setEditingWidget(null);
    }, [widgets, onWidgetsChange]);

    // Move widget
    const handleMoveWidget = useCallback((widgetId: string, direction: 'up' | 'down') => {
        const index = widgets.findIndex(w => w.id === widgetId);
        if (index === -1) return;
        
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= widgets.length) return;
        
        const newWidgets = [...widgets];
        [newWidgets[index], newWidgets[newIndex]] = [newWidgets[newIndex], newWidgets[index]];
        
        // Update positions
        newWidgets.forEach((w, i) => w.position = i);
        onWidgetsChange(newWidgets);
    }, [widgets, onWidgetsChange]);

    const activeTheme = theme || DEFAULT_THEMES.dark as ProfileTheme;

    return (
        <div className="min-h-screen bg-zinc-950">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-zinc-900/95 backdrop-blur border-b border-zinc-800">
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <h1 className="text-xl font-bold text-white">Edit Profile</h1>
                        <button
                            onClick={onSave}
                            disabled={isSaving}
                            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                    
                    {/* Tabs */}
                    <div className="flex gap-1 mt-4">
                        {(['widgets', 'theme', 'preview'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    activeTab === tab
                                        ? 'bg-orange-500 text-white'
                                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                                }`}
                            >
                                {tab === 'widgets' && '📦 Widgets'}
                                {tab === 'theme' && '🎨 Theme'}
                                {tab === 'preview' && '👁️ Preview'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-4 py-6">
                {/* Widgets Tab */}
                {activeTab === 'widgets' && (
                    <div className="space-y-6">
                        {/* Add Widget Button */}
                        <button
                            onClick={() => setShowAddWidget(true)}
                            className="w-full p-4 border-2 border-dashed border-zinc-700 rounded-2xl text-zinc-400 hover:text-white hover:border-orange-500 transition-colors flex items-center justify-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Add Widget
                        </button>

                        {/* Widget List */}
                        <div className="space-y-3">
                            {widgets.map((widget, index) => {
                                const meta = WIDGET_METADATA[widget.widget_type];
                                return (
                                    <div
                                        key={widget.id}
                                        className="flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-xl"
                                    >
                                        <span className="text-2xl">{meta?.icon || '📦'}</span>
                                        <div className="flex-1">
                                            <p className="text-white font-medium">{meta?.name || widget.widget_type}</p>
                                            <p className="text-zinc-500 text-sm">{widget.size}</p>
                                        </div>
                                        
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleMoveWidget(widget.id, 'up')}
                                                disabled={index === 0}
                                                className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 flex items-center justify-center"
                                            >
                                                ↑
                                            </button>
                                            <button
                                                onClick={() => handleMoveWidget(widget.id, 'down')}
                                                disabled={index === widgets.length - 1}
                                                className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 flex items-center justify-center"
                                            >
                                                ↓
                                            </button>
                                            <button
                                                onClick={() => setEditingWidget(widget)}
                                                className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                onClick={() => handleDeleteWidget(widget.id)}
                                                className="w-8 h-8 rounded-lg bg-zinc-800 text-red-400 hover:text-red-300 flex items-center justify-center"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {widgets.length === 0 && (
                            <div className="text-center py-12">
                                <p className="text-zinc-500">No widgets added yet. Click "Add Widget" to get started!</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Theme Tab */}
                {activeTab === 'theme' && (
                    <div className="space-y-6">
                        {/* Preset Themes */}
                        <div>
                            <h3 className="text-white font-medium mb-3">Preset Themes</h3>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                                {Object.entries(DEFAULT_THEMES).map(([name, presetTheme]) => (
                                    <button
                                        key={name}
                                        onClick={() => onThemeChange(presetTheme as Partial<ProfileTheme>)}
                                        className="aspect-square rounded-xl border-2 border-zinc-700 hover:border-orange-500 transition-colors overflow-hidden"
                                        style={{ background: presetTheme.background_value }}
                                    >
                                        <div className="w-full h-full flex items-end p-2">
                                            <div 
                                                className="w-full h-2 rounded-full"
                                                style={{ backgroundColor: presetTheme.accent_color }}
                                            />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Custom Colors */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm text-zinc-400 mb-2 block">Accent Color</label>
                                <input
                                    type="color"
                                    value={activeTheme.accent_color}
                                    onChange={(e) => onThemeChange({ accent_color: e.target.value })}
                                    className="w-full h-12 rounded-lg cursor-pointer"
                                />
                            </div>
                            <div>
                                <label className="text-sm text-zinc-400 mb-2 block">Background</label>
                                <input
                                    type="color"
                                    value={activeTheme.background_value?.startsWith('#') ? activeTheme.background_value : '#09090b'}
                                    onChange={(e) => onThemeChange({ background_type: 'solid', background_value: e.target.value })}
                                    className="w-full h-12 rounded-lg cursor-pointer"
                                />
                            </div>
                        </div>

                        {/* Card Style */}
                        <div>
                            <label className="text-sm text-zinc-400 mb-2 block">Card Style</label>
                            <div className="flex gap-2">
                                {(['rounded', 'sharp', 'pill'] as const).map((style) => (
                                    <button
                                        key={style}
                                        onClick={() => onThemeChange({ card_style: style })}
                                        className={`flex-1 py-2 px-4 rounded-lg border transition-colors capitalize ${
                                            activeTheme.card_style === style
                                                ? 'bg-orange-500 border-orange-500 text-white'
                                                : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        {style}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Show Badge Toggle */}
                        <div className="flex items-center justify-between p-4 bg-zinc-900 rounded-xl">
                            <div>
                                <p className="text-white font-medium">Show Spritz Badge</p>
                                <p className="text-zinc-500 text-sm">Display "Create your Spritz profile" link</p>
                            </div>
                            <button
                                onClick={() => onThemeChange({ show_spritz_badge: !activeTheme.show_spritz_badge })}
                                className={`w-12 h-6 rounded-full transition-colors ${
                                    activeTheme.show_spritz_badge ? 'bg-orange-500' : 'bg-zinc-700'
                                }`}
                            >
                                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                                    activeTheme.show_spritz_badge ? 'translate-x-6' : 'translate-x-0.5'
                                }`} />
                            </button>
                        </div>
                    </div>
                )}

                {/* Preview Tab */}
                {activeTab === 'preview' && (
                    <div 
                        className="rounded-2xl overflow-hidden min-h-[400px] p-6"
                        style={{
                            background: activeTheme.background_value,
                        }}
                    >
                        <ProfileWidgetRenderer widgets={widgets} />
                    </div>
                )}
            </div>

            {/* Add Widget Modal */}
            <AnimatePresence>
                {showAddWidget && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setShowAddWidget(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden"
                        >
                            <div className="p-4 border-b border-zinc-800">
                                <h2 className="text-lg font-bold text-white">Add Widget</h2>
                            </div>
                            
                            {/* Categories */}
                            <div className="flex gap-1 p-4 overflow-x-auto">
                                {categories.map((cat) => (
                                    <button
                                        key={cat.id}
                                        onClick={() => setSelectedCategory(cat.id)}
                                        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                            selectedCategory === cat.id
                                                ? 'bg-orange-500 text-white'
                                                : 'bg-zinc-800 text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        {cat.icon} {cat.label}
                                    </button>
                                ))}
                            </div>
                            
                            {/* Widget Options */}
                            <div className="p-4 max-h-[50vh] overflow-y-auto space-y-2">
                                {filteredWidgets.map(([type, meta]) => (
                                    <button
                                        key={type}
                                        onClick={() => handleAddWidget(type as WidgetType)}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors text-left"
                                    >
                                        <span className="text-2xl">{meta.icon}</span>
                                        <div className="flex-1">
                                            <p className="text-white font-medium">{meta.name}</p>
                                            <p className="text-zinc-500 text-sm">{meta.description}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Edit Widget Modal */}
            <AnimatePresence>
                {editingWidget && (
                    <WidgetConfigModal
                        widget={editingWidget}
                        onSave={handleSaveWidget}
                        onClose={() => setEditingWidget(null)}
                        onDelete={() => handleDeleteWidget(editingWidget.id)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// Widget configuration modal
function WidgetConfigModal({
    widget,
    onSave,
    onClose,
    onDelete,
}: {
    widget: BaseWidget;
    onSave: (widget: BaseWidget) => void;
    onClose: () => void;
    onDelete: () => void;
}) {
    const [config, setConfig] = useState(widget.config);
    const [size, setSize] = useState(widget.size);
    
    const meta = WIDGET_METADATA[widget.widget_type];
    const isNew = widget.id.startsWith('temp-');

    const handleSave = () => {
        onSave({ ...widget, config, size });
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full max-h-[80vh] overflow-hidden"
            >
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">{meta?.icon}</span>
                        <h2 className="text-lg font-bold text-white">{meta?.name || 'Widget'}</h2>
                    </div>
                    <button onClick={onClose} className="text-zinc-400 hover:text-white">
                        ✕
                    </button>
                </div>
                
                <div className="p-4 max-h-[50vh] overflow-y-auto space-y-4">
                    {/* Size Selector */}
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Size</label>
                        <div className="flex flex-wrap gap-2">
                            {meta?.allowedSizes.map((s) => (
                                <button
                                    key={s}
                                    onClick={() => setSize(s)}
                                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                        size === s
                                            ? 'bg-orange-500 text-white'
                                            : 'bg-zinc-800 text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Widget-specific config fields */}
                    <WidgetConfigFields
                        type={widget.widget_type}
                        config={config}
                        onChange={setConfig}
                    />
                </div>
                
                <div className="p-4 border-t border-zinc-800 flex gap-2">
                    {!isNew && (
                        <button
                            onClick={onDelete}
                            className="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors"
                        >
                            Delete
                        </button>
                    )}
                    <div className="flex-1" />
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                    >
                        {isNew ? 'Add Widget' : 'Save'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}

// Widget-specific configuration fields
function WidgetConfigFields({
    type,
    config,
    onChange,
}: {
    type: WidgetType;
    config: Record<string, unknown>;
    onChange: (config: Record<string, unknown>) => void;
}) {
    const updateField = (field: string, value: unknown) => {
        onChange({ ...config, [field]: value });
    };

    switch (type) {
        case 'map':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">City</label>
                        <input
                            type="text"
                            value={(config.city as string) || ''}
                            onChange={(e) => updateField('city', e.target.value)}
                            placeholder="San Francisco"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Country</label>
                        <input
                            type="text"
                            value={(config.country as string) || ''}
                            onChange={(e) => updateField('country', e.target.value)}
                            placeholder="USA"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm text-zinc-400 mb-2 block">Latitude</label>
                            <input
                                type="number"
                                step="any"
                                value={(config.latitude as number) || ''}
                                onChange={(e) => updateField('latitude', parseFloat(e.target.value))}
                                placeholder="37.7749"
                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                            />
                        </div>
                        <div>
                            <label className="text-sm text-zinc-400 mb-2 block">Longitude</label>
                            <input
                                type="number"
                                step="any"
                                value={(config.longitude as number) || ''}
                                onChange={(e) => updateField('longitude', parseFloat(e.target.value))}
                                placeholder="-122.4194"
                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                            />
                        </div>
                    </div>
                </>
            );

        case 'image':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Image URL</label>
                        <input
                            type="url"
                            value={(config.url as string) || ''}
                            onChange={(e) => updateField('url', e.target.value)}
                            placeholder="https://..."
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Caption (optional)</label>
                        <input
                            type="text"
                            value={(config.caption as string) || ''}
                            onChange={(e) => updateField('caption', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Link (optional)</label>
                        <input
                            type="url"
                            value={(config.link as string) || ''}
                            onChange={(e) => updateField('link', e.target.value)}
                            placeholder="https://..."
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                </>
            );

        case 'text':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Text</label>
                        <textarea
                            value={(config.text as string) || ''}
                            onChange={(e) => updateField('text', e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Style</label>
                        <select
                            value={(config.style as string) || 'body'}
                            onChange={(e) => updateField('style', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        >
                            <option value="body">Body</option>
                            <option value="quote">Quote</option>
                            <option value="heading">Heading</option>
                            <option value="highlight">Highlight</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Emoji (optional)</label>
                        <input
                            type="text"
                            value={(config.emoji as string) || ''}
                            onChange={(e) => updateField('emoji', e.target.value)}
                            placeholder="💡"
                            maxLength={4}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                </>
            );

        case 'link':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">URL</label>
                        <input
                            type="url"
                            value={(config.url as string) || ''}
                            onChange={(e) => updateField('url', e.target.value)}
                            placeholder="https://..."
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Title</label>
                        <input
                            type="text"
                            value={(config.title as string) || ''}
                            onChange={(e) => updateField('title', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Description (optional)</label>
                        <input
                            type="text"
                            value={(config.description as string) || ''}
                            onChange={(e) => updateField('description', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Icon (emoji or URL)</label>
                        <input
                            type="text"
                            value={(config.icon as string) || ''}
                            onChange={(e) => updateField('icon', e.target.value)}
                            placeholder="📄 or https://..."
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                </>
            );

        case 'spotify':
            return (
                <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Spotify Link or URI</label>
                    <input
                        type="text"
                        value={(config.spotifyUri as string) || ''}
                        onChange={(e) => updateField('spotifyUri', e.target.value)}
                        placeholder="https://open.spotify.com/track/... or spotify:track:..."
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                    />
                    <p className="text-zinc-500 text-xs mt-1">Paste a Spotify link for a track, album, or playlist</p>
                </div>
            );

        case 'video':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Platform</label>
                        <select
                            value={(config.platform as string) || 'youtube'}
                            onChange={(e) => updateField('platform', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        >
                            <option value="youtube">YouTube</option>
                            <option value="vimeo">Vimeo</option>
                            <option value="loom">Loom</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Video ID</label>
                        <input
                            type="text"
                            value={(config.videoId as string) || ''}
                            onChange={(e) => updateField('videoId', e.target.value)}
                            placeholder="dQw4w9WgXcQ"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                        <p className="text-zinc-500 text-xs mt-1">The ID from the video URL</p>
                    </div>
                </>
            );

        case 'nft':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Chain</label>
                        <select
                            value={(config.chain as string) || 'ethereum'}
                            onChange={(e) => updateField('chain', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        >
                            <option value="ethereum">Ethereum</option>
                            <option value="polygon">Polygon</option>
                            <option value="base">Base</option>
                            <option value="optimism">Optimism</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Contract Address</label>
                        <input
                            type="text"
                            value={(config.contractAddress as string) || ''}
                            onChange={(e) => updateField('contractAddress', e.target.value)}
                            placeholder="0x..."
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Token ID</label>
                        <input
                            type="text"
                            value={(config.tokenId as string) || ''}
                            onChange={(e) => updateField('tokenId', e.target.value)}
                            placeholder="1234"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Image URL (optional, for preview)</label>
                        <input
                            type="url"
                            value={(config.imageUrl as string) || ''}
                            onChange={(e) => updateField('imageUrl', e.target.value)}
                            placeholder="https://..."
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                </>
            );

        case 'countdown':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Event Name</label>
                        <input
                            type="text"
                            value={(config.label as string) || ''}
                            onChange={(e) => updateField('label', e.target.value)}
                            placeholder="Product Launch"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Target Date</label>
                        <input
                            type="datetime-local"
                            value={(config.targetDate as string) || ''}
                            onChange={(e) => updateField('targetDate', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Emoji (optional)</label>
                        <input
                            type="text"
                            value={(config.emoji as string) || ''}
                            onChange={(e) => updateField('emoji', e.target.value)}
                            placeholder="🚀"
                            maxLength={4}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                </>
            );

        case 'clock':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Timezone</label>
                        <input
                            type="text"
                            value={(config.timezone as string) || ''}
                            onChange={(e) => updateField('timezone', e.target.value)}
                            placeholder="America/New_York"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                        <p className="text-zinc-500 text-xs mt-1">Use IANA timezone format</p>
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Label (optional)</label>
                        <input
                            type="text"
                            value={(config.label as string) || ''}
                            onChange={(e) => updateField('label', e.target.value)}
                            placeholder="NYC Time"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                </>
            );

        default:
            return (
                <p className="text-zinc-500 text-sm">
                    Configuration options for this widget type are coming soon.
                </p>
            );
    }
}

// Get default config for a widget type
function getDefaultConfig(type: WidgetType): Record<string, unknown> {
    switch (type) {
        case 'map':
            return { latitude: 0, longitude: 0, city: '', country: '', zoom: 12 };
        case 'image':
            return { url: '', fit: 'cover' };
        case 'text':
            return { text: '', style: 'body', alignment: 'left' };
        case 'link':
            return { url: '', title: '' };
        case 'spotify':
            return { spotifyUri: '', type: 'track' };
        case 'video':
            return { platform: 'youtube', videoId: '' };
        case 'nft':
            return { chain: 'ethereum', contractAddress: '', tokenId: '' };
        case 'countdown':
            return { targetDate: '', label: '' };
        case 'clock':
            return { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
        case 'stats':
            return { stats: [] };
        case 'tech_stack':
            return { technologies: [] };
        case 'currently':
            return { type: 'building', title: '' };
        default:
            return {};
    }
}
