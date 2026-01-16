"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import {
    DndContext,
    DragOverlay,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragEndEvent,
    UniqueIdentifier,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { 
    BaseWidget, 
    WidgetType, 
    WidgetSize,
    WIDGET_METADATA,
    getGridSpanClasses,
    ProfileTheme,
    DEFAULT_THEMES,
} from "./ProfileWidgetTypes";
import { renderWidget } from "./ProfileWidgetRenderer";

// Profile data for pre-populating widget configs
type ProfileData = {
    address: string;
    scheduling?: { slug: string; title?: string; bio?: string } | null;
    socials?: Array<{ platform: string; handle: string; url: string }>;
    agents?: Array<{ id: string; name: string; avatar_emoji?: string; avatar_url?: string }>;
};

interface ProfileGridEditorProps {
    widgets: BaseWidget[];
    theme: ProfileTheme | null;
    onWidgetsChange: (widgets: BaseWidget[]) => void;
    onThemeChange: (theme: Partial<ProfileTheme>) => void;
    onSave: () => Promise<void>;
    isSaving: boolean;
    profileData?: ProfileData;
    backUrl?: string;
}

// Draggable widget card in the grid
function DraggableWidget({
    widget,
    isEditing,
    onEdit,
    onDelete,
    onResize,
}: {
    widget: BaseWidget;
    isEditing: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onResize: (size: WidgetSize) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: widget.id });

    const [showSizeMenu, setShowSizeMenu] = useState(false);
    const meta = WIDGET_METADATA[widget.widget_type];

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`${getGridSpanClasses(widget.size)} relative group ${
                isDragging ? 'z-50 opacity-70' : ''
            }`}
        >
            {/* Widget Content - render directly without nested grid */}
            <div className="w-full h-full">
                {renderWidget(widget)}
            </div>

            {/* Edit Overlay */}
            {isEditing && (
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors rounded-2xl pointer-events-none">
                    {/* Drag Handle - covers the whole widget */}
                    <div
                        {...attributes}
                        {...listeners}
                        className="absolute inset-0 cursor-grab active:cursor-grabbing pointer-events-auto"
                    />
                    
                    {/* Control Buttons */}
                    <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto">
                        {/* Size button */}
                        <div className="relative">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowSizeMenu(!showSizeMenu);
                                }}
                                className="w-8 h-8 rounded-lg bg-zinc-900/90 backdrop-blur text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center justify-center transition-colors"
                                title="Resize widget"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                </svg>
                            </button>
                            
                            {/* Size Menu */}
                            <AnimatePresence>
                                {showSizeMenu && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        className="absolute top-full right-0 mt-1 p-2 bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-xl shadow-xl z-50 min-w-[140px]"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <p className="text-xs text-zinc-500 mb-2 px-1">Size</p>
                                        <div className="grid grid-cols-3 gap-1">
                                            {meta?.allowedSizes.map((size) => (
                                                <button
                                                    key={size}
                                                    onClick={() => {
                                                        onResize(size);
                                                        setShowSizeMenu(false);
                                                    }}
                                                    className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                                                        widget.size === size
                                                            ? 'bg-orange-500 text-white'
                                                            : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                                                    }`}
                                                >
                                                    {size}
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        
                        {/* Edit button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit();
                            }}
                            className="w-8 h-8 rounded-lg bg-zinc-900/90 backdrop-blur text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center justify-center transition-colors"
                            title="Edit widget"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                        
                        {/* Delete button */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete();
                            }}
                            className="w-8 h-8 rounded-lg bg-zinc-900/90 backdrop-blur text-red-400 hover:text-red-300 hover:bg-red-500/20 flex items-center justify-center transition-colors"
                            title="Delete widget"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                    
                    {/* Widget type indicator */}
                    <div className="absolute bottom-2 left-2 px-2 py-1 rounded-lg bg-zinc-900/90 backdrop-blur text-xs text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        {meta?.icon} {meta?.name}
                    </div>
                </div>
            )}
        </div>
    );
}

// Widget preview during drag
function DragPreview({ widget }: { widget: BaseWidget }) {
    const meta = WIDGET_METADATA[widget.widget_type];
    
    return (
        <div 
            className={`${getGridSpanClasses(widget.size)} bg-zinc-800/90 backdrop-blur border-2 border-orange-500 rounded-2xl p-4 flex flex-col items-center justify-center min-h-[120px]`}
            style={{ width: widget.size.startsWith('4') ? '100%' : widget.size.startsWith('2') ? '50%' : '25%' }}
        >
            <span className="text-3xl mb-2">{meta?.icon}</span>
            <p className="text-white font-medium text-sm">{meta?.name}</p>
        </div>
    );
}

export function ProfileGridEditor({
    widgets,
    theme,
    onWidgetsChange,
    onThemeChange,
    onSave,
    isSaving,
    profileData,
    backUrl,
}: ProfileGridEditorProps) {
    const [isEditing, setIsEditing] = useState(true);
    const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
    const [showAddWidget, setShowAddWidget] = useState(false);
    const [editingWidget, setEditingWidget] = useState<BaseWidget | null>(null);
    const [showThemePanel, setShowThemePanel] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    // Sort widgets by position
    const sortedWidgets = useMemo(() => 
        [...widgets].sort((a, b) => a.position - b.position),
        [widgets]
    );

    const activeWidget = activeId 
        ? sortedWidgets.find(w => w.id === activeId) 
        : null;

    // Drag sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (over && active.id !== over.id) {
            const oldIndex = sortedWidgets.findIndex(w => w.id === active.id);
            const newIndex = sortedWidgets.findIndex(w => w.id === over.id);

            const newWidgets = [...sortedWidgets];
            const [movedWidget] = newWidgets.splice(oldIndex, 1);
            newWidgets.splice(newIndex, 0, movedWidget);
            
            // Update positions
            newWidgets.forEach((w, i) => w.position = i);
            onWidgetsChange(newWidgets);
        }
    }, [sortedWidgets, onWidgetsChange]);

    // Widget operations
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

    const handleSaveWidget = useCallback((widget: BaseWidget) => {
        const isNew = widget.id.startsWith('temp-');
        
        if (isNew) {
            onWidgetsChange([...widgets, { ...widget, id: `widget-${Date.now()}` }]);
        } else {
            onWidgetsChange(widgets.map(w => w.id === widget.id ? widget : w));
        }
        
        setEditingWidget(null);
    }, [widgets, onWidgetsChange]);

    const handleDeleteWidget = useCallback((widgetId: string) => {
        onWidgetsChange(widgets.filter(w => w.id !== widgetId));
    }, [widgets, onWidgetsChange]);

    const handleResizeWidget = useCallback((widgetId: string, newSize: WidgetSize) => {
        onWidgetsChange(widgets.map(w => 
            w.id === widgetId ? { ...w, size: newSize } : w
        ));
    }, [widgets, onWidgetsChange]);

    // Widget categories
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

    const activeTheme = theme || DEFAULT_THEMES.dark as ProfileTheme;
    const backgroundStyle = activeTheme.background_type === 'gradient' || activeTheme.background_type === 'image'
        ? { background: activeTheme.background_value }
        : { backgroundColor: activeTheme.background_value };

    return (
        <div className="min-h-screen bg-zinc-950">
            {/* Top Bar */}
            <div className="sticky top-0 z-40 bg-zinc-900/95 backdrop-blur border-b border-zinc-800">
                <div className="max-w-6xl mx-auto px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            {backUrl && (
                                <Link
                                    href={backUrl}
                                    className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                </Link>
                            )}
                            <h1 className="text-lg font-bold text-white">Edit Profile</h1>
                            
                            {/* Mode Toggle */}
                            <div className="flex items-center gap-1 p-1 bg-zinc-800 rounded-lg">
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                        isEditing 
                                            ? 'bg-orange-500 text-white' 
                                            : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => setIsEditing(false)}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                        !isEditing 
                                            ? 'bg-orange-500 text-white' 
                                            : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    Preview
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowThemePanel(!showThemePanel)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    showThemePanel
                                        ? 'bg-orange-500 text-white'
                                        : 'bg-zinc-800 text-zinc-300 hover:text-white'
                                }`}
                            >
                                🎨 Theme
                            </button>
                            <button
                                onClick={onSave}
                                disabled={isSaving}
                                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                            >
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex">
                {/* Main Grid Area */}
                <div className="flex-1 p-4 sm:p-6">
                    {/* Profile Preview Container */}
                    <div 
                        className="max-w-2xl mx-auto rounded-2xl overflow-hidden min-h-[500px] p-6 transition-all"
                        style={backgroundStyle}
                    >
                        {/* Add Widget Button */}
                        {isEditing && (
                            <button
                                onClick={() => setShowAddWidget(true)}
                                className="w-full mb-4 p-4 border-2 border-dashed border-white/20 hover:border-orange-500/50 rounded-2xl text-white/60 hover:text-white transition-colors flex items-center justify-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add Widget
                            </button>
                        )}

                        {/* Widgets Grid */}
                        {sortedWidgets.length > 0 ? (
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragStart={handleDragStart}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={sortedWidgets.map(w => w.id)}
                                    strategy={rectSortingStrategy}
                                >
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 auto-rows-[minmax(120px,auto)]">
                                        {sortedWidgets.map((widget) => (
                                            <DraggableWidget
                                                key={widget.id}
                                                widget={widget}
                                                isEditing={isEditing}
                                                onEdit={() => setEditingWidget(widget)}
                                                onDelete={() => handleDeleteWidget(widget.id)}
                                                onResize={(size) => handleResizeWidget(widget.id, size)}
                                            />
                                        ))}
                                    </div>
                                </SortableContext>
                                
                                {/* Drag Overlay */}
                                <DragOverlay>
                                    {activeWidget ? (
                                        <DragPreview widget={activeWidget} />
                                    ) : null}
                                </DragOverlay>
                            </DndContext>
                        ) : (
                            <div className="text-center py-16">
                                <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
                                    <span className="text-4xl">📦</span>
                                </div>
                                <p className="text-white/60 mb-4">No widgets yet</p>
                                <button
                                    onClick={() => setShowAddWidget(true)}
                                    className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors"
                                >
                                    Add Your First Widget
                                </button>
                            </div>
                        )}

                        {/* Edit Mode Hint */}
                        {isEditing && sortedWidgets.length > 0 && (
                            <p className="text-center text-white/40 text-sm mt-6">
                                Drag widgets to reorder • Hover for controls
                            </p>
                        )}
                    </div>
                </div>

                {/* Theme Panel (Sidebar) */}
                <AnimatePresence>
                    {showThemePanel && (
                        <motion.div
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 320, opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            className="border-l border-zinc-800 bg-zinc-900/50 overflow-hidden"
                        >
                            <div className="w-80 p-4 space-y-6">
                                <h2 className="text-white font-semibold">Theme</h2>
                                
                                {/* Preset Themes */}
                                <div>
                                    <p className="text-sm text-zinc-400 mb-3">Presets</p>
                                    <div className="grid grid-cols-3 gap-2">
                                        {Object.entries(DEFAULT_THEMES).map(([name, preset]) => (
                                            <button
                                                key={name}
                                                onClick={() => onThemeChange(preset as Partial<ProfileTheme>)}
                                                className="aspect-square rounded-xl border-2 border-zinc-700 hover:border-orange-500 transition-colors overflow-hidden"
                                                style={{ background: preset.background_value }}
                                            >
                                                <div className="w-full h-full flex items-end p-2">
                                                    <div 
                                                        className="w-full h-1.5 rounded-full"
                                                        style={{ backgroundColor: preset.accent_color }}
                                                    />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Custom Colors */}
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm text-zinc-400 mb-2 block">Accent Color</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="color"
                                                value={activeTheme.accent_color}
                                                onChange={(e) => onThemeChange({ accent_color: e.target.value })}
                                                className="w-12 h-10 rounded-lg cursor-pointer border-0"
                                            />
                                            <input
                                                type="text"
                                                value={activeTheme.accent_color}
                                                onChange={(e) => onThemeChange({ accent_color: e.target.value })}
                                                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm font-mono"
                                            />
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="text-sm text-zinc-400 mb-2 block">Background</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="color"
                                                value={activeTheme.background_value?.startsWith('#') ? activeTheme.background_value : '#09090b'}
                                                onChange={(e) => onThemeChange({ background_type: 'solid', background_value: e.target.value })}
                                                className="w-12 h-10 rounded-lg cursor-pointer border-0"
                                            />
                                            <input
                                                type="text"
                                                value={activeTheme.background_value}
                                                onChange={(e) => onThemeChange({ background_value: e.target.value })}
                                                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm font-mono"
                                            />
                                        </div>
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
                                                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                                                    activeTheme.card_style === style
                                                        ? 'bg-orange-500 text-white'
                                                        : 'bg-zinc-800 text-zinc-400 hover:text-white'
                                                }`}
                                            >
                                                {style}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Show Badge */}
                                <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
                                    <div>
                                        <p className="text-white text-sm font-medium">Spritz Badge</p>
                                        <p className="text-zinc-500 text-xs">Show "Create your Spritz profile"</p>
                                    </div>
                                    <button
                                        onClick={() => onThemeChange({ show_spritz_badge: !activeTheme.show_spritz_badge })}
                                        className={`w-11 h-6 rounded-full transition-colors ${
                                            activeTheme.show_spritz_badge ? 'bg-orange-500' : 'bg-zinc-700'
                                        }`}
                                    >
                                        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                                            activeTheme.show_spritz_badge ? 'translate-x-5' : 'translate-x-0.5'
                                        }`} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
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
                            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                                <h2 className="text-lg font-bold text-white">Add Widget</h2>
                                <button 
                                    onClick={() => setShowAddWidget(false)}
                                    className="text-zinc-400 hover:text-white"
                                >
                                    ✕
                                </button>
                            </div>
                            
                            {/* Categories */}
                            <div className="flex gap-1 p-4 overflow-x-auto border-b border-zinc-800/50">
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
                            <div className="p-4 max-h-[50vh] overflow-y-auto">
                                <div className="grid grid-cols-2 gap-2">
                                    {filteredWidgets.map(([type, meta]) => (
                                        <button
                                            key={type}
                                            onClick={() => handleAddWidget(type as WidgetType)}
                                            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 transition-colors text-center group"
                                        >
                                            <span className="text-3xl group-hover:scale-110 transition-transform">{meta.icon}</span>
                                            <div>
                                                <p className="text-white font-medium text-sm">{meta.name}</p>
                                                <p className="text-zinc-500 text-xs">{meta.defaultSize}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
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
                        onDelete={() => {
                            handleDeleteWidget(editingWidget.id);
                            setEditingWidget(null);
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// Import the WidgetConfigModal from the existing editor or recreate it here
import { 
    MapWidgetConfig,
    ImageWidgetConfig,
    TextWidgetConfig,
    LinkWidgetConfig,
    SpotifyWidgetConfig,
    VideoWidgetConfig,
    NFTWidgetConfig,
    CountdownWidgetConfig,
    ClockWidgetConfig,
    MessageMeWidgetConfig,
    WalletWidgetConfig,
    ScheduleWidgetConfig,
    AgentWidgetConfig,
    SocialLinkWidgetConfig,
} from "./ProfileWidgetTypes";

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

    const updateField = (field: string, value: unknown) => {
        setConfig({ ...config, [field]: value });
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
                        updateField={updateField}
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

// Simplified widget config fields (importing full version would create circular dependency)
function WidgetConfigFields({
    type,
    config,
    onChange,
    updateField,
}: {
    type: WidgetType;
    config: Record<string, unknown>;
    onChange: (config: Record<string, unknown>) => void;
    updateField: (field: string, value: unknown) => void;
}) {
    switch (type) {
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
                        <label className="text-sm text-zinc-400 mb-2 block">Icon (emoji)</label>
                        <input
                            type="text"
                            value={(config.icon as string) || ''}
                            onChange={(e) => updateField('icon', e.target.value)}
                            placeholder="🔗"
                            maxLength={4}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                </>
            );

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

        case 'spotify':
            return (
                <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Spotify Link or URI</label>
                    <input
                        type="text"
                        value={(config.spotifyUri as string) || ''}
                        onChange={(e) => updateField('spotifyUri', e.target.value)}
                        placeholder="https://open.spotify.com/track/..."
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                    />
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
                        <label className="text-sm text-zinc-400 mb-2 block">Emoji</label>
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
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Label</label>
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
                        <label className="text-sm text-zinc-400 mb-2 block">Units</label>
                        <select
                            value={(config.units as string) || 'celsius'}
                            onChange={(e) => updateField('units', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        >
                            <option value="celsius">Celsius</option>
                            <option value="fahrenheit">Fahrenheit</option>
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
                            <option value="building">Building</option>
                            <option value="reading">Reading</option>
                            <option value="playing">Playing</option>
                            <option value="watching">Watching</option>
                            <option value="learning">Learning</option>
                            <option value="listening">Listening</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Title</label>
                        <input
                            type="text"
                            value={(config.title as string) || ''}
                            onChange={(e) => updateField('title', e.target.value)}
                            placeholder="My Project"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Subtitle</label>
                        <input
                            type="text"
                            value={(config.subtitle as string) || ''}
                            onChange={(e) => updateField('subtitle', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                </>
            );

        case 'message_me':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Title</label>
                        <input
                            type="text"
                            value={(config.title as string) || ''}
                            onChange={(e) => updateField('title', e.target.value)}
                            placeholder="Message me"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Subtitle</label>
                        <input
                            type="text"
                            value={(config.subtitle as string) || ''}
                            onChange={(e) => updateField('subtitle', e.target.value)}
                            placeholder="Chat on Spritz"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                </>
            );

        case 'wallet':
            return (
                <div>
                    <label className="text-sm text-zinc-400 mb-2 block">Label</label>
                    <input
                        type="text"
                        value={(config.label as string) || ''}
                        onChange={(e) => updateField('label', e.target.value)}
                        placeholder="Wallet"
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                    />
                </div>
            );

        case 'schedule':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Title</label>
                        <input
                            type="text"
                            value={(config.title as string) || ''}
                            onChange={(e) => updateField('title', e.target.value)}
                            placeholder="Book a call"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Subtitle</label>
                        <input
                            type="text"
                            value={(config.subtitle as string) || ''}
                            onChange={(e) => updateField('subtitle', e.target.value)}
                            placeholder="Schedule a meeting"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
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
                            <option value="discord">Discord</option>
                            <option value="telegram">Telegram</option>
                            <option value="farcaster">Farcaster</option>
                            <option value="website">Website</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Handle</label>
                        <input
                            type="text"
                            value={(config.handle as string) || ''}
                            onChange={(e) => updateField('handle', e.target.value)}
                            placeholder="@username"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
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
                        <label className="text-sm text-zinc-400 mb-2 block">Image URL (preview)</label>
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

        case 'tip_jar':
            return (
                <>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Message</label>
                        <input
                            type="text"
                            value={(config.message as string) || ''}
                            onChange={(e) => updateField('message', e.target.value)}
                            placeholder="Thanks for the support!"
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                        />
                    </div>
                    <div>
                        <label className="text-sm text-zinc-400 mb-2 block">Accepted Tokens</label>
                        <div className="flex gap-2">
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

        default:
            return (
                <p className="text-zinc-500 text-sm">
                    Configure this widget using the options above.
                </p>
            );
    }
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
        case 'github':
            return { username: '', type: 'contributions' };
        case 'weather':
            return { city: '', units: 'celsius' };
        case 'currently':
            return { type: 'building', title: '' };
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
                title: 'Book a call', 
                subtitle: 'Schedule a meeting' 
            };
        case 'agent':
            const firstAgent = profileData?.agents?.[0];
            return { 
                agentId: firstAgent?.id || '', 
                name: firstAgent?.name || '', 
                avatarEmoji: firstAgent?.avatar_emoji || '🤖',
            };
        case 'social_link':
            return { platform: 'twitter', handle: '', url: '' };
        case 'tip_jar':
            return { 
                address: profileData?.address || '', 
                tokens: ['ETH'], 
                message: '' 
            };
        default:
            return {};
    }
}
