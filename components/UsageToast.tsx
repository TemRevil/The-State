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
            className={`usage-toast-v2 ${isDragging ? 'dragging' : ''}`}
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
            }}
        >
            <div
                className="usage-toast-header"
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
            >
                <div className="usage-toast-title">
                    <div className="status-dot animate-pulse"></div>
                    <span>Data Traffic</span>
                </div>
                <button
                    onClick={() => trafficWatcher.toggleToast()}
                    className="usage-toast-close"
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                >
                    <X size={14} />
                </button>
            </div>

            <div className="usage-toast-body">
                <div className={`usage-stat-card ${flashReads ? 'usage-flash-blue' : ''}`}>
                    <div className="usage-stat-label">
                        <Database size={10} className="text-primary" /> Reads
                    </div>
                    <span className="usage-stat-value">{stats.reads.toLocaleString()}</span>
                </div>

                <div className={`usage-stat-card ${flashWrites ? 'usage-flash-amber' : ''}`}>
                    <div className="usage-stat-label">
                        <Database size={10} className="text-warning" /> Writes
                    </div>
                    <span className="usage-stat-value">{stats.writes.toLocaleString()}</span>
                </div>

                <div className={`usage-stat-card ${flashDeletes ? 'usage-flash-red' : ''}`}>
                    <div className="usage-stat-label">
                        <Trash2 size={10} className="text-error" /> Deletes
                    </div>
                    <span className="usage-stat-value">{stats.deletes.toLocaleString()}</span>
                </div>

                <div className={`usage-stat-card ${flashBandwidth ? 'usage-flash-emerald' : ''}`}>
                    <div className="usage-stat-label">
                        <HardDrive size={10} className="text-success" /> Bandwidth
                    </div>
                    <span className="usage-stat-value" style={{ fontSize: '0.9rem' }}>{formatBytes(stats.bandwidth)}</span>
                </div>
            </div>
        </div>
    );
};
