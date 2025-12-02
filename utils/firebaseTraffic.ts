
type TrafficStats = {
    reads: number;
    writes: number;
    deletes: number;
    bandwidth: number; // in bytes
};

type Listener = (stats: TrafficStats) => void;
type VisibilityListener = (visible: boolean) => void;

class FirebaseTrafficWatcher {
    private stats: TrafficStats = {
        reads: 0,
        writes: 0,
        deletes: 0,
        bandwidth: 0,
    };

    private listeners: Listener[] = [];
    private visibilityListeners: VisibilityListener[] = [];
    private isVisible: boolean = true; // Default to visible

    // --- LOGGING METHODS ---

    logRead(count: number = 1) {
        this.stats.reads += count;
        this.notify();
    }

    logWrite(count: number = 1) {
        this.stats.writes += count;
        this.notify();
    }

    logDelete(count: number = 1) {
        this.stats.deletes += count;
        this.notify();
    }

    logBandwidth(bytes: number) {
        this.stats.bandwidth += bytes;
        this.notify();
    }

    // --- VISIBILITY CONTROL ---

    toggleToast() {
        this.isVisible = !this.isVisible;
        this.notifyVisibility();
    }

    setToastVisibility(visible: boolean) {
        this.isVisible = visible;
        this.notifyVisibility();
    }

    getToastVisibility() {
        return this.isVisible;
    }

    // --- SUBSCRIPTION ---

    subscribe(callback: Listener) {
        this.listeners.push(callback);
        callback(this.stats); // Initial call
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    subscribeVisibility(callback: VisibilityListener) {
        this.visibilityListeners.push(callback);
        callback(this.isVisible);
        return () => {
            this.visibilityListeners = this.visibilityListeners.filter(l => l !== callback);
        };
    }

    private notify() {
        this.listeners.forEach(l => l(this.stats));
    }

    private notifyVisibility() {
        this.visibilityListeners.forEach(l => l(this.isVisible));
    }

    getStats() {
        return { ...this.stats };
    }

    reset() {
        this.stats = { reads: 0, writes: 0, deletes: 0, bandwidth: 0 };
        this.notify();
    }
}

export const trafficWatcher = new FirebaseTrafficWatcher();
