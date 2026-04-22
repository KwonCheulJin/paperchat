export function GlobalStyles() {
  return (
    <style>{`
      * { box-sizing: border-box; }
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
      @keyframes indeterminate {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(400%); }
      }
      @keyframes bar {
        0%, 100% { opacity: 0.2; transform: scaleY(0.4); }
        50%       { opacity: 1;   transform: scaleY(1);   }
      }
      @keyframes pulse {
        0%, 100% { opacity: 0.3; }
        50%       { opacity: 0.7; }
      }
      :focus-visible {
        outline: 2px solid var(--ring);
        outline-offset: 2px;
        border-radius: 4px;
      }
      textarea:focus-visible,
      input:focus-visible,
      select:focus-visible {
        outline: none;
        outline-offset: 0;
      }
      ::-webkit-scrollbar { width: 4px; height: 4px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
      ::-webkit-scrollbar-thumb:hover { background: var(--input); }
    `}</style>
  );
}
