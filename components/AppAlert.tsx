import React from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

interface AppAlertProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    message: string;
    type?: 'success' | 'error' | 'info' | 'warning';
    confirmText?: string;
}

export const AppAlert: React.FC<AppAlertProps> = ({
    isOpen,
    onClose,
    title,
    message,
    type = 'info',
    confirmText = 'OK'
}) => {
    if (!isOpen) return null;

    const getStyle = () => {
        switch (type) {
            case 'success': return { icon: <CheckCircle className="text-success" size={64} /> };
            case 'error': return { icon: <AlertCircle className="text-error" size={64} /> };
            case 'warning': return { icon: <AlertTriangle className="text-warning" size={64} /> };
            default: return { icon: <Info className="text-primary" size={64} /> };
        }
    };

    const styles = getStyle();

    return (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 500 }}>
            <div className="alert-modal-card animate-scale-in">
                <div className="alert-pill-container">
                    {styles.icon}
                </div>

                {title && <h1 className="alert-title-v2">{title}</h1>}
                <p className="alert-msg-v2">{message}</p>

                <button
                    onClick={onClose}
                    className="alert-btn-v2"
                >
                    {confirmText}
                </button>
            </div>
        </div>
    );
};
