import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const Thinking = () => (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("div", { className: "w-2 h-2 rounded-full bg-gray-400 animate-pulse" }), _jsx("div", { className: "w-2 h-2 rounded-full bg-gray-400 animate-pulse delay-75" }), _jsx("div", { className: "w-2 h-2 rounded-full bg-gray-400 animate-pulse delay-150" })] }));
const Sources = ({ sources, elapsed, fromAPI }) => {
    if (!sources || sources.length === 0)
        return _jsxs("div", { className: "text-xs text-gray-500 mt-2", children: ["\u23F1 ", elapsed, "s", fromAPI ? ' · via API' : ''] });
    return (_jsxs("div", { className: "mt-2 text-xs text-gray-700", children: [_jsxs("div", { className: "flex items-center gap-2 text-blue-600 font-mono", children: ["\uD83D\uDCCE ", sources.map((s, i) => (_jsxs("span", { className: "bg-gray-100 px-2 py-1 rounded text-xs border", children: [s.documentName, " p.", s.pageNumber] }, i)))] }), _jsxs("div", { className: "text-xs text-gray-500 mt-1", children: ["\u23F1 ", elapsed, "s", fromAPI ? ' · via API' : ''] })] }));
};
const ChatBubble = ({ msg, side = 'bot', sources, elapsed, fromAPI }) => {
    const isUser = side === 'user';
    return (_jsxs("div", { className: `msg ${side}`, children: [_jsx("div", { className: `msg-avatar ${side}`, children: isUser ? 'OP' : 'B' }), _jsxs("div", { children: [_jsxs("div", { className: "msg-bubble", children: [_jsx("div", { dangerouslySetInnerHTML: { __html: msg.content.replace(/\n/g, '<br/>') } }), sources && _jsx(Sources, { sources: sources, elapsed: elapsed, fromAPI: fromAPI })] }), _jsx("div", { className: "msg-time", children: new Date(msg.timestamp || Date.now()).toLocaleTimeString() })] })] }));
};
export default ChatBubble;
