"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { 
    BaseWidget, 
    WidgetType, 
    WIDGET_METADATA,
    ProfileTheme,
    DEFAULT_THEMES,
} from "./ProfileWidgetTypes";
import { ProfileWidgetRenderer } from "./ProfileWidgetRenderer";

// Profile data for pre-populating widget configs
type ProfileData = {
    address: string;
    scheduling?: { slug: string; title?: string; bio?: string } | null;
    socials?: Array<{ platform: string; handle: string; url: string }>;
    agents?: Array<{ id: string; name: string; avatar_emoji?: string; avatar_url?: string }>;
};

interface ProfileWidgetEditorProps {
    widgets: BaseWidget[];
    theme: ProfileTheme | null;
    onWidgetsChange: (widgets: BaseWidget[]) => void;
    onThemeChange: (theme: Partial<ProfileTheme>) => void;
    onSave: () => Promise<void>;
    isSaving: boolean;
    profileData?: ProfileData;
}

type EditorTab = 'widgets' | 'theme' | 'preview';

// Sortable widget item component
function SortableWidgetItem({
    widget,
    index,
    totalCount,
    onEdit,
    onDelete,
}: {
    widget: BaseWidget;
    index: number;
    totalCount: number;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: widget.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : 'auto',
    };

    const meta = WIDGET_METADATA[widget.widget_type];

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-3 p-4 bg-zinc-900 border border-zinc-800 rounded-xl ${
                isDragging ? 'shadow-xl ring-2 ring-orange-500/50' : ''
            }`}
        >
            {/* Drag Handle */}
            <button
                {...attributes}
                {...listeners}
                className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                </svg>
            </button>
            
            <span className="text-2xl">{meta?.icon || '📦'}</span>
            <div className="flex-1">
                <p className="text-white font-medium">{meta?.name || widget.widget_type}</p>
                <p className="text-zinc-500 text-sm">{widget.size}</p>
            </div>
            
            <div className="flex items-center gap-1">
                <button
                    onClick={onEdit}
                    className="w-8 h-8 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white flex items-center justify-center"
                >
                    ✏️
                </button>
                <button
                    onClick={onDelete}
                    className="w-8 h-8 rounded-lg bg-zinc-800 text-red-400 hover:text-red-300 flex items-center justify-center"
                >
                    🗑️
                </button>
            </div>
        </div>
    );
}

export function ProfileWidgetEditor({
    widgets,
    theme,
    onWidgetsChange,
    onThemeChange,
    onSave,
    isSaving,
    profileData,
}: ProfileWidgetEditorProps) {
    const [activeTab, setActiveTab] = useState<EditorTab>('widgets');
    const [showAddWidget, setShowAddWidget] = useState(false);
    const [editingWidget, setEditingWidget] = useState<BaseWidget | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    // Drag and drop sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8, // 8px movement required before drag starts
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Handle drag end
    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = widgets.findIndex((w) => w.id === active.id);
            const newIndex = widgets.findIndex((w) => w.id === over.id);

            const newWidgets = arrayMove(widgets, oldIndex, newIndex);
            // Update positions
            newWidgets.forEach((w, i) => (w.position = i));
            onWidgetsChange(newWidgets);
        }
    }, [widgets, onWidgetsChange]);

    // Group widgets by category
    const widgetsByCategory = Object.entries(WIDGET_METADATA).reduce((acc, [type, meta]) => {
        if (!acc[meta.category]) acc[meta.category] = [];
        acc[meta.category].push({ type: type as WidgetType, ...meta });
        return acc;
    }, {} as Record<string, Array<{ type: WidgetType } & typeof WIDGET_METADATA[WidgetType]>>);

    const categories = [
        { id: 'all', label: 'All', icon: '📦' },
        { id: 'spritz', label: 'Spritz', icon: '🍊' },
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
            config: getDefaultConfig(type, profileData),
        };
        
        setEditingWidget(newWidget);
        setShowAddWidget(false);
    }, [widgets.length, profileData]);

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

                        {/* Widget List with Drag and Drop */}
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={widgets.map((w) => w.id)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="space-y-3">
                                    {widgets.map((widget, index) => (
                                        <SortableWidgetItem
                                            key={widget.id}
                                            widget={widget}
                                            index={index}
                                            totalCount={widgets.length}
                                            onEdit={() => setEditingWidget(widget)}
                                            onDelete={() => handleDeleteWidget(widget.id)}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>

                        {/* Drag hint */}
                        {widgets.length > 1 && (
                            <p className="text-zinc-500 text-xs text-center mt-2">
                                Drag widgets to reorder them
                            </p>
                        )}

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
                                        className={`shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors ${
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

        // ====== SPRITZ FEATURE WIDGETS ======
        case 'message_me':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Custom Title (optional)</label>
                        <input
                            type="text"
                            value={(config.title as string) || ''}
                            onChange={(e) => updateField('title', e.target.value)}
                            placeholder="Message me"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Subtitle (optional)</label>
                        <input
                            type="text"
                            value={(config.subtitle as string) || ''}
                            onChange={(e) => updateField('subtitle', e.target.value)}
                            placeholder="Chat on Spritz"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <p className="text-zinc-500 text-xs">This widget links to your Spritz chat. Your wallet address is used automatically.</p>
                </>
            );

        case 'wallet':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Label (optional)</label>
                        <input
                            type="text"
                            value={(config.label as string) || ''}
                            onChange={(e) => updateField('label', e.target.value)}
                            placeholder="Wallet"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <p className="text-zinc-500 text-xs">Visitors can copy your wallet address with one tap.</p>
                </>
            );

        case 'schedule':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Custom Title (optional)</label>
                        <input
                            type="text"
                            value={(config.title as string) || ''}
                            onChange={(e) => updateField('title', e.target.value)}
                            placeholder="Book a call"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Subtitle (optional)</label>
                        <input
                            type="text"
                            value={(config.subtitle as string) || ''}
                            onChange={(e) => updateField('subtitle', e.target.value)}
                            placeholder="Schedule a meeting"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <p className="text-zinc-500 text-xs">Links to your Spritz scheduling page. Make sure you have scheduling enabled in settings.</p>
                </>
            );

        case 'agent':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Agent ID</label>
                        <input
                            type="text"
                            value={(config.agentId as string) || ''}
                            onChange={(e) => updateField('agentId', e.target.value)}
                            placeholder="agent-id-here"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Agent Name</label>
                        <input
                            type="text"
                            value={(config.name as string) || ''}
                            onChange={(e) => updateField('name', e.target.value)}
                            placeholder="My AI Assistant"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Avatar Emoji</label>
                        <input
                            type="text"
                            value={(config.avatarEmoji as string) || ''}
                            onChange={(e) => updateField('avatarEmoji', e.target.value)}
                            placeholder="🤖"
                            maxLength={4}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <p className="text-zinc-500 text-xs">Showcase one of your AI agents. Find the agent ID in your Agents tab.</p>
                </>
            );

        case 'social_link':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Platform</label>
                        <select
                            value={(config.platform as string) || 'twitter'}
                            onChange={(e) => updateField('platform', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        >
                            <option value="twitter">Twitter / X</option>
                            <option value="github">GitHub</option>
                            <option value="linkedin">LinkedIn</option>
                            <option value="instagram">Instagram</option>
                            <option value="youtube">YouTube</option>
                            <option value="tiktok">TikTok</option>
                            <option value="discord">Discord</option>
                            <option value="telegram">Telegram</option>
                            <option value="farcaster">Farcaster</option>
                            <option value="website">Website</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Handle / Username</label>
                        <input
                            type="text"
                            value={(config.handle as string) || ''}
                            onChange={(e) => updateField('handle', e.target.value)}
                            placeholder="@username"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Profile URL</label>
                        <input
                            type="url"
                            value={(config.url as string) || ''}
                            onChange={(e) => updateField('url', e.target.value)}
                            placeholder="https://..."
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                </>
            );

        case 'github':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">GitHub Username</label>
                        <input
                            type="text"
                            value={(config.username as string) || ''}
                            onChange={(e) => updateField('username', e.target.value)}
                            placeholder="octocat"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Display Type</label>
                        <select
                            value={(config.type as string) || 'contributions'}
                            onChange={(e) => updateField('type', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        >
                            <option value="contributions">Contribution Graph</option>
                            <option value="repos">Pinned Repos</option>
                            <option value="profile">Profile Stats</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="showStats"
                            checked={(config.showStats as boolean) || false}
                            onChange={(e) => updateField('showStats', e.target.checked)}
                            className="w-4 h-4 rounded bg-zinc-800 border-zinc-700"
                        />
                        <label htmlFor="showStats" className="text-sm text-zinc-400">Show additional stats</label>
                    </div>
                </>
            );

        case 'weather':
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
                        <label className="text-sm text-zinc-400 mb-2 block">Country (optional)</label>
                        <input
                            type="text"
                            value={(config.country as string) || ''}
                            onChange={(e) => updateField('country', e.target.value)}
                            placeholder="USA"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Units</label>
                        <select
                            value={(config.units as string) || 'celsius'}
                            onChange={(e) => updateField('units', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        >
                            <option value="celsius">Celsius (°C)</option>
                            <option value="fahrenheit">Fahrenheit (°F)</option>
                        </select>
                    </div>
                </>
            );

        case 'currently':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Activity Type</label>
                        <select
                            value={(config.type as string) || 'building'}
                            onChange={(e) => updateField('type', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        >
                            <option value="building">🛠️ Building</option>
                            <option value="reading">📚 Reading</option>
                            <option value="playing">🎮 Playing</option>
                            <option value="watching">📺 Watching</option>
                            <option value="learning">🧠 Learning</option>
                            <option value="listening">🎧 Listening</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Title</label>
                        <input
                            type="text"
                            value={(config.title as string) || ''}
                            onChange={(e) => updateField('title', e.target.value)}
                            placeholder="e.g., My Next Project"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Subtitle (optional)</label>
                        <input
                            type="text"
                            value={(config.subtitle as string) || ''}
                            onChange={(e) => updateField('subtitle', e.target.value)}
                            placeholder="e.g., A new crypto project"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Image URL (optional)</label>
                        <input
                            type="url"
                            value={(config.imageUrl as string) || ''}
                            onChange={(e) => updateField('imageUrl', e.target.value)}
                            placeholder="https://..."
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

        case 'social_embed':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Platform</label>
                        <select
                            value={(config.platform as string) || 'twitter'}
                            onChange={(e) => updateField('platform', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        >
                            <option value="twitter">Twitter / X</option>
                            <option value="instagram">Instagram</option>
                            <option value="tiktok">TikTok</option>
                            <option value="linkedin">LinkedIn</option>
                            <option value="mastodon">Mastodon</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Post URL</label>
                        <input
                            type="url"
                            value={(config.embedUrl as string) || ''}
                            onChange={(e) => updateField('embedUrl', e.target.value)}
                            placeholder="https://twitter.com/user/status/..."
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                        <p className="text-zinc-500 text-xs mt-1">Paste the full URL of the post you want to embed</p>
                    </div>
                </>
            );

        case 'tip_jar':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Wallet Address</label>
                        <input
                            type="text"
                            value={(config.address as string) || ''}
                            onChange={(e) => updateField('address', e.target.value)}
                            placeholder="0x..."
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white font-mono text-sm"
                        />
                        <p className="text-zinc-500 text-xs mt-1">Your wallet address is used automatically if left empty</p>
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Message (optional)</label>
                        <input
                            type="text"
                            value={(config.message as string) || ''}
                            onChange={(e) => updateField('message', e.target.value)}
                            placeholder="Thanks for the support! ☕"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Accepted Tokens</label>
                        <div className="flex flex-wrap gap-2">
                            {['ETH', 'USDC', 'USDT'].map((token) => {
                                const tokens = (config.tokens as string[]) || ['ETH'];
                                const isSelected = tokens.includes(token);
                                return (
                                    <button
                                        key={token}
                                        type="button"
                                        onClick={() => {
                                            const newTokens = isSelected
                                                ? tokens.filter(t => t !== token)
                                                : [...tokens, token];
                                            updateField('tokens', newTokens.length > 0 ? newTokens : ['ETH']);
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                            isSelected
                                                ? 'bg-orange-500 text-white'
                                                : 'bg-zinc-800 text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        {token}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </>
            );

        case 'stats':
            return (
                <StatsConfigFields config={config} onChange={onChange} />
            );

        case 'tech_stack':
            return (
                <TechStackConfigFields config={config} onChange={onChange} />
            );

        default:
            return (
                <p className="text-zinc-500 text-sm">
                    Configuration options for this widget type are coming soon.
                </p>
            );
    }
}

// Stats config fields with array editing
function StatsConfigFields({
    config,
    onChange,
}: {
    config: Record<string, unknown>;
    onChange: (config: Record<string, unknown>) => void;
}) {
    const stats = (config.stats as Array<{ label: string; value: string | number; emoji?: string }>) || [];
    
    const addStat = () => {
        onChange({
            ...config,
            stats: [...stats, { label: '', value: '', emoji: '' }],
        });
    };
    
    const updateStat = (index: number, field: string, value: string | number) => {
        const newStats = [...stats];
        newStats[index] = { ...newStats[index], [field]: value };
        onChange({ ...config, stats: newStats });
    };
    
    const removeStat = (index: number) => {
        onChange({
            ...config,
            stats: stats.filter((_, i) => i !== index),
        });
    };
    
    return (
        <>
            <div>
                <label className="text-sm text-zinc-400 mb-2 block">Stats</label>
                <div className="space-y-3">
                    {stats.map((stat, index) => (
                        <div key={index} className="flex gap-2 items-start">
                            <input
                                type="text"
                                value={stat.emoji || ''}
                                onChange={(e) => updateStat(index, 'emoji', e.target.value)}
                                placeholder="📊"
                                maxLength={4}
                                className="w-12 px-2 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-center"
                            />
                            <input
                                type="text"
                                value={stat.value}
                                onChange={(e) => updateStat(index, 'value', e.target.value)}
                                placeholder="100"
                                className="w-20 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                            />
                            <input
                                type="text"
                                value={stat.label}
                                onChange={(e) => updateStat(index, 'label', e.target.value)}
                                placeholder="Label"
                                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                            />
                            <button
                                type="button"
                                onClick={() => removeStat(index)}
                                className="w-9 h-9 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={addStat}
                    className="mt-3 w-full py-2 border-2 border-dashed border-zinc-700 rounded-lg text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
                >
                    + Add Stat
                </button>
            </div>
            <div>
                <label className="text-sm text-zinc-400 mb-2 block">Layout</label>
                <div className="flex gap-2">
                    {(['row', 'grid'] as const).map((layout) => (
                        <button
                            key={layout}
                            type="button"
                            onClick={() => onChange({ ...config, layout })}
                            className={`flex-1 py-2 rounded-lg text-sm transition-colors capitalize ${
                                (config.layout || 'row') === layout
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-zinc-800 text-zinc-400 hover:text-white'
                            }`}
                        >
                            {layout}
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}

// Tech Stack config fields with array editing
function TechStackConfigFields({
    config,
    onChange,
}: {
    config: Record<string, unknown>;
    onChange: (config: Record<string, unknown>) => void;
}) {
    const technologies = (config.technologies as Array<{ name: string; icon?: string; color?: string }>) || [];
    
    const addTech = () => {
        onChange({
            ...config,
            technologies: [...technologies, { name: '', icon: '', color: '' }],
        });
    };
    
    const updateTech = (index: number, field: string, value: string) => {
        const newTechs = [...technologies];
        newTechs[index] = { ...newTechs[index], [field]: value };
        onChange({ ...config, technologies: newTechs });
    };
    
    const removeTech = (index: number) => {
        onChange({
            ...config,
            technologies: technologies.filter((_, i) => i !== index),
        });
    };
    
    // Common technologies for quick add
    const quickAddTechs = [
        { name: 'React', icon: '⚛️' },
        { name: 'TypeScript', icon: '🔷' },
        { name: 'Next.js', icon: '▲' },
        { name: 'Node.js', icon: '💚' },
        { name: 'Python', icon: '🐍' },
        { name: 'Rust', icon: '🦀' },
        { name: 'Solidity', icon: '💎' },
        { name: 'Go', icon: '🔵' },
    ];
    
    const availableQuickAdd = quickAddTechs.filter(
        t => !technologies.some(tech => tech.name.toLowerCase() === t.name.toLowerCase())
    );
    
    return (
        <>
            <div>
                <label className="text-sm text-zinc-400 mb-2 block">Label (optional)</label>
                <input
                    type="text"
                    value={(config.label as string) || ''}
                    onChange={(e) => onChange({ ...config, label: e.target.value })}
                    placeholder="Tech Stack"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                />
            </div>
            
            {availableQuickAdd.length > 0 && (
                <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Quick Add</label>
                    <div className="flex flex-wrap gap-2">
                        {availableQuickAdd.slice(0, 6).map((tech) => (
                            <button
                                key={tech.name}
                                type="button"
                                onClick={() => onChange({
                                    ...config,
                                    technologies: [...technologies, tech],
                                })}
                                className="px-3 py-1.5 rounded-lg text-sm bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
                            >
                                {tech.icon} {tech.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            
            <div>
                <label className="text-sm text-zinc-400 mb-2 block">Technologies</label>
                <div className="space-y-3">
                    {technologies.map((tech, index) => (
                        <div key={index} className="flex gap-2 items-start">
                            <input
                                type="text"
                                value={tech.icon || ''}
                                onChange={(e) => updateTech(index, 'icon', e.target.value)}
                                placeholder="💻"
                                maxLength={4}
                                className="w-12 px-2 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-center"
                            />
                            <input
                                type="text"
                                value={tech.name}
                                onChange={(e) => updateTech(index, 'name', e.target.value)}
                                placeholder="Technology name"
                                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                            />
                            <button
                                type="button"
                                onClick={() => removeTech(index)}
                                className="w-9 h-9 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={addTech}
                    className="mt-3 w-full py-2 border-2 border-dashed border-zinc-700 rounded-lg text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
                >
                    + Add Technology
                </button>
            </div>
        </>
    );
}

// Get default config for a widget type
function getDefaultConfig(type: WidgetType, profileData?: ProfileData): Record<string, unknown> {
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
            return { stats: [], layout: 'row' };
        case 'tech_stack':
            return { technologies: [], label: 'Tech Stack' };
        case 'currently':
            return { type: 'building', title: '', subtitle: '', imageUrl: '', link: '' };
        case 'github':
            return { username: '', type: 'contributions', showStats: false };
        case 'weather':
            return { city: '', country: '', units: 'celsius' };
        case 'social_embed':
            return { platform: 'twitter', embedUrl: '', postId: '' };
        case 'tip_jar':
            return { 
                address: profileData?.address || '', 
                tokens: ['ETH'], 
                message: '', 
                amounts: [0.01, 0.05, 0.1] 
            };
        // Spritz feature widgets - use profile data if available
        case 'message_me':
            return { 
                address: profileData?.address || '',
                title: 'Message me', 
                subtitle: 'Chat on Spritz' 
            };
        case 'wallet':
            return { 
                address: profileData?.address || '',
                label: 'Wallet', 
                copyEnabled: true 
            };
        case 'schedule':
            return { 
                slug: profileData?.scheduling?.slug || '',
                title: profileData?.scheduling?.title || 'Book a call', 
                subtitle: profileData?.scheduling?.bio || 'Schedule a meeting' 
            };
        case 'agent':
            // If user has agents, pre-fill with first available one
            const firstAgent = profileData?.agents?.[0];
            return { 
                agentId: firstAgent?.id || '', 
                name: firstAgent?.name || '', 
                avatarEmoji: firstAgent?.avatar_emoji || '🤖',
                avatarUrl: firstAgent?.avatar_url || '',
            };
        case 'social_link':
            return { platform: 'twitter', handle: '', url: '' };
        default:
            return {};
    }
}
