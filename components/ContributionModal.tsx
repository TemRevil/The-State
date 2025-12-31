import React, { useState, useRef, useEffect } from 'react';
import { X, ChevronDown, Check, Trash2, Plus } from 'lucide-react';
import { doc, getDoc, setDoc, updateDoc } from '../utils/firebaseMonitored';
import { db } from '../firebaseConfig'; // Removed auth as it's not directly used here

interface QuizFormData {
    question: string;
    choices: string[];
    correct: string;
    subject: string;
    explanation: string;
}

interface ContributionModalProps {
    isOpen: boolean;
    onClose: () => void;
    userName: string;
    lectureTypes: string[];
    showAlert: (message: string, type: 'success' | 'error' | 'warning' | 'info', title?: string) => void;
    initialData?: QuizFormData; // Optional prop for pre-filling form for editing
    onSave?: (data: QuizFormData) => Promise<void>; // Optional prop for saving edited data
}

export const ContributionModal: React.FC<ContributionModalProps> = ({
    isOpen,
    onClose,
    userName,
    lectureTypes,
    showAlert,
    initialData,
    onSave
}) => {
    const [contributeData, setContributeData] = useState<QuizFormData>(initialData || {
        question: '',
        choices: ['', ''],
        correct: '1',
        subject: lectureTypes.length > 0 ? lectureTypes[0] : 'مراسلات ومصطلحات اجنبية', // Default to first available subject
        explanation: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);
    const subjectDropdownRef = useRef<HTMLDivElement>(null);

    // Update state if initialData changes (e.g., when editing a different quiz)
    useEffect(() => {
        if (initialData) {
            setContributeData(initialData);
        } else {
            setContributeData({
                question: '',
                choices: ['', ''],
                correct: '1',
                subject: lectureTypes.length > 0 ? lectureTypes[0] : 'مراسلات ومصطلحات اجنبية',
                explanation: ''
            });
        }
    }, [initialData, lectureTypes]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (subjectDropdownRef.current && !subjectDropdownRef.current.contains(event.target as Node)) {
                setShowSubjectDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSubmit = async () => {
        if (!contributeData.question || contributeData.choices.some(c => !c.trim())) {
            return showAlert("Please fill in all choice fields and the question text.", "warning", "Incomplete Form");
        }
        if (!contributeData.correct) {
            return showAlert("Please select a correct answer.", "warning", "Incomplete Form");
        }

        setIsSubmitting(true);
        try {
            if (onSave) {
                // If onSave prop is provided, it's for editing
                await onSave(contributeData);
                showAlert("Changes saved successfully.", "success", "Update Successful");
            } else {
                // Otherwise, it's a new contribution
                const pendingRef = doc(db, "Dashboard", "pending-quizi");
                const snap = await getDoc(pendingRef);
                let nextId = "1";

                if (snap.exists()) {
                    const data = snap.data() || {};
                    const keys = Object.keys(data).map(k => parseInt(k)).filter(k => !isNaN(k));
                    nextId = (keys.length > 0 ? Math.max(...keys) + 1 : 1).toString();
                }

                const choicesMap: { [key: string]: string } = {};
                contributeData.choices.forEach((choice, index) => {
                    choicesMap[(index + 1).toString()] = choice;
                });

                const payload = {
                    [nextId]: {
                        Number: localStorage.getItem("Number") || "Unknown",
                        Quiz: {
                            Question: contributeData.question,
                            Choices: choicesMap,
                            Subject: contributeData.subject,
                            Correct: contributeData.correct,
                            Explanation: contributeData.explanation || ""
                        },
                        ContributorName: userName || "Anonymous"
                    }
                };

                if (!snap.exists()) await setDoc(pendingRef, payload);
                else await updateDoc(pendingRef, payload);

                showAlert("Thank you! Your question has been submitted for review by the admin stack.", "success", "Submission Received");
            }
            onClose();
            // Reset form for next submission if not editing
            if (!onSave) {
                setContributeData({
                    question: '',
                    choices: ['', ''],
                    correct: '1',
                    subject: lectureTypes.length > 0 ? lectureTypes[0] : 'مراسلات ومصطلحات اجنبية',
                    explanation: ''
                });
            }
        } catch (e: any) {
            console.error(e);
            showAlert(`Action failed: ${e.message}`, "error", "Operation Error");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay animate-fade-in" style={{ zIndex: 420 }}>
            <div className="modal-content modal-md">
                <header className="contribution-modal-header flex justify-between items-center p-6 border-b">
                    <h3 className="text-xl font-bold">{onSave ? 'Edit Pending Question' : 'Contribute Question'}</h3>
                    <button onClick={onClose} className="btn-icon">
                        <X size={20} />
                    </button>
                </header>
                <div className="contribution-modal-body p-6 custom-scrollbar">
                    <div className="space-y-6">
                        <div className="flex flex-col gap-2 relative z-50">
                            <label className="text-xs font-bold text-muted uppercase tracking-wider">Target Subject</label>
                            <div ref={subjectDropdownRef} className="relative">
                                <button
                                    onClick={() => setShowSubjectDropdown(!showSubjectDropdown)}
                                    className="input flex items-center justify-between text-right gap-2"
                                >
                                    <span className="font-arabic overflow-x-auto whitespace-nowrap flex-1 text-left custom-scrollbar" style={{ maxWidth: 'calc(100% - 24px)' }}>{contributeData.subject || 'اختر المادة...'}</span>
                                    <ChevronDown size={16} className={`transition-transform flex-shrink-0 ${showSubjectDropdown ? 'rotate-180' : ''}`} />
                                </button>
                                {showSubjectDropdown && (
                                    <div className="contribution-dropdown-menu custom-scrollbar">
                                        {lectureTypes.map((t) => (
                                            <button
                                                key={t}
                                                onClick={() => {
                                                    setContributeData({ ...contributeData, subject: t });
                                                    setShowSubjectDropdown(false);
                                                }}
                                                className={`contribution-dropdown-item font-arabic ${contributeData.subject === t ? 'active' : ''}`}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-muted uppercase tracking-wider">Question Text (Arabic)</label>
                            <input
                                className="input py-4 font-arabic text-right"
                                value={contributeData.question}
                                onChange={e => setContributeData({ ...contributeData, question: e.target.value })}
                                placeholder="اكتب السؤال هنا..."
                                dir="rtl"
                            />
                        </div>
                        <div className="flex flex-col gap-3">
                            <label className="text-xs font-bold text-muted uppercase tracking-wider">Answer Choices</label>
                            {contributeData.choices.map((choice, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                    <input
                                        className="input font-arabic text-right flex-grow"
                                        value={choice}
                                        onChange={e => {
                                            const newChoices = [...contributeData.choices];
                                            newChoices[i] = e.target.value;
                                            setContributeData({ ...contributeData, choices: newChoices });
                                        }}
                                        placeholder={`الاختيار ${i + 1}`}
                                        dir="rtl"
                                    />
                                    <button
                                        onClick={() => setContributeData({ ...contributeData, correct: (i + 1).toString() })}
                                        className={`w-12 h-12 rounded-lg border flex items-center justify-center transition-all ${contributeData.correct === (i + 1).toString() ? 'bg-success/20 border-success text-success' : 'bg-white/5 border-white/10 text-muted'}`}
                                        title="Mark as correct answer"
                                    >
                                        <Check size={20} />
                                    </button>
                                    {contributeData.choices.length > 2 && (
                                        <button
                                            onClick={() => {
                                                const newChoices = contributeData.choices.filter((_, idx) => idx !== i);
                                                // Adjust correct answer if the deleted choice was the correct one
                                                let newCorrect = contributeData.correct;
                                                if (parseInt(contributeData.correct) === (i + 1)) {
                                                    newCorrect = '1'; // Default to first if removed
                                                } else if (parseInt(contributeData.correct) > (i + 1)) {
                                                    newCorrect = (parseInt(contributeData.correct) - 1).toString();
                                                }
                                                setContributeData({ ...contributeData, choices: newChoices, correct: newCorrect });
                                            }}
                                            className="w-12 h-12 rounded-lg border border-error/20 bg-error/5 text-error flex items-center justify-center hover:bg-error/10 transition-all"
                                            title="Remove choice"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                            ))}
                            {contributeData.choices.length < 4 && (
                                <button
                                    onClick={() => setContributeData({ ...contributeData, choices: [...contributeData.choices, ''] })}
                                    className="btn btn-secondary w-full py-3"
                                >
                                    <Plus size={18} /> Add Choice
                                </button>
                            )}
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-muted uppercase tracking-wider">Explanation (Optional)</label>
                            <textarea
                                className="input py-3 font-arabic text-right h-24 resize-none"
                                value={contributeData.explanation}
                                onChange={e => setContributeData({ ...contributeData, explanation: e.target.value })}
                                placeholder="اشرح سبب الإجابة الصحيحة..."
                                dir="rtl"
                            />
                        </div>
                    </div>
                </div>
                <footer className="p-6 border-t flex gap-3">
                    <button onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="btn btn-primary flex-1"
                    >
                        {isSubmitting ? 'Saving...' : (onSave ? 'Save Changes' : 'Submit Contribution')}
                    </button>
                </footer>
            </div>
        </div>
    );
};