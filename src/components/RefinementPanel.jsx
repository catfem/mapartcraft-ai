import React from "react";

export default function RefinementPanel({
  visible,
  loading,
  error,
  feedback,
  suggestions,
  round,
  maxRounds,
  onRefine,
  onAccept,
  onReset,
  onClose,
}) {
  if (!visible) return null;

  return (
    <div
      className="section"
      style={{
        border: "1px solid #333",
        background: "rgba(0,0,0,0.08)",
        maxWidth: 520,
      }}
    >
      <h2 style={{ marginTop: 0 }}>AI Refinement</h2>
      <p style={{ marginTop: 0 }}>
        Round {round}/{maxRounds}
      </p>

      {loading ? <p style={{ margin: 0 }}>Analyzing generated schematic…</p> : null}

      {error ? (
        <p style={{ color: "#a00" }}>
          <b>AI unavailable:</b> {error}
        </p>
      ) : null}

      {!loading && !error && feedback ? (
        <div>
          <b>Quality assessment</b>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.75em" }}>{JSON.stringify(feedback, null, 2)}</pre>
        </div>
      ) : null}

      {!loading && !error && suggestions ? (
        <div>
          <b>Refinement suggestions</b>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.75em" }}>{JSON.stringify(suggestions, null, 2)}</pre>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "0.5em", flexWrap: "wrap", marginTop: "0.5em" }}>
        <button type="button" onClick={onRefine} disabled={round >= maxRounds}>
          Refine & regenerate
        </button>
        <button type="button" onClick={onAccept}>
          Accept
        </button>
        <button type="button" onClick={onReset}>
          Reset
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
