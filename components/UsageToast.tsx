import React, { useEffect, useState, useRef } from 'react';
import { trafficWatcher } from '../utils/firebaseTraffic';
import { Activity, Database, HardDrive, Trash2, X } from 'lucide-react';

export const UsageToast: React.FC = () => {
    const [stats, setStats] = useState(trafficWatcher.getStats());
    const [visible, setVisible] = useState(trafficWatcher.getToastVisibility());

    // Animation states
    const [flashReads, setFlashReads] = useState(false);
    const [flashWrites, setFlashWrites] = useState(false);
    const [flashDeletes, setFlashDeletes] = useState(false);
    const [flashBandwidth, setFlashBandwidth] = useState(false);

    // Drag states
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState(() => {
        const saved = localStorage.getItem('usageToastPosition');
        return saved ? JSON.parse(saved) : { x: 20, y: 20 };
    });
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const prevStats = useRef(stats);
    const toastRef = useRef<HTMLDivElement>(null);

    // Drag handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!toastRef.current) return;
        setIsDragging(true);
        const rect = toastRef.current.getBoundingClientRect();
        setDragOffset({
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        });
        e.preventDefault();
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (!toastRef.current) return;
        setIsDragging(true);
        const rect = toastRef.current.getBoundingClientRect();
        const touch = e.touches[0];
        setDragOffset({
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        });
        e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;

        const newX = e.clientX - dragOffset.x;
        const newY = e.clientY - dragOffset.y;

        // Keep within viewport bounds
        const maxX = window.innerWidth - 280; // toast width approx
        const maxY = window.innerHeight - 200; // toast height approx

        const clampedX = Math.max(0, Math.min(newX, maxX));
        const clampedY = Math.max(0, Math.min(newY, maxY));

        setPosition({ x: clampedX, y: clampedY });
    };

    const handleTouchMove = (e: TouchEvent) => {
        if (!isDragging) return;

        const touch = e.touches[0];
        const newX = touch.clientX - dragOffset.x;
        const newY = touch.clientY - dragOffset.y;

        // Keep within viewport bounds
        const maxX = window.innerWidth - 280; // toast width approx
        const maxY = window.innerHeight - 200; // toast height approx

        const clampedX = Math.max(0, Math.min(newX, maxX));
        const clampedY = Math.max(0, Math.min(newY, maxY));

        setPosition({ x: clampedX, y: clampedY });
        e.preventDefault();
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        localStorage.setItem('usageToastPosition', JSON.stringify(position));
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
        localStorage.setItem('usageToastPosition', JSON.stringify(position));
    };

    useEffect(() => {
        const unsubStats = trafficWatcher.subscribe((newStats) => {
            // Check for changes to trigger flashes
            if (newStats.reads > prevStats.current.reads) { setFlashReads(true); setTimeout(() => setFlashReads(false), 500); }
            if (newStats.writes > prevStats.current.writes) { setFlashWrites(true); setTimeout(() => setFlashWrites(false), 500); }
            if (newStats.deletes > prevStats.current.deletes) { setFlashDeletes(true); setTimeout(() => setFlashDeletes(false), 500); }
            if (newStats.bandwidth > prevStats.current.bandwidth) { setFlashBandwidth(true); setTimeout(() => setFlashBandwidth(false), 500); }

            prevStats.current = { ...newStats };
            setStats({ ...newStats });
        });

        const unsubVis = trafficWatcher.subscribeVisibility((isVisible) => {
            setVisible(isVisible);
        });

        // Add global event listeners for drag
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('touchmove', handleTouchMove);
        document.addEventListener('touchend', handleTouchEnd);

        return () => {
            unsubStats();
            unsubVis();
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleTouchEnd);
        };
    }, [isDragging, dragOffset, position]);

    // Only show for specific user
    const userNumber = localStorage.getItem("Number");
    const allowedNumber = "01001308280";
    if (userNumber !== allowedNumber || !visible) return null;

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div
            ref={toastRef}
            className={`usage-toast ${isDragging ? 'usage-toast-dragging' : ''}`}
            style={{
                position: 'fixed',
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: '280px',
                zIndex: 1000,
                cursor: isDragging ? 'grabbing' : 'grab'
            }}
        >
            <div className="usage-toast-container">
                <div
                    className="usage-toast-header"
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleTouchStart}
                    style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
                >
                    <div className="usage-toast-title">
                        <Activity size={16} className="animate-pulse text-primary" />
                        <span>LIVE TRAFFIC</span>
                    </div>
                    <button
                        onClick={() => trafficWatcher.toggleToast()}
                        className="usage-toast-close"
                        onMouseDown={(e) => e.stopPropagation()} // Prevent drag when clicking close
                        onTouchStart={(e) => e.stopPropagation()} // Prevent drag when touching close
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="usage-toast-grid">
                    <div className={`usage-toast-stat ${flashReads ? 'usage-toast-stat-flash-blue' : ''}`}>
                        <div className="usage-toast-stat-label">
                            <Database size={12} /> Reads
                        </div>
                        <span className={`usage-toast-stat-value ${flashReads ? 'usage-toast-stat-value-flash' : ''}`} style={{ color: '#60a5fa' }}>{stats.reads}</span>
                    </div>

                    <div className={`usage-toast-stat ${flashWrites ? 'usage-toast-stat-flash-amber' : ''}`}>
                        <div className="usage-toast-stat-label">
                            <Database size={12} /> Writes
                        </div>
                        <span className={`usage-toast-stat-value ${flashWrites ? 'usage-toast-stat-value-flash' : ''}`} style={{ color: '#fbbf24' }}>{stats.writes}</span>
                    </div>

                    <div className={`usage-toast-stat ${flashDeletes ? 'usage-toast-stat-flash-red' : ''}`}>
                        <div className="usage-toast-stat-label">
                            <Trash2 size={12} /> Deletes
                        </div>
                        <span className={`usage-toast-stat-value ${flashDeletes ? 'usage-toast-stat-value-flash' : ''}`} style={{ color: '#f87171' }}>{stats.deletes}</span>
                    </div>

                    <div className={`usage-toast-stat ${flashBandwidth ? 'usage-toast-stat-flash-emerald' : ''}`}>
                        <div className="usage-toast-stat-label">
                            <HardDrive size={12} /> Bandwidth
                        </div>
                        <span className={`usage-toast-stat-value ${flashBandwidth ? 'usage-toast-stat-value-flash' : ''}`} style={{ color: '#34d399', fontSize: '0.875rem' }}>{formatBytes(stats.bandwidth)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
