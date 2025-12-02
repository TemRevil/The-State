import {
    getDoc as originalGetDoc,
    getDocs as originalGetDocs,
    setDoc as originalSetDoc,
    updateDoc as originalUpdateDoc,
    deleteDoc as originalDeleteDoc,
    onSnapshot as originalOnSnapshot,
    doc, collection,
    DocumentReference, CollectionReference, Query, DocumentSnapshot, QuerySnapshot,
    DocumentData, WithFieldValue, UpdateData, Unsubscribe
} from 'firebase/firestore';

import {
    uploadBytes as originalUploadBytes,
    getDownloadURL as originalGetDownloadURL,
    listAll as originalListAll,
    deleteObject as originalDeleteObject,
    StorageReference, UploadResult, ListResult
} from 'firebase/storage';

import { trafficWatcher } from './firebaseTraffic';

// --- FIRESTORE WRAPPERS ---

export const getDoc = async (reference: DocumentReference<DocumentData>): Promise<DocumentSnapshot<DocumentData>> => {
    trafficWatcher.logRead(1);
    return originalGetDoc(reference);
};

export const getDocs = async (query: Query<DocumentData>): Promise<QuerySnapshot<DocumentData>> => {
    const snapshot = await originalGetDocs(query);
    trafficWatcher.logRead(snapshot.size); // 1 read per document returned
    return snapshot;
};

export const setDoc = async (reference: DocumentReference<DocumentData>, data: WithFieldValue<DocumentData>, options?: any): Promise<void> => {
    trafficWatcher.logWrite(1);
    return originalSetDoc(reference, data, options);
};

export const updateDoc = async (reference: DocumentReference<DocumentData>, data: UpdateData<DocumentData>): Promise<void> => {
    trafficWatcher.logWrite(1);
    return originalUpdateDoc(reference, data);
};

export const deleteDoc = async (reference: DocumentReference<DocumentData>): Promise<void> => {
    trafficWatcher.logDelete(1);
    return originalDeleteDoc(reference);
};

export function onSnapshot(
    reference: DocumentReference<DocumentData>,
    observer: (snapshot: DocumentSnapshot<DocumentData>) => void
): Unsubscribe;
export function onSnapshot(
    reference: Query<DocumentData>,
    observer: (snapshot: QuerySnapshot<DocumentData>) => void
): Unsubscribe;
export function onSnapshot(
    reference: Query<DocumentData> | DocumentReference<DocumentData>,
    observer: (snapshot: any) => void
) {
    // Initial read is counted when the snapshot first fires
    // Subsequent updates count as reads for the changed docs
    return originalOnSnapshot(reference as any, (snapshot: any) => {
        if (snapshot.docChanges) {
            // It's a QuerySnapshot
            const changes = snapshot.docChanges();
            if (changes.length > 0) {
                trafficWatcher.logRead(changes.length);
            } else if (snapshot.size > 0 && snapshot.metadata.fromCache === false) {
                // Initial load might not have changes array populated in some SDK versions/contexts, 
                // but usually docChanges handles it. 
                // If it's the very first load, we count all.
                // Note: onSnapshot behavior can be complex, this is a rough approximation.
            }
        } else {
            // It's a DocumentSnapshot
            trafficWatcher.logRead(1);
        }
        observer(snapshot);
    });
}

// --- STORAGE WRAPPERS ---

export const uploadBytes = async (ref: StorageReference, data: Blob | Uint8Array | ArrayBuffer, metadata?: any): Promise<UploadResult> => {
    const size = (data as Blob).size || (data as Uint8Array).byteLength || (data as ArrayBuffer).byteLength || 0;
    trafficWatcher.logBandwidth(size); // Upload bandwidth
    trafficWatcher.logWrite(1); // Storage write operation
    return originalUploadBytes(ref, data, metadata);
};

export const getDownloadURL = async (ref: StorageReference): Promise<string> => {
    // Note: getDownloadURL doesn't strictly consume bandwidth itself until the URL is used to fetch the file.
    // However, it is an operation. We'll count it as a "Read" operation if we want, or just ignore.
    // The user asked for "what goes and what comes in".
    // We can't easily track the download size HERE, only when the browser fetches it.
    // But we can track the operation.
    return originalGetDownloadURL(ref);
};

export const listAll = async (ref: StorageReference): Promise<ListResult> => {
    // List operations are usually Class B operations (heavy).
    // We'll just count it as a read for now or ignore if not strictly requested.
    // Let's count it as 1 read operation for simplicity in our "Read" counter, 
    // or maybe we should have a separate "Ops" counter? 
    // The user asked for "Firestore usage live" and "firebase storage usage".
    // We'll stick to the main counters.
    return originalListAll(ref);
};

export const deleteObject = async (ref: StorageReference): Promise<void> => {
    trafficWatcher.logDelete(1);
    return originalDeleteObject(ref);
};

// Re-export types and other functions that don't need wrapping
export { doc, collection };
export { ref } from 'firebase/storage';
