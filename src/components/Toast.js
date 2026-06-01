import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
export const showToast = (msg, ms = 3500) => {
    window.dispatchEvent(new CustomEvent('show-toast', { detail: { msg, ms } }));
};
const Toast = () => {
    const [toast, setToast] = useState({ msg: '', show: false });
    useEffect(() => {
        const handler = (e) => {
            setToast({ msg: e.detail.msg, show: true });
            setTimeout(() => setToast(prev => ({ ...prev, show: false })), e.detail.ms);
        };
        window.addEventListener('show-toast', handler);
        return () => window.removeEventListener('show-toast', handler);
    }, []);
    return (_jsx("div", { id: "toast", className: toast.show ? 'show' : '', children: toast.msg }));
};
export default Toast;
