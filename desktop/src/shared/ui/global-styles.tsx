export function GlobalStyles() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      @keyframes tp {
        0%, 100% { transform: translateY(0); opacity: 0.4; }
        50% { transform: translateY(-4px); opacity: 1; }
      }
      @keyframes cb {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }
      @keyframes ms {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes fi {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      @keyframes float {
        0%, 100% { transform: translateY(0); }
        50%       { transform: translateY(-6px); }
      }
      @keyframes indeterminate {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(400%); }
      }
      ::-webkit-scrollbar { width: 4px; height: 4px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #27272a; border-radius: 2px; }
      ::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
    `}</style>
  );
}
