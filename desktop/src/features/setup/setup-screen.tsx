import { useSetupStore } from "../../store/setup";
import { GlobalStyles } from "../../shared/ui/global-styles";

export default function SetupScreen() {
  const {
    appStatus,
    allModels,
    selectedModel,
    recommendedModel,
    ramGb,
    gpuName,
    downloadPercent,
    downloadedMb,
    totalMb,
    speedMbps,
    selectModel,
    startDownload,
    cancelDownload,
  } = useSetupStore();

  const isDownloading = appStatus === "downloading";
  const isStartingLlm = appStatus === "starting_llm";
  const isInitializing = appStatus === "initializing";

  return (
    <>
      <GlobalStyles />
      <div
        style={{
          display: "flex",
          height: "100vh",
          background: "#09090b",
          color: "#d4d4d8",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            width: 480,
            display: "flex",
            flexDirection: "column",
            gap: 24,
            padding: 32,
            background: "#0c0d10",
            border: "1px solid #27272a",
            borderRadius: 16,
            boxShadow: "0 24px 48px rgba(0,0,0,0.6)",
          }}
        >
          {/* 헤더 */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: "#d4d4d8" }}>
                paperchat 설정
              </span>
            </div>
            <p style={{ fontSize: 13, color: "#71717a", lineHeight: 1.5 }}>
              채팅에 사용할 AI 모델을 다운로드합니다
            </p>
          </div>

          {/* 하드웨어 정보 */}
          {ramGb > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  padding: "3px 10px",
                  background: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "#a1a1aa",
                }}
              >
                RAM {ramGb}GB
              </span>
              {gpuName && (
                <span
                  title={gpuName}
                  style={{
                    padding: "3px 10px",
                    background: "#18181b",
                    border: "1px solid #27272a",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "#a1a1aa",
                    maxWidth: 220,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {gpuName}
                </span>
              )}
            </div>
          )}

          {/* 모델 선택 */}
          {!isInitializing && !isStartingLlm && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 13, fontWeight: 500, color: "#a1a1aa" }}>
                모델 선택
              </label>
              <select
                value={selectedModel?.filename ?? ""}
                onChange={(e) => {
                  const model = allModels.find((m) => m.filename === e.target.value);
                  if (model) selectModel(model);
                }}
                disabled={isDownloading}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  background: "#18181b",
                  border: "1px solid #27272a",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#d4d4d8",
                  cursor: isDownloading ? "not-allowed" : "pointer",
                  outline: "none",
                  opacity: isDownloading ? 0.5 : 1,
                }}
              >
                {allModels.map((m) => (
                  <option key={m.filename} value={m.filename}>
                    {m.name} ({m.size_gb}GB)
                    {m.filename === recommendedModel?.filename ? " ★ 권장" : ""}
                  </option>
                ))}
              </select>
              {selectedModel && (
                <p style={{ fontSize: 12, color: "#52525b" }}>
                  {selectedModel.size_gb}GB 다운로드 필요
                  {selectedModel.n_gpu_layers > 0 ? " · GPU 가속" : " · CPU 전용"}
                </p>
              )}
            </div>
          )}

          {/* 초기화 중 스피너 */}
          {(isInitializing || isStartingLlm) && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#52525b", fontSize: 13 }}>
              <span style={{ animation: "tp 1.2s ease infinite", display: "inline-block" }}>•</span>
              <span>{isStartingLlm ? "AI 모델 초기화 중..." : "시스템 확인 중..."}</span>
            </div>
          )}

          {/* 프로그레스바 */}
          {isDownloading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#71717a" }}>
                <span>
                  {downloadedMb.toFixed(0)}MB / {totalMb.toFixed(0)}MB
                </span>
                <span>{speedMbps.toFixed(1)} MB/s</span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: 6,
                  background: "#1f1f23",
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${downloadPercent}%`,
                    height: "100%",
                    background: "#a78bfa",
                    borderRadius: 999,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <p style={{ fontSize: 12, color: "#52525b", textAlign: "center" }}>
                {downloadPercent}% 완료
              </p>
            </div>
          )}

          {/* 버튼 */}
          {!isInitializing && !isStartingLlm && (
            <div>
              {isDownloading ? (
                <button
                  onClick={cancelDownload}
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    background: "transparent",
                    border: "1px solid #3f3f46",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "#71717a",
                    cursor: "pointer",
                    transition: "border-color 0.15s, color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#52525b";
                    e.currentTarget.style.color = "#a1a1aa";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#3f3f46";
                    e.currentTarget.style.color = "#71717a";
                  }}
                >
                  취소
                </button>
              ) : (
                <button
                  onClick={startDownload}
                  disabled={!selectedModel}
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    background: selectedModel ? "#a78bfa" : "#27272a",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    color: selectedModel ? "#09090b" : "#52525b",
                    cursor: selectedModel ? "pointer" : "not-allowed",
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (selectedModel) e.currentTarget.style.opacity = "0.88";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = "1";
                  }}
                >
                  {selectedModel
                    ? `${selectedModel.name} 다운로드 (${selectedModel.size_gb}GB)`
                    : "모델을 선택하세요"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
