import React from "react";

export default function PreEditPanel({
  visible,
  loading,
  error,
  originalAnalysis,
  previewAnalysis,
  suggestions,
  beforePreviewDataUrl,
  afterPreviewDataUrl,
  ditherOptions,
  whereSupportBlocksOptions,
  values,
  onChange,
  onAcceptAll,
  onRejectAll,
  onContinue,
}) {
  if (!visible) return null;

  return (
    <div
      className="section"
      style={{
        border: "1px solid #333",
        background: "rgba(0,0,0,0.1)",
        maxWidth: 520,
      }}
    >
      <h2 style={{ marginTop: 0 }}>AI Pre-Edit (default)</h2>

      {loading ? (
        <div>
          <p style={{ margin: 0 }}>
            <b>Analyzing…</b>
          </p>
          <small>This may take a few seconds depending on API rate limits.</small>
        </div>
      ) : null}

      {error ? (
        <div style={{ marginTop: "0.5em" }}>
          <p style={{ color: "#a00", margin: 0 }}>
            <b>AI unavailable:</b> {error}
          </p>
          <button type="button" onClick={onContinue} style={{ marginTop: "0.5em" }}>
            Continue manually
          </button>
        </div>
      ) : null}

      {!loading && !error && suggestions ? (
        <div style={{ marginTop: "0.5em" }}>
          <div style={{ display: "flex", gap: "0.5em", flexWrap: "wrap" }}>
            {beforePreviewDataUrl ? (
              <div style={{ flex: "1 1 200px" }}>
                <b>Before</b>
                <img alt="before" src={beforePreviewDataUrl} style={{ width: "100%", border: "1px solid #333" }} />
              </div>
            ) : null}
            {afterPreviewDataUrl ? (
              <div style={{ flex: "1 1 200px" }}>
                <b>After</b>
                <img alt="after" src={afterPreviewDataUrl} style={{ width: "100%", border: "1px solid #333" }} />
              </div>
            ) : null}
          </div>

          <details style={{ marginTop: "0.5em" }}>
            <summary>AI analysis</summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.75em" }}>{JSON.stringify({ originalAnalysis, previewAnalysis }, null, 2)}</pre>
          </details>

          <div style={{ marginTop: "0.5em" }}>
            <b>Suggested adjustments</b>
            <ul style={{ marginTop: "0.25em" }}>
              <li>
                <b>Dithering:</b> {suggestions.dithering.method}
                {suggestions.dithering.reason ? ` — ${suggestions.dithering.reason}` : ""}
              </li>
              <li>
                <b>Scale factor:</b> {suggestions.scaleFactor.value}
                {suggestions.scaleFactor.reason ? ` — ${suggestions.scaleFactor.reason}` : ""}
              </li>
              <li>
                <b>Preprocessing:</b> {suggestions.preprocessing.enabled ? "enabled" : "disabled"}
                {suggestions.preprocessing.reason ? ` — ${suggestions.preprocessing.reason}` : ""}
              </li>
              <li>
                <b>Transparency:</b> {suggestions.transparency.enabled ? `enabled (tolerance ${suggestions.transparency.tolerance})` : "disabled"}
                {suggestions.transparency.reason ? ` — ${suggestions.transparency.reason}` : ""}
              </li>
              <li>
                <b>Support blocks:</b> {suggestions.supportBlocks.where}
                {suggestions.supportBlocks.supportBlock ? ` (${suggestions.supportBlocks.supportBlock})` : ""}
                {suggestions.supportBlocks.reason ? ` — ${suggestions.supportBlocks.reason}` : ""}
              </li>
            </ul>
          </div>

          <div style={{ marginTop: "0.5em" }}>
            <b>Adjust (live preview)</b>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", rowGap: "0.35em", marginTop: "0.25em" }}>
              <label>
                Dithering: {" "}
                <select value={values.dithering} onChange={(e) => onChange({ dithering: parseInt(e.target.value) })}>
                  {ditherOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Scale factor: {values.scaleFactor.toFixed(2)}
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.05"
                  value={values.scaleFactor}
                  onChange={(e) => onChange({ scaleFactor: parseFloat(e.target.value) })}
                  style={{ width: "100%" }}
                />
              </label>

              <label>
                Preprocessing enabled: {" "}
                <input type="checkbox" checked={values.preprocessingEnabled} onChange={() => onChange({ preprocessingEnabled: !values.preprocessingEnabled })} />
              </label>

              {values.preprocessingEnabled ? (
                <div style={{ paddingLeft: "0.5em", borderLeft: "2px solid #333" }}>
                  <label>
                    Blur (px): {values.blurPx}
                    <input
                      type="range"
                      min="0"
                      max="6"
                      step="1"
                      value={values.blurPx}
                      onChange={(e) => onChange({ blurPx: parseInt(e.target.value) })}
                      style={{ width: "100%" }}
                    />
                  </label>
                  <br />
                  <label>
                    Sharpen: {values.sharpen}
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={values.sharpen}
                      onChange={(e) => onChange({ sharpen: parseInt(e.target.value) })}
                      style={{ width: "100%" }}
                    />
                  </label>
                  <br />
                  <label>
                    Brightness: {values.brightness}
                    <input
                      type="range"
                      min="0"
                      max="200"
                      step="1"
                      value={values.brightness}
                      onChange={(e) => onChange({ brightness: parseInt(e.target.value) })}
                      style={{ width: "100%" }}
                    />
                  </label>
                  <br />
                  <label>
                    Contrast: {values.contrast}
                    <input
                      type="range"
                      min="0"
                      max="200"
                      step="1"
                      value={values.contrast}
                      onChange={(e) => onChange({ contrast: parseInt(e.target.value) })}
                      style={{ width: "100%" }}
                    />
                  </label>
                  <br />
                  <label>
                    Saturation: {values.saturation}
                    <input
                      type="range"
                      min="0"
                      max="200"
                      step="1"
                      value={values.saturation}
                      onChange={(e) => onChange({ saturation: parseInt(e.target.value) })}
                      style={{ width: "100%" }}
                    />
                  </label>
                </div>
              ) : null}

              <label>
                Transparency enabled: {" "}
                <input
                  type="checkbox"
                  checked={values.transparencyEnabled}
                  onChange={() => onChange({ transparencyEnabled: !values.transparencyEnabled })}
                />
              </label>

              {values.transparencyEnabled ? (
                <label>
                  Transparency tolerance: {values.transparencyTolerance}
                  <input
                    type="range"
                    min="0"
                    max="256"
                    step="1"
                    value={values.transparencyTolerance}
                    onChange={(e) => onChange({ transparencyTolerance: parseInt(e.target.value) })}
                    style={{ width: "100%" }}
                  />
                </label>
              ) : null}

              <label>
                Support blocks: {" "}
                <select value={values.whereSupportBlocks} onChange={(e) => onChange({ whereSupportBlocks: parseInt(e.target.value) })}>
                  {whereSupportBlocksOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Support block ID: {" "}
                <input value={values.supportBlock} onChange={(e) => onChange({ supportBlock: e.target.value })} style={{ width: "100%" }} />
              </label>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5em", marginTop: "0.75em", flexWrap: "wrap" }}>
            <button type="button" onClick={onAcceptAll}>
              Accept all
            </button>
            <button type="button" onClick={onRejectAll}>
              Reject all
            </button>
            <button type="button" onClick={onContinue}>
              Continue
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
