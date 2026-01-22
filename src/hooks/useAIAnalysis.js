import { useCallback, useEffect, useRef, useState } from "react";

import { analyzeOriginalImage, analyzeSchematicPreview } from "../lib/ai/analysisEngine";
import { suggestParameters } from "../lib/ai/parameterSuggester";

export default function useAIAnalysis({ enabled, originalImageDataUrl, previewImageDataUrl, currentParams, mode, iteration = 0, autoRun = false }) {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [originalAnalysis, setOriginalAnalysis] = useState(null);
  const [previewAnalysis, setPreviewAnalysis] = useState(null);
  const [suggestions, setSuggestions] = useState(null);

  const runIdRef = useRef(0);

  const run = useCallback(async () => {
    if (!enabled) return;
    if (!originalImageDataUrl || !previewImageDataUrl) return;

    const runId = ++runIdRef.current;
    setStatus("analyzing");
    setError(null);

    try {
      const oa = await analyzeOriginalImage({ imageDataUrl: originalImageDataUrl });
      if (runIdRef.current !== runId) return;
      setOriginalAnalysis(oa);

      const pa = await analyzeSchematicPreview({ originalImageDataUrl, previewImageDataUrl });
      if (runIdRef.current !== runId) return;
      setPreviewAnalysis(pa);

      const s = await suggestParameters({ originalAnalysis: oa, previewAnalysis: pa, currentParams, mode, iteration });
      if (runIdRef.current !== runId) return;
      setSuggestions(s);

      setStatus("ready");
    } catch (e) {
      if (runIdRef.current !== runId) return;
      setError(e?.message || String(e));
      setStatus("error");
    }
  }, [enabled, originalImageDataUrl, previewImageDataUrl, currentParams, mode, iteration]);

  useEffect(() => {
    if (autoRun) {
      run();
    }
  }, [autoRun, run]);

  return {
    status,
    error,
    originalAnalysis,
    previewAnalysis,
    suggestions,
    run,
    reset: () => {
      runIdRef.current += 1;
      setStatus("idle");
      setError(null);
      setOriginalAnalysis(null);
      setPreviewAnalysis(null);
      setSuggestions(null);
    },
  };
}
