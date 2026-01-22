import React, { Component } from "react";

import CookieManager from "../../cookieManager";
import BlockSelection from "./blockSelection";
import GreenButtons from "./greenButtons";
import MapPreview from "./mapPreview";
import MapSettings from "./mapSettings";
import Materials from "./materials";

import PreEditPanel from "../PreEditPanel";
import RefinementPanel from "../RefinementPanel";

import { analyzeOriginalImage, analyzeSchematicPreview } from "../../lib/ai/analysisEngine";
import { suggestParameters } from "../../lib/ai/parameterSuggester";
import { hasGeminiApiKey } from "../../lib/ai/geminiClient";
import coloursJSON from "./json/coloursJSON.json";
import ViewOnline2D from "./viewOnline2D/viewOnline2D";
import ViewOnline3D from "./viewOnline3D/viewOnline3D";

import BackgroundColourModes from "./json/backgroundColourModes.json";
import CropModes from "./json/cropModes.json";
import DefaultPresets from "./json/defaultPresets.json";
import DitherMethods from "./json/ditherMethods.json";
import MapModes from "./json/mapModes.json";
import SupportedVersions from "./json/supportedVersions.json";
import WhereSupportBlocksModes from "./json/whereSupportBlocksModes.json";

import IMG_Upload from "../../images/upload.png";

import "./mapartController.css";

function imageElementToDataUrl(img, maxDimension = 512) {
  try {
    const w = img.width;
    const h = img.height;
    const scale = Math.min(1, maxDimension / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch (e) {
    return null;
  }
}

function ditherMethodStringToUniqueId(method, DitherMethods) {
  switch (method) {
    case "none":
      return DitherMethods.None.uniqueId;
    case "ordered":
      return DitherMethods.Ordered33?.uniqueId ?? DitherMethods.None.uniqueId;
    case "bayer":
      return DitherMethods.Bayer44?.uniqueId ?? DitherMethods.Bayer22?.uniqueId ?? DitherMethods.None.uniqueId;
    case "floyd-steinberg":
    default:
      return DitherMethods.FloydSteinberg.uniqueId;
  }
}

class MapartController extends Component {
  state = {
    coloursJSON: null,
    selectedBlocks: {},
    optionValue_version: Object.values(SupportedVersions)[Object.keys(SupportedVersions).length - 1], // default to the latest version supported
    optionValue_modeNBTOrMapdat: MapModes.SCHEMATIC_NBT.uniqueId,
    optionValue_mapSize_x: 1,
    optionValue_mapSize_y: 1,
    optionValue_cropImage: CropModes.CENTER.uniqueId,
    optionValue_cropImage_zoom: 10, // this gets scaled down by a factor of 10
    optionValue_cropImage_percent_x: 50,
    optionValue_cropImage_percent_y: 50,
    optionValue_scaleFactor: 1,
    optionValue_showGridOverlay: false,
    optionValue_staircasing: MapModes.SCHEMATIC_NBT.staircaseModes.VALLEY.uniqueId,
    optionValue_whereSupportBlocks: WhereSupportBlocksModes.ALL_OPTIMIZED.uniqueId,
    optionValue_supportBlock: "cobblestone",
    optionValue_transparency: false,
    optionValue_transparencyTolerance: 128,
    optionValue_mapdatFilenameUseId: true,
    optionValue_mapdatFilenameIdStart: 0,
    optionValue_betterColour: true,
    optionValue_dithering: DitherMethods.FloydSteinberg.uniqueId,
    optionValue_preprocessingEnabled: false,
    preProcessingValue_brightness: 100,
    preProcessingValue_contrast: 100,
    preProcessingValue_saturation: 100,
    preProcessingValue_backgroundColourSelect: BackgroundColourModes.OFF.uniqueId,
    preProcessingValue_backgroundColour: "#151515",
    preProcessingValue_blur: 0,
    preProcessingValue_sharpen: 0,
    optionValue_extras_moreStaircasingOptions: false,
    uploadedImage: null,
    uploadedImage_baseFilename: null,
    presets: [],
    selectedPresetName: "None",
    currentMaterialsData: {
      pixelsData: null,
      maps: [[]], // entries are dictionaries with keys "materials", "supportBlockCount"
      currentSelectedBlocks: {}, // we keep this soley for materials.js
    },
    mapPreviewWorker_inProgress: false,
    viewOnline_NBT: null,
    viewOnline_3D: false,

    aiEnabled: true,
    aiStatus: "idle",
    aiError: null,
    aiOriginalImageDataUrl: null,
    aiPreviewDataUrl_current: null,
    aiPreviewDataUrl_before: null,
    aiPreviewDataUrl_after: null,
    aiOriginalAnalysis: null,
    aiPreviewAnalysis: null,
    aiSuggestions: null,
    aiPreEditActive: true,
    aiBaselineSettings: null,
    aiInitialSettings: null,
    aiAnalysisRunId: 0,

    aiRefinementOpen: false,
    aiRefinementLoading: false,
    aiRefinementError: null,
    aiRefinementFeedback: null,
    aiRefinementSuggestions: null,
    aiRefinementRound: 0,
    aiMaxRefinementRounds: 5,
  };

  constructor(props) {
    super(props);

    if (!hasGeminiApiKey()) {
      this.state.aiEnabled = false;
      this.state.aiStatus = "disabled";
      this.state.aiError = "Missing Gemini API key. Set REACT_APP_GEMINI_API_KEY (CRA) or VITE_GEMINI_API_KEY.";
      this.state.aiPreEditActive = false;
    }

    // update default presets to latest version; done via checking for localeString
    CookieManager.init();
    let cookiesPresets_loaded = JSON.parse(CookieManager.touchCookie("mapartcraft_presets", JSON.stringify(DefaultPresets)));
    let cookiesPresets_updated = [];
    for (const cookiesPreset_loaded of cookiesPresets_loaded) {
      let cookiesPreset_updated = undefined;
      if ("localeKey" in cookiesPreset_loaded) {
        cookiesPreset_updated = DefaultPresets.find((defaultPreset) => defaultPreset.localeKey === cookiesPreset_loaded.localeKey);
      }
      if (cookiesPreset_updated === undefined) {
        cookiesPreset_updated = cookiesPreset_loaded;
      }
      cookiesPresets_updated.push(cookiesPreset_updated);
    }
    CookieManager.setCookie("mapartcraft_presets", JSON.stringify(cookiesPresets_updated));
    this.state.presets = cookiesPresets_updated;

    let cookie_customBlocks = JSON.parse(CookieManager.touchCookie("mapartcraft_customBlocks", JSON.stringify([])));
    this.state.coloursJSON = this.getMergedColoursJSON(cookie_customBlocks);

    for (const colourSetId of Object.keys(this.state.coloursJSON)) {
      this.state.selectedBlocks[colourSetId] = "-1";
    }

    const cookieMCVersion = CookieManager.touchCookie("mapartcraft_mcversion", Object.values(SupportedVersions)[Object.keys(SupportedVersions).length - 1].MCVersion);
    const supportedVersionFound = Object.values(SupportedVersions).find((supportedVersion) => supportedVersion.MCVersion === cookieMCVersion);
    if (supportedVersionFound !== undefined) {
      this.state.optionValue_version = supportedVersionFound;
    }

    const URLParams = new URL(window.location).searchParams;
    if (URLParams.has("preset")) {
      const decodedPresetBlocks = this.URLToPreset(URLParams.get("preset"));
      if (decodedPresetBlocks !== null) {
        this.state.selectedBlocks = decodedPresetBlocks;
      }
    }
  }

  getMergedColoursJSON(customBlocks) {
    // this is how we currently merge custom blocks into coloursJSON at runtime / when custom blocks update. this may change if presets support for custom blocks is added
    let coloursJSON_custom = JSON.parse(JSON.stringify(coloursJSON)); // hmmm
    for (const [colourSetId, customBlock] of customBlocks) {
      coloursJSON_custom[colourSetId].blocks[Object.keys(coloursJSON_custom[colourSetId].blocks).length.toString()] = customBlock;
    }
    return coloursJSON_custom;
  }

  eventListener_dragover = function (e) {
    // this has to be here for drop event to work
    e.preventDefault();
    e.stopPropagation();
  };

  eventListener_drop = function (e) {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length) {
      const file = files[0];
      const imgUrl = URL.createObjectURL(file);
      this.loadUploadedImageFromURL(imgUrl, "mapart");
    }
  }.bind(this);

  eventListener_paste = function (e) {
    e.preventDefault();
    e.stopPropagation();
    const files = e.clipboardData.files;
    if (files.length) {
      const file = files[0];
      const imgUrl = URL.createObjectURL(file);
      this.loadUploadedImageFromURL(imgUrl, "mapart");
    }
  }.bind(this);

  componentDidMount() {
    this.loadUploadedImageFromURL(IMG_Upload, "mapart");

    document.addEventListener("dragover", this.eventListener_dragover);
    document.addEventListener("drop", this.eventListener_drop);

    document.addEventListener("paste", this.eventListener_paste);
  }

  componentWillUnmount() {
    document.removeEventListener("dragover", this.eventListener_dragover);
    document.removeEventListener("drop", this.eventListener_drop);
    document.removeEventListener("paste", this.eventListener_paste);
  }

  componentDidUpdate(_prevProps, prevState) {
    if (this.state.uploadedImage !== prevState.uploadedImage) {
      this.onNewImageForAI();
    }
  }

  getAIParamsSnapshot = () => {
    const {
      optionValue_dithering,
      optionValue_scaleFactor,
      optionValue_preprocessingEnabled,
      preProcessingValue_blur,
      preProcessingValue_sharpen,
      preProcessingValue_brightness,
      preProcessingValue_contrast,
      preProcessingValue_saturation,
      optionValue_transparency,
      optionValue_transparencyTolerance,
      optionValue_whereSupportBlocks,
      optionValue_supportBlock,
    } = this.state;

    return {
      dithering: optionValue_dithering,
      scaleFactor: optionValue_scaleFactor,
      preprocessingEnabled: optionValue_preprocessingEnabled,
      blurPx: preProcessingValue_blur,
      sharpen: preProcessingValue_sharpen,
      brightness: preProcessingValue_brightness,
      contrast: preProcessingValue_contrast,
      saturation: preProcessingValue_saturation,
      transparencyEnabled: optionValue_transparency,
      transparencyTolerance: optionValue_transparencyTolerance,
      whereSupportBlocks: optionValue_whereSupportBlocks,
      supportBlock: optionValue_supportBlock,
    };
  };

  restoreFromSnapshot = (snapshot) => {
    if (!snapshot) return;
    this.setState({
      optionValue_dithering: snapshot.dithering,
      optionValue_scaleFactor: snapshot.scaleFactor,
      optionValue_preprocessingEnabled: snapshot.preprocessingEnabled,
      preProcessingValue_blur: snapshot.blurPx,
      preProcessingValue_sharpen: snapshot.sharpen,
      preProcessingValue_brightness: snapshot.brightness,
      preProcessingValue_contrast: snapshot.contrast,
      preProcessingValue_saturation: snapshot.saturation,
      optionValue_transparency: snapshot.transparencyEnabled,
      optionValue_transparencyTolerance: snapshot.transparencyTolerance,
      optionValue_whereSupportBlocks: snapshot.whereSupportBlocks,
      optionValue_supportBlock: snapshot.supportBlock,
    });
  };

  applyAISuggestionsToSettings = (suggestions) => {
    if (!suggestions) return;

    const patch = {
      optionValue_dithering: ditherMethodStringToUniqueId(suggestions.dithering.method, DitherMethods),
      optionValue_scaleFactor: suggestions.scaleFactor.value,
      optionValue_preprocessingEnabled: suggestions.preprocessing.enabled,
      preProcessingValue_blur: suggestions.preprocessing.blurPx,
      preProcessingValue_sharpen: suggestions.preprocessing.sharpen,
      preProcessingValue_brightness: suggestions.preprocessing.brightness,
      preProcessingValue_contrast: suggestions.preprocessing.contrast,
      preProcessingValue_saturation: suggestions.preprocessing.saturation,
      optionValue_transparency: suggestions.transparency.enabled,
      optionValue_transparencyTolerance: suggestions.transparency.tolerance,
      optionValue_supportBlock: suggestions.supportBlocks.supportBlock,
      optionValue_whereSupportBlocks: {
        none: WhereSupportBlocksModes.NONE.uniqueId,
        important: WhereSupportBlocksModes.IMPORTANT.uniqueId,
        all_optimized: WhereSupportBlocksModes.ALL_OPTIMIZED.uniqueId,
        all_double_optimized: WhereSupportBlocksModes.ALL_DOUBLE_OPTIMIZED.uniqueId,
      }[suggestions.supportBlocks.where] ?? WhereSupportBlocksModes.ALL_OPTIMIZED.uniqueId,
    };

    this.setState(patch);
  };

  onNewImageForAI = () => {
    const { uploadedImage, aiEnabled } = this.state;
    if (!uploadedImage) return;

    const originalDataUrl = imageElementToDataUrl(uploadedImage, 512);
    const initialSettings = this.getAIParamsSnapshot();

    if (aiEnabled && !originalDataUrl) {
      this.setState((currentState) => {
        return {
          aiStatus: "error",
          aiError: "Unable to read the uploaded image for AI analysis (canvas may be tainted).",
          aiOriginalImageDataUrl: null,
          aiPreviewDataUrl_current: null,
          aiPreviewDataUrl_before: null,
          aiPreviewDataUrl_after: null,
          aiOriginalAnalysis: null,
          aiPreviewAnalysis: null,
          aiSuggestions: null,
          aiPreEditActive: true,
          aiBaselineSettings: initialSettings,
          aiInitialSettings: initialSettings,
          aiAnalysisRunId: currentState.aiAnalysisRunId + 1,
          aiRefinementOpen: false,
          aiRefinementLoading: false,
          aiRefinementError: null,
          aiRefinementFeedback: null,
          aiRefinementSuggestions: null,
          aiRefinementRound: 0,
        };
      });
      return;
    }

    this.setState((currentState) => {
      return {
        aiStatus: aiEnabled ? "waiting-preview" : "disabled",
        aiError: aiEnabled ? null : currentState.aiError,
        aiOriginalImageDataUrl: originalDataUrl,
        aiPreviewDataUrl_current: null,
        aiPreviewDataUrl_before: null,
        aiPreviewDataUrl_after: null,
        aiOriginalAnalysis: null,
        aiPreviewAnalysis: null,
        aiSuggestions: null,
        aiPreEditActive: aiEnabled,
        aiBaselineSettings: initialSettings,
        aiInitialSettings: initialSettings,
        aiAnalysisRunId: currentState.aiAnalysisRunId + 1,
        aiRefinementOpen: false,
        aiRefinementLoading: false,
        aiRefinementError: null,
        aiRefinementFeedback: null,
        aiRefinementSuggestions: null,
        aiRefinementRound: 0,
      };
    });
  };

  handlePreviewDataUrl = (previewDataUrl) => {
    if (!previewDataUrl) return;

    this.setState(
      (currentState) => {
        const updates = {
          aiPreviewDataUrl_current: previewDataUrl,
        };

        if (currentState.aiEnabled && currentState.aiStatus === "waiting-preview" && !currentState.aiPreviewDataUrl_before) {
          updates.aiPreviewDataUrl_before = previewDataUrl;
        }

        if (currentState.aiEnabled && currentState.aiPreEditActive && currentState.aiSuggestions) {
          updates.aiPreviewDataUrl_after = previewDataUrl;
        }

        return updates;
      },
      () => {
        if (this.state.aiEnabled && this.state.aiStatus === "waiting-preview" && this.state.aiOriginalImageDataUrl && this.state.aiPreviewDataUrl_before) {
          this.runAIInitialAnalysis();
        }
      }
    );
  };

  runAIInitialAnalysis = async () => {
    const {
      aiEnabled,
      aiStatus,
      aiOriginalImageDataUrl,
      aiPreviewDataUrl_before,
      optionValue_modeNBTOrMapdat,
      aiAnalysisRunId,
    } = this.state;

    if (!aiEnabled || aiStatus !== "waiting-preview") return;
    if (!aiOriginalImageDataUrl || !aiPreviewDataUrl_before) return;

    const runId = aiAnalysisRunId;

    this.setState({ aiStatus: "analyzing", aiError: null, aiPreEditActive: true });

    try {
      const originalAnalysis = await analyzeOriginalImage({ imageDataUrl: aiOriginalImageDataUrl });
      if (this.state.aiAnalysisRunId !== runId) return;

      const previewAnalysis = await analyzeSchematicPreview({
        originalImageDataUrl: aiOriginalImageDataUrl,
        previewImageDataUrl: aiPreviewDataUrl_before,
      });
      if (this.state.aiAnalysisRunId !== runId) return;

      const mode = optionValue_modeNBTOrMapdat === MapModes.SCHEMATIC_NBT.uniqueId ? "nbt" : "mapdat";
      const suggestions = await suggestParameters({
        originalAnalysis,
        previewAnalysis,
        currentParams: this.getAIParamsSnapshot(),
        mode,
        iteration: 0,
      });
      if (this.state.aiAnalysisRunId !== runId) return;

      this.setState(
        {
          aiStatus: "ready",
          aiError: null,
          aiOriginalAnalysis: originalAnalysis,
          aiPreviewAnalysis: previewAnalysis,
          aiSuggestions: suggestions,
          aiPreviewDataUrl_after: null,
        },
        () => {
          this.applyAISuggestionsToSettings(suggestions);
        }
      );
    } catch (e) {
      if (this.state.aiAnalysisRunId !== runId) return;
      this.setState({
        aiStatus: "error",
        aiError: e?.message || String(e),
        aiPreEditActive: true,
      });
    }
  };

  onToggleAIEnabled = () => {
    this.setState(
      (currentState) => {
        const nextEnabled = !currentState.aiEnabled;
        return {
          aiEnabled: nextEnabled,
          aiStatus: nextEnabled ? "waiting-preview" : "disabled",
          aiError: nextEnabled ? null : currentState.aiError,
          aiPreEditActive: nextEnabled,
          aiRefinementOpen: false,
        };
      },
      () => {
        if (this.state.aiEnabled) {
          this.onNewImageForAI();
        }
      }
    );
  };

  onAIPreEditAcceptAll = () => {
    this.setState({ aiPreEditActive: false });
  };

  onAIPreEditRejectAll = () => {
    this.restoreFromSnapshot(this.state.aiBaselineSettings || this.state.aiInitialSettings);
    this.setState({ aiPreEditActive: false });
  };

  onAIPreEditContinue = () => {
    this.setState({ aiPreEditActive: false });
  };

  handleAIPreEditChange = (patch) => {
    const statePatch = {};
    if (patch.dithering !== undefined) statePatch.optionValue_dithering = patch.dithering;
    if (patch.scaleFactor !== undefined) statePatch.optionValue_scaleFactor = patch.scaleFactor;
    if (patch.preprocessingEnabled !== undefined) statePatch.optionValue_preprocessingEnabled = patch.preprocessingEnabled;
    if (patch.blurPx !== undefined) statePatch.preProcessingValue_blur = patch.blurPx;
    if (patch.sharpen !== undefined) statePatch.preProcessingValue_sharpen = patch.sharpen;
    if (patch.brightness !== undefined) statePatch.preProcessingValue_brightness = patch.brightness;
    if (patch.contrast !== undefined) statePatch.preProcessingValue_contrast = patch.contrast;
    if (patch.saturation !== undefined) statePatch.preProcessingValue_saturation = patch.saturation;
    if (patch.transparencyEnabled !== undefined) statePatch.optionValue_transparency = patch.transparencyEnabled;
    if (patch.transparencyTolerance !== undefined) statePatch.optionValue_transparencyTolerance = patch.transparencyTolerance;
    if (patch.whereSupportBlocks !== undefined) statePatch.optionValue_whereSupportBlocks = patch.whereSupportBlocks;
    if (patch.supportBlock !== undefined) statePatch.optionValue_supportBlock = patch.supportBlock;

    this.setState(statePatch);
  };

  handleSchematicGenerationComplete = async () => {
    const {
      aiEnabled,
      aiOriginalImageDataUrl,
      aiPreviewDataUrl_current,
      aiOriginalAnalysis,
      optionValue_modeNBTOrMapdat,
      aiRefinementRound,
      aiMaxRefinementRounds,
      aiAnalysisRunId,
    } = this.state;

    if (!aiEnabled) return;
    if (!aiOriginalImageDataUrl || !aiPreviewDataUrl_current) return;
    if (aiRefinementRound >= aiMaxRefinementRounds) return;

    const runId = aiAnalysisRunId;

    this.setState({
      aiRefinementOpen: true,
      aiRefinementLoading: true,
      aiRefinementError: null,
      aiRefinementFeedback: null,
      aiRefinementSuggestions: null,
    });

    try {
      const originalAnalysis =
        aiOriginalAnalysis || (await analyzeOriginalImage({ imageDataUrl: aiOriginalImageDataUrl }));
      if (this.state.aiAnalysisRunId !== runId) return;

      const feedback = await analyzeSchematicPreview({
        originalImageDataUrl: aiOriginalImageDataUrl,
        previewImageDataUrl: aiPreviewDataUrl_current,
      });
      if (this.state.aiAnalysisRunId !== runId) return;

      const mode = optionValue_modeNBTOrMapdat === MapModes.SCHEMATIC_NBT.uniqueId ? "nbt" : "mapdat";
      const suggestions = await suggestParameters({
        originalAnalysis,
        previewAnalysis: feedback,
        currentParams: this.getAIParamsSnapshot(),
        mode,
        iteration: aiRefinementRound + 1,
      });
      if (this.state.aiAnalysisRunId !== runId) return;

      this.setState({
        aiRefinementLoading: false,
        aiRefinementFeedback: feedback,
        aiRefinementSuggestions: suggestions,
      });
    } catch (e) {
      if (this.state.aiAnalysisRunId !== runId) return;
      this.setState({
        aiRefinementLoading: false,
        aiRefinementError: e?.message || String(e),
      });
    }
  };

  onAIRefine = () => {
    const { aiRefinementSuggestions, aiRefinementRound, aiMaxRefinementRounds, aiPreviewDataUrl_current } = this.state;
    if (!aiRefinementSuggestions) return;
    if (aiRefinementRound >= aiMaxRefinementRounds) return;

    const baseline = this.getAIParamsSnapshot();

    this.setState(
      {
        aiRefinementOpen: false,
        aiRefinementError: null,
        aiRefinementFeedback: null,
        aiRefinementSuggestions: null,
        aiPreEditActive: true,
        aiSuggestions: aiRefinementSuggestions,
        aiBaselineSettings: baseline,
        aiPreviewDataUrl_before: aiPreviewDataUrl_current,
        aiPreviewDataUrl_after: null,
        aiRefinementRound: aiRefinementRound + 1,
      },
      () => {
        this.applyAISuggestionsToSettings(aiRefinementSuggestions);
      }
    );
  };

  onAIAcceptFinal = () => {
    this.setState({ aiRefinementOpen: false });
  };

  onAIReset = () => {
    const { aiInitialSettings } = this.state;
    this.restoreFromSnapshot(aiInitialSettings);
    this.setState((currentState) => ({
      aiRefinementOpen: false,
      aiRefinementError: null,
      aiRefinementFeedback: null,
      aiRefinementSuggestions: null,
      aiRefinementRound: 0,
      aiSuggestions: null,
      aiOriginalAnalysis: null,
      aiPreviewAnalysis: null,
      aiPreviewDataUrl_before: null,
      aiPreviewDataUrl_after: null,
      aiPreEditActive: true,
      aiStatus: currentState.aiEnabled ? "waiting-preview" : "disabled",
      aiAnalysisRunId: currentState.aiAnalysisRunId + 1,
    }));
  };

  onAICloseRefinementPanel = () => {
    this.setState({ aiRefinementOpen: false });
  };

  onFileDialogEvent = (e) => {
    const files = e.target.files;
    if (!files.length) {
      return;
    } else {
      const file = files[0];
      const imgUrl = URL.createObjectURL(file);
      this.loadUploadedImageFromURL(imgUrl, file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  loadUploadedImageFromURL(imageURL, baseFilename) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      this.setState({
        uploadedImage: img,
        uploadedImage_baseFilename: baseFilename,
      });
    };
    img.src = imageURL;
  }

  handleChangeColourSetBlock = (colourSetId, blockId) => {
    let selectedBlocks = { ...this.state.selectedBlocks };
    selectedBlocks[colourSetId] = blockId;
    this.setState({
      selectedBlocks,
    });
  };

  handleChangeColourSetBlocks = (setsAndBlocks) => {
    const { coloursJSON, optionValue_version } = this.state;
    let selectedBlocks = {};
    for (const colourSetId of Object.keys(coloursJSON)) {
      selectedBlocks[colourSetId] = "-1";
    }
    for (const [int_colourSetId, presetIndex] of setsAndBlocks) {
      // we store presetIndex in the cookie, not blockId
      const colourSetId = int_colourSetId.toString();
      if (!(colourSetId in coloursJSON)) {
        continue;
      }
      const blockIdAndBlock = Object.entries(coloursJSON[colourSetId].blocks).find(([, block]) => block.presetIndex === presetIndex);
      if (blockIdAndBlock === undefined) {
        continue;
      }
      const blockId = blockIdAndBlock[0];
      if (Object.keys(coloursJSON[colourSetId].blocks[blockId].validVersions).includes(optionValue_version.MCVersion)) {
        selectedBlocks[colourSetId] = blockId;
      }
    }
    this.setState({
      selectedBlocks,
    });
  };

  onOptionChange_modeNBTOrMapdat = (e) => {
    const mode = parseInt(e.target.value);
    this.setState({ optionValue_modeNBTOrMapdat: mode });
    if (mode === MapModes.SCHEMATIC_NBT.uniqueId) {
      this.setState({ optionValue_staircasing: MapModes.SCHEMATIC_NBT.staircaseModes.VALLEY.uniqueId });
    } else {
      this.setState({ optionValue_staircasing: MapModes.MAPDAT.staircaseModes.ON_UNOBTAINABLE.uniqueId });
    }
  };

  onOptionChange_version = (e) => {
    const { coloursJSON } = this.state;
    const mcVersion = e.target.value;
    CookieManager.setCookie("mapartcraft_mcversion", mcVersion);
    const supportedVersionFound = Object.values(SupportedVersions).find((supportedVersion) => supportedVersion.MCVersion === mcVersion);
    this.setState((currentState) => {
      let selectedBlocks = { ...currentState.selectedBlocks };
      for (const [colourSetId, colourSet] of Object.entries(coloursJSON)) {
        if (selectedBlocks[colourSetId] !== "-1" && !Object.keys(colourSet.blocks[selectedBlocks[colourSetId]].validVersions).includes(mcVersion)) {
          selectedBlocks[colourSetId] = "-1";
        }
      }
      return { optionValue_version: supportedVersionFound, selectedBlocks };
    });
  };

  onOptionChange_mapSize_x = (value) => {
    this.setState({
      optionValue_mapSize_x: value,
    });
  };

  onOptionChange_mapSize_y = (value) => {
    this.setState({
      optionValue_mapSize_y: value,
    });
  };

  onOptionChange_cropImage = (e) => {
    const cropValue = parseInt(e.target.value);
    // CENTER is a special case of MANUAL
    // reset cropImage variables any time we change
    this.setState({
      optionValue_cropImage: cropValue,
      optionValue_cropImage_zoom: 10,
      optionValue_cropImage_percent_x: 50,
      optionValue_cropImage_percent_y: 50,
    });
  };

  onOptionChange_cropImage_zoom = (value) => {
    this.setState({
      optionValue_cropImage_zoom: value,
    });
  };

  onOptionChange_cropImage_percent_x = (value) => {
    this.setState({
      optionValue_cropImage_percent_x: value,
    });
  };

  onOptionChange_cropImage_percent_y = (value) => {
    this.setState({
      optionValue_cropImage_percent_y: value,
    });
  };

  onOptionChange_showGridOverlay = () => {
    this.setState({
      optionValue_showGridOverlay: !this.state.optionValue_showGridOverlay,
    });
    // "updatePreviewScale(0)"
  };

  onOptionChange_staircasing = (e) => {
    const staircasingValue = parseInt(e.target.value);
    this.setState({ optionValue_staircasing: staircasingValue });
  };

  onOptionChange_transparency = () => {
    this.setState({
      optionValue_transparency: !this.state.optionValue_transparency,
    });
  };

  onOptionChange_transparencyTolerance = (value) => {
    this.setState({
      optionValue_transparencyTolerance: value,
    });
  };

  onOptionChange_mapdatFilenameUseId = () => {
    this.setState((currentState) => {
      return {
        optionValue_mapdatFilenameUseId: !currentState.optionValue_mapdatFilenameUseId,
      };
    });
  };

  onOptionChange_mapdatFilenameIdStart = (value) => {
    this.setState({
      optionValue_mapdatFilenameIdStart: value,
    });
  };

  onOptionChange_BetterColour = () => {
    this.setState({
      optionValue_betterColour: !this.state.optionValue_betterColour,
    });
  };

  onOptionChange_dithering = (e) => {
    const ditheringValue = parseInt(e.target.value);
    this.setState({ optionValue_dithering: ditheringValue });
  };

  onOptionChange_WhereSupportBlocks = (e) => {
    const newValue = parseInt(e.target.value);
    this.setState({ optionValue_whereSupportBlocks: newValue });
  };

  setOption_SupportBlock = (text) => {
    this.setState({ optionValue_supportBlock: text });
  };

  onOptionChange_PreProcessingEnabled = () => {
    this.setState({
      optionValue_preprocessingEnabled: !this.state.optionValue_preprocessingEnabled,
    });
  };

  onOptionChange_PreProcessingBrightness = (value) => {
    this.setState({
      preProcessingValue_brightness: value,
    });
  };

  onOptionChange_PreProcessingContrast = (value) => {
    this.setState({
      preProcessingValue_contrast: value,
    });
  };

  onOptionChange_PreProcessingSaturation = (value) => {
    this.setState({
      preProcessingValue_saturation: value,
    });
  };

  onOptionChange_PreProcessingBackgroundColourSelect = (e) => {
    const newValue = parseInt(e.target.value);
    this.setState({ preProcessingValue_backgroundColourSelect: newValue });
  };

  onOptionChange_PreProcessingBackgroundColour = (e) => {
    const newValue = e.target.value;
    this.setState({ preProcessingValue_backgroundColour: newValue });
  };

  onOptionChange_extras_moreStaircasingOptions = () => {
    const { optionValue_modeNBTOrMapdat, optionValue_extras_moreStaircasingOptions } = this.state;
    this.setState({ optionValue_extras_moreStaircasingOptions: !optionValue_extras_moreStaircasingOptions });
    if (optionValue_extras_moreStaircasingOptions) {
      if (optionValue_modeNBTOrMapdat === MapModes.SCHEMATIC_NBT.uniqueId) {
        this.setState({ optionValue_staircasing: MapModes.SCHEMATIC_NBT.staircaseModes.VALLEY.uniqueId });
      } else {
        this.setState({ optionValue_staircasing: MapModes.MAPDAT.staircaseModes.ON_UNOBTAINABLE.uniqueId });
      }
    }
  };

  onGetViewOnlineNBT = (viewOnline_NBT) => {
    this.setState({ viewOnline_NBT });
  };

  downloadBlobFile(downloadBlob, filename) {
    const downloadURL = window.URL.createObjectURL(downloadBlob);
    const downloadElt = document.createElement("a");
    downloadElt.style = "display: none";
    downloadElt.href = downloadURL;
    downloadElt.download = filename;
    document.body.appendChild(downloadElt);
    downloadElt.click();
    window.URL.revokeObjectURL(downloadURL);
    document.body.removeChild(downloadElt);
  }

  handleGetPDNPaletteClicked = () => {
    const { getLocaleString } = this.props;
    const { coloursJSON, selectedBlocks, optionValue_modeNBTOrMapdat, optionValue_staircasing } = this.state;
    let paletteText =
      "; paint.net Palette File\n; Generated by MapartCraft\n; Link to preset: " +
      this.selectedBlocksToURL() +
      (Object.entries(selectedBlocks).some(([colourSetId, blockId]) => blockId !== "-1" && coloursJSON[colourSetId].blocks[blockId].presetIndex === "CUSTOM")
        ? "\n; Custom blocks not listed!"
        : "") +
      "\n; staircasing: " +
      ([
        MapModes.SCHEMATIC_NBT.staircaseModes.CLASSIC.uniqueId,
        MapModes.SCHEMATIC_NBT.staircaseModes.VALLEY.uniqueId,
        MapModes.MAPDAT.staircaseModes.ON.uniqueId,
        MapModes.MAPDAT.staircaseModes.ON_UNOBTAINABLE.uniqueId,
      ].includes(optionValue_staircasing)
        ? "enabled"
        : "disabled") +
      "\n; unobtainable colours: " +
      ([MapModes.MAPDAT.staircaseModes.ON_UNOBTAINABLE.uniqueId, MapModes.MAPDAT.staircaseModes.FULL_UNOBTAINABLE.uniqueId].includes(optionValue_staircasing)
        ? "enabled"
        : "disabled") +
      "\n";
    let numberOfColoursExported = 0;
    const toneKeysToExport = Object.values(Object.values(MapModes).find((mapMode) => mapMode.uniqueId === optionValue_modeNBTOrMapdat).staircaseModes).find(
      (staircaseMode) => staircaseMode.uniqueId === optionValue_staircasing
    ).toneKeys; // this .find stuff is annoying.
    // TODO change from uniqueId to key
    for (const [selectedBlock_colourSetId, selectedBlock_blockId] of Object.entries(selectedBlocks)) {
      if (selectedBlock_blockId !== "-1") {
        let colours = coloursJSON[selectedBlock_colourSetId].tonesRGB;
        for (const toneKeyToExport of toneKeysToExport) {
          numberOfColoursExported += 1;
          paletteText += "FF";
          for (let i = 0; i < 3; i++) {
            paletteText += Number(colours[toneKeyToExport][i]).toString(16).padStart(2, "0").toUpperCase();
          }
          paletteText += "\n";
        }
      }
    }
    if (numberOfColoursExported === 0) {
      alert(getLocaleString("BLOCK-SELECTION/PRESETS/DOWNLOAD-WARNING-NONE-SELECTED"));
      return;
    } else if (numberOfColoursExported > 96) {
      alert(
        `${getLocaleString("BLOCK-SELECTION/PRESETS/DOWNLOAD-WARNING-MAX-COLOURS-1")}${numberOfColoursExported.toString()}${getLocaleString(
          "BLOCK-SELECTION/PRESETS/DOWNLOAD-WARNING-MAX-COLOURS-2"
        )}`
      );
    }
    const downloadBlob = new Blob([paletteText], { type: "text/plain" });
    this.downloadBlobFile(downloadBlob, "MapartcraftPalette.txt");
  };

  handlePresetChange = (e) => {
    const presetName = e.target.value;
    const { presets } = this.state;

    this.setState({ selectedPresetName: presetName });

    if (presetName === "None") {
      this.handleChangeColourSetBlocks([]);
    } else {
      const selectedPreset = presets.find((preset) => preset.name === presetName);
      if (selectedPreset !== undefined) {
        this.handleChangeColourSetBlocks(selectedPreset.blocks);
      }
    }
  };

  canDeletePreset = () => {
    const { selectedPresetName } = this.state;
    return selectedPresetName !== "None" && !DefaultPresets.find((defaultPreset) => defaultPreset.name === selectedPresetName);
  };

  handleDeletePreset = () => {
    const { getLocaleString } = this.props;
    const { presets, selectedPresetName } = this.state;
    if (!this.canDeletePreset()) return;
    if (!window.confirm(`${getLocaleString("BLOCK-SELECTION/PRESETS/DELETE-CONFIRM")} ${selectedPresetName}`)) return;
    const presets_new = presets.filter((preset) => preset.name !== selectedPresetName);
    this.setState({
      presets: presets_new,
      selectedPresetName: "None",
    });
    CookieManager.setCookie("mapartcraft_presets", JSON.stringify(presets_new));
  };

  handleSavePreset = () => {
    const { getLocaleString } = this.props;
    const { coloursJSON, presets, selectedBlocks } = this.state;

    let presetToSave_name = prompt(getLocaleString("BLOCK-SELECTION/PRESETS/SAVE-PROMPT-ENTER-NAME"), "");
    if (presetToSave_name === null) {
      return;
    }

    const otherPresets = presets.filter((preset) => preset.name !== presetToSave_name);
    let newPreset = { name: presetToSave_name, blocks: [] };
    Object.keys(selectedBlocks).forEach((key) => {
      if (selectedBlocks[key] !== "-1" && coloursJSON[key].blocks[selectedBlocks[key]].presetIndex !== "CUSTOM") {
        newPreset.blocks.push([parseInt(key), parseInt(coloursJSON[key].blocks[selectedBlocks[key]].presetIndex)]);
      }
    });
    const presets_new = [...otherPresets, newPreset];
    this.setState({
      presets: presets_new,
      selectedPresetName: presetToSave_name,
    });
    CookieManager.setCookie("mapartcraft_presets", JSON.stringify(presets_new));
  };

  selectedBlocksToURL = () => {
    // colourSetId encoded in base 36 as [0-9a-z]
    // blockId encoded in modified base 26 as [Q-ZA-P]
    const { coloursJSON, selectedBlocks } = this.state;
    let presetQueryString = "";
    for (const [colourSetId, blockId] of Object.entries(selectedBlocks)) {
      if (blockId !== "-1" && coloursJSON[colourSetId].blocks[blockId].presetIndex !== "CUSTOM") {
        presetQueryString += parseInt(colourSetId).toString(36);
        presetQueryString += coloursJSON[colourSetId].blocks[blockId].presetIndex
          .toString(26)
          .toUpperCase()
          .replace(/[0-9]/g, (match) => {
            return {
              0: "Q",
              1: "R",
              2: "S",
              3: "T",
              4: "U",
              5: "V",
              6: "W",
              7: "X",
              8: "Y",
              9: "Z",
            }[match];
          });
      }
    }
    return "https://rebane2001.com/mapartcraft/?preset=" + presetQueryString;
  };

  handleSharePreset = () => {
    const { getLocaleString } = this.props;
    const { coloursJSON, selectedBlocks } = this.state;
    if (Object.keys(selectedBlocks).every((colourSetId) => selectedBlocks[colourSetId] === "-1")) {
      alert(getLocaleString("BLOCK-SELECTION/PRESETS/SHARE-WARNING-NONE-SELECTED"));
    } else {
      if (
        Object.entries(selectedBlocks).some(([colourSetId, blockId]) => blockId !== "-1" && coloursJSON[colourSetId].blocks[blockId].presetIndex === "CUSTOM")
      ) {
        alert(getLocaleString("BLOCK-SELECTION/ADD-CUSTOM/NO-EXPORT"));
      }
      prompt(getLocaleString("BLOCK-SELECTION/PRESETS/SHARE-LINK"), this.selectedBlocksToURL());
    }
  };

  URLToPreset = (encodedPreset) => {
    const { onCorruptedPreset } = this.props;
    const { coloursJSON, optionValue_version } = this.state;
    switch (encodedPreset) {
      case "dQw4w9WgXcQ":
        window.location.replace("https://www.youtube.com/watch?v=cZ5wOPinZd4");
        return null;
      case "mares":
        document.body.style.backgroundSize="100%";
        fetch("https://derpibooru.org/api/v1/json/search/images?q=scenery,score.gte:1000,safe&sf=random&per_page=1").then(req=>req.json()).then(derp=>document.body.style.backgroundImage=`url(${derp.images[0].representations.full})`);
        return null;
    }
    if (!/^[0-9a-zQ-ZA-P]*$/g.test(encodedPreset)) {
      onCorruptedPreset();
      return null;
    }
    let selectedBlocks = { ...this.state.selectedBlocks };
    let presetRegex = /([0-9a-z]+)(?=([Q-ZA-P]+))/g;
    let match;
    while ((match = presetRegex.exec(encodedPreset)) !== null) {
      const encodedColourSetId = match[1];
      const encodedBlockId = match[2];
      const decodedColourSetId = parseInt(encodedColourSetId, 36).toString();
      const decodedPresetIndex = parseInt(
        encodedBlockId
          .replace(/[Q-Z]/g, (match) => {
            return {
              Q: "0",
              R: "1",
              S: "2",
              T: "3",
              U: "4",
              V: "5",
              W: "6",
              X: "7",
              Y: "8",
              Z: "9",
            }[match];
          })
          .toLowerCase(),
        26
      );
      if (!(decodedColourSetId in coloursJSON)) {
        continue;
      }
      const decodedBlock = Object.entries(coloursJSON[decodedColourSetId].blocks).find((elt) => elt[1].presetIndex === decodedPresetIndex);
      if (decodedBlock === undefined) {
        continue;
      }
      const decodedBlockId = decodedBlock[0].toString();
      if (Object.keys(coloursJSON[decodedColourSetId].blocks[decodedBlockId].validVersions).includes(optionValue_version.MCVersion)) {
        selectedBlocks[decodedColourSetId] = decodedBlockId;
      }
    }
    return selectedBlocks;
  };

  onMapPreviewWorker_begin = () => {
    this.setState({ mapPreviewWorker_inProgress: true });
  };

  handleSetMapMaterials = (currentMaterialsData) => {
    this.setState({ currentMaterialsData: currentMaterialsData, mapPreviewWorker_inProgress: false });
  };

  onChooseViewOnline3D = () => {
    this.setState({ viewOnline_3D: true });
  };

  handleViewOnline3DEscape = () => {
    this.setState({
      viewOnline_NBT: null,
      viewOnline_3D: false,
    });
  };

  handleAddCustomBlock = (block_colourSetId, block_name, block_nbtTags, block_versions, block_needsSupport, block_flammable) => {
    const { getLocaleString } = this.props;
    // const {coloursJSON} = this.state;
    const block_name_trimmed = block_name.trim();
    if (block_name_trimmed === "") {
      alert(getLocaleString("BLOCK-SELECTION/ADD-CUSTOM/ERROR-NO-NAME"));
      return;
    }
    if (Object.values(block_versions).every((t) => !t)) {
      alert(getLocaleString("BLOCK-SELECTION/ADD-CUSTOM/ERROR-NONE-SELECTED"));
      return;
    }
    let blockToAdd = {
      displayName: block_name_trimmed,
      validVersions: {},
      supportBlockMandatory: block_needsSupport,
      flammable: block_flammable,
      presetIndex: "CUSTOM",
    };
    let addedFirstVersion = false;
    for (const [block_version, block_version_isSelected] of Object.entries(block_versions)) {
      if (!block_version_isSelected) {
        continue;
      }
      if (addedFirstVersion) {
        blockToAdd.validVersions[SupportedVersions[block_version].MCVersion] = `&${Object.keys(blockToAdd.validVersions)[0]}`;
      } else {
        blockToAdd.validVersions[SupportedVersions[block_version].MCVersion] = {
          NBTName: block_name_trimmed,
          NBTArgs: {},
        };
        for (const [nbtTag_key, nbtTag_value] of block_nbtTags) {
          const nbtTag_key_trimmed = nbtTag_key.trim();
          const nbtTag_value_trimmed = nbtTag_value.trim();
          if (!(nbtTag_key_trimmed === "" && nbtTag_value_trimmed === "")) {
            blockToAdd.validVersions[SupportedVersions[block_version].MCVersion].NBTArgs[nbtTag_key_trimmed] = nbtTag_value_trimmed;
          }
        }
        addedFirstVersion = true;
      }
    }

    const customBlocks = JSON.parse(CookieManager.getCookie("mapartcraft_customBlocks"));
    let customBlocks_new = customBlocks.filter(
      (customBlock) =>
        customBlock[0] !== block_colourSetId ||
        customBlock[1].displayName !== block_name_trimmed ||
        !Object.values(SupportedVersions).some(
          (supportedVersion_value) =>
            supportedVersion_value.MCVersion in customBlock[1].validVersions && supportedVersion_value.MCVersion in blockToAdd.validVersions
        )
    ); // filter removes customBlocks that have the same colourSet, name, and some versions in common as the one we are adding. For example this allows us to add different 1.12.2 and 1.13+ versions of a block
    customBlocks_new.push([block_colourSetId, blockToAdd]);

    this.setState((currentState) => {
      return { coloursJSON: this.getMergedColoursJSON(customBlocks_new), selectedBlocks: { ...currentState.selectedBlocks, [block_colourSetId]: "-1" } };
    });
    CookieManager.setCookie("mapartcraft_customBlocks", JSON.stringify(customBlocks_new));
  };

  handleDeleteCustomBlock = (block_colourSetId, block_name, block_versions) => {
    const block_name_trimmed = block_name.trim();
    if (block_name_trimmed === "" || Object.values(block_versions).every((t) => !t)) {
      return;
    }

    let validVersions = [];
    for (const [block_version, block_version_isSelected] of Object.entries(block_versions)) {
      if (block_version_isSelected) {
        validVersions.push(SupportedVersions[block_version].MCVersion);
      }
    }

    const customBlocks = JSON.parse(CookieManager.getCookie("mapartcraft_customBlocks"));
    let customBlocks_new = customBlocks.filter(
      (customBlock) =>
        customBlock[0] !== block_colourSetId ||
        customBlock[1].displayName !== block_name_trimmed ||
        !Object.values(SupportedVersions).some(
          (supportedVersion_value) =>
            supportedVersion_value.MCVersion in customBlock[1].validVersions && validVersions.includes(supportedVersion_value.MCVersion)
        )
    );

    this.setState((currentState) => {
      return {
        coloursJSON: this.getMergedColoursJSON(customBlocks_new),
        selectedBlocks: { ...currentState.selectedBlocks, [block_colourSetId]: "-1" },
        currentMaterialsData: {
          // reset currentMaterialsData as materials.js uses a cached version of materials which could contain blocks which no longer exist
          pixelsData: null,
          maps: [[]],
          currentSelectedBlocks: {},
        },
      };
    });
    CookieManager.setCookie("mapartcraft_customBlocks", JSON.stringify(customBlocks_new));
  };

  render() {
    const { getLocaleString } = this.props;
    const {
      coloursJSON,
      selectedBlocks,
      optionValue_version,
      optionValue_modeNBTOrMapdat,
      optionValue_mapSize_x,
      optionValue_mapSize_y,
      optionValue_cropImage,
      optionValue_cropImage_zoom,
      optionValue_cropImage_percent_x,
      optionValue_cropImage_percent_y,
      optionValue_scaleFactor,
      optionValue_showGridOverlay,
      optionValue_staircasing,
      optionValue_whereSupportBlocks,
      optionValue_supportBlock,
      optionValue_transparency,
      optionValue_transparencyTolerance,
      optionValue_mapdatFilenameUseId,
      optionValue_mapdatFilenameIdStart,
      optionValue_betterColour,
      optionValue_dithering,
      optionValue_preprocessingEnabled,
      preProcessingValue_brightness,
      preProcessingValue_contrast,
      preProcessingValue_saturation,
      preProcessingValue_backgroundColourSelect,
      preProcessingValue_backgroundColour,
      preProcessingValue_blur,
      preProcessingValue_sharpen,
      optionValue_extras_moreStaircasingOptions,
      uploadedImage,
      uploadedImage_baseFilename,
      presets,
      selectedPresetName,
      currentMaterialsData,
      mapPreviewWorker_inProgress,
      viewOnline_NBT,
      viewOnline_3D,
      aiEnabled,
      aiStatus,
      aiError,
      aiOriginalAnalysis,
      aiPreviewAnalysis,
      aiSuggestions,
      aiPreEditActive,
      aiPreviewDataUrl_before,
      aiPreviewDataUrl_after,
      aiRefinementOpen,
      aiRefinementLoading,
      aiRefinementError,
      aiRefinementFeedback,
      aiRefinementSuggestions,
      aiRefinementRound,
      aiMaxRefinementRounds,
    } = this.state;

    const ditherOptions = [
      { label: "None", value: DitherMethods.None.uniqueId },
      { label: "Floyd-Steinberg", value: DitherMethods.FloydSteinberg.uniqueId },
      { label: "Bayer (4x4)", value: DitherMethods.Bayer44.uniqueId },
      { label: "Ordered (3x3)", value: DitherMethods.Ordered33.uniqueId },
    ];

    const whereSupportBlocksOptions = Object.values(WhereSupportBlocksModes).map((m) => ({
      value: m.uniqueId,
      label: getLocaleString(m.localeKey),
    }));

    const aiPreEditVisible = aiEnabled && aiPreEditActive;
    const aiLoading = aiEnabled && ["waiting-preview", "analyzing"].includes(aiStatus);
    const generationDisabled = aiPreEditVisible;

    return (
      <div className="mapartController">
        <BlockSelection
          getLocaleString={getLocaleString}
          coloursJSON={coloursJSON}
          onChangeColourSetBlock={this.handleChangeColourSetBlock}
          optionValue_version={optionValue_version}
          optionValue_modeNBTOrMapdat={optionValue_modeNBTOrMapdat}
          optionValue_staircasing={optionValue_staircasing}
          selectedBlocks={selectedBlocks}
          presets={presets}
          selectedPresetName={selectedPresetName}
          canDeletePreset={this.canDeletePreset}
          onPresetChange={this.handlePresetChange}
          onDeletePreset={this.handleDeletePreset}
          onSavePreset={this.handleSavePreset}
          onSharePreset={this.handleSharePreset}
          onGetPDNPaletteClicked={this.handleGetPDNPaletteClicked}
          handleAddCustomBlock={this.handleAddCustomBlock}
          handleDeleteCustomBlock={this.handleDeleteCustomBlock}
        />
        <div className="sectionsPreviewSettingsMaterials">
          <MapPreview
            getLocaleString={getLocaleString}
            coloursJSON={coloursJSON}
            selectedBlocks={selectedBlocks}
            optionValue_version={optionValue_version}
            optionValue_modeNBTOrMapdat={optionValue_modeNBTOrMapdat}
            optionValue_mapSize_x={optionValue_mapSize_x}
            optionValue_mapSize_y={optionValue_mapSize_y}
            optionValue_cropImage={optionValue_cropImage}
            optionValue_cropImage_zoom={optionValue_cropImage_zoom}
            optionValue_cropImage_percent_x={optionValue_cropImage_percent_x}
            optionValue_cropImage_percent_y={optionValue_cropImage_percent_y}
            optionValue_scaleFactor={optionValue_scaleFactor}
            optionValue_showGridOverlay={optionValue_showGridOverlay}
            optionValue_staircasing={optionValue_staircasing}
            optionValue_whereSupportBlocks={optionValue_whereSupportBlocks}
            optionValue_transparency={optionValue_transparency}
            optionValue_transparencyTolerance={optionValue_transparencyTolerance}
            optionValue_betterColour={optionValue_betterColour}
            optionValue_dithering={optionValue_dithering}
            optionValue_preprocessingEnabled={optionValue_preprocessingEnabled}
            preProcessingValue_brightness={preProcessingValue_brightness}
            preProcessingValue_contrast={preProcessingValue_contrast}
            preProcessingValue_saturation={preProcessingValue_saturation}
            preProcessingValue_backgroundColourSelect={preProcessingValue_backgroundColourSelect}
            preProcessingValue_backgroundColour={preProcessingValue_backgroundColour}
            preProcessingValue_blur={preProcessingValue_blur}
            preProcessingValue_sharpen={preProcessingValue_sharpen}
            uploadedImage={uploadedImage}
            onFileDialogEvent={this.onFileDialogEvent}
            onGetMapMaterials={this.handleSetMapMaterials}
            onMapPreviewWorker_begin={this.onMapPreviewWorker_begin}
            onPreviewDataUrl={this.handlePreviewDataUrl}
          />
          <div style={{ display: "block" }}>
            <div className="section" style={{ maxWidth: 520 }}>
              <label>
                <input type="checkbox" checked={aiEnabled} onChange={this.onToggleAIEnabled} /> Use AI Suggestions
              </label>
              {!aiEnabled && aiError ? (
                <div style={{ marginTop: "0.25em" }}>
                  <small style={{ color: "#a00" }}>{aiError}</small>
                </div>
              ) : null}
            </div>

            <PreEditPanel
              visible={aiPreEditVisible}
              loading={aiLoading}
              error={aiStatus === "error" ? aiError : null}
              originalAnalysis={aiOriginalAnalysis}
              previewAnalysis={aiPreviewAnalysis}
              suggestions={aiSuggestions}
              beforePreviewDataUrl={aiPreviewDataUrl_before}
              afterPreviewDataUrl={aiPreviewDataUrl_after}
              ditherOptions={ditherOptions}
              whereSupportBlocksOptions={whereSupportBlocksOptions}
              values={{
                dithering: optionValue_dithering,
                scaleFactor: optionValue_scaleFactor,
                preprocessingEnabled: optionValue_preprocessingEnabled,
                blurPx: preProcessingValue_blur,
                sharpen: preProcessingValue_sharpen,
                brightness: preProcessingValue_brightness,
                contrast: preProcessingValue_contrast,
                saturation: preProcessingValue_saturation,
                transparencyEnabled: optionValue_transparency,
                transparencyTolerance: optionValue_transparencyTolerance,
                whereSupportBlocks: optionValue_whereSupportBlocks,
                supportBlock: optionValue_supportBlock,
              }}
              onChange={this.handleAIPreEditChange}
              onAcceptAll={this.onAIPreEditAcceptAll}
              onRejectAll={this.onAIPreEditRejectAll}
              onContinue={this.onAIPreEditContinue}
            />

            <RefinementPanel
              visible={aiEnabled && aiRefinementOpen}
              loading={aiRefinementLoading}
              error={aiRefinementError}
              feedback={aiRefinementFeedback}
              suggestions={aiRefinementSuggestions}
              round={Math.min(aiRefinementRound + 1, aiMaxRefinementRounds)}
              maxRounds={aiMaxRefinementRounds}
              onRefine={this.onAIRefine}
              onAccept={this.onAIAcceptFinal}
              onReset={this.onAIReset}
              onClose={this.onAICloseRefinementPanel}
            />

            <MapSettings
              getLocaleString={getLocaleString}
              coloursJSON={coloursJSON}
              optionValue_version={optionValue_version}
              onOptionChange_version={this.onOptionChange_version}
              optionValue_modeNBTOrMapdat={optionValue_modeNBTOrMapdat}
              onOptionChange_modeNBTOrMapdat={this.onOptionChange_modeNBTOrMapdat}
              optionValue_mapSize_x={optionValue_mapSize_x}
              onOptionChange_mapSize_x={this.onOptionChange_mapSize_x}
              optionValue_mapSize_y={optionValue_mapSize_y}
              onOptionChange_mapSize_y={this.onOptionChange_mapSize_y}
              optionValue_cropImage={optionValue_cropImage}
              onOptionChange_cropImage={this.onOptionChange_cropImage}
              optionValue_cropImage_zoom={optionValue_cropImage_zoom}
              onOptionChange_cropImage_zoom={this.onOptionChange_cropImage_zoom}
              optionValue_cropImage_percent_x={optionValue_cropImage_percent_x}
              onOptionChange_cropImage_percent_x={this.onOptionChange_cropImage_percent_x}
              optionValue_cropImage_percent_y={optionValue_cropImage_percent_y}
              onOptionChange_cropImage_percent_y={this.onOptionChange_cropImage_percent_y}
              optionValue_showGridOverlay={optionValue_showGridOverlay}
              onOptionChange_showGridOverlay={this.onOptionChange_showGridOverlay}
              optionValue_staircasing={optionValue_staircasing}
              onOptionChange_staircasing={this.onOptionChange_staircasing}
              optionValue_whereSupportBlocks={optionValue_whereSupportBlocks}
              onOptionChange_WhereSupportBlocks={this.onOptionChange_WhereSupportBlocks}
              optionValue_supportBlock={optionValue_supportBlock}
              setOption_SupportBlock={this.setOption_SupportBlock}
              optionValue_transparency={optionValue_transparency}
              onOptionChange_transparency={this.onOptionChange_transparency}
              optionValue_transparencyTolerance={optionValue_transparencyTolerance}
              onOptionChange_transparencyTolerance={this.onOptionChange_transparencyTolerance}
              optionValue_mapdatFilenameUseId={optionValue_mapdatFilenameUseId}
              onOptionChange_mapdatFilenameUseId={this.onOptionChange_mapdatFilenameUseId}
              optionValue_mapdatFilenameIdStart={optionValue_mapdatFilenameIdStart}
              onOptionChange_mapdatFilenameIdStart={this.onOptionChange_mapdatFilenameIdStart}
              optionValue_betterColour={optionValue_betterColour}
              onOptionChange_BetterColour={this.onOptionChange_BetterColour}
              optionValue_dithering={optionValue_dithering}
              onOptionChange_dithering={this.onOptionChange_dithering}
              optionValue_preprocessingEnabled={optionValue_preprocessingEnabled}
              onOptionChange_PreProcessingEnabled={this.onOptionChange_PreProcessingEnabled}
              preProcessingValue_brightness={preProcessingValue_brightness}
              onOptionChange_PreProcessingBrightness={this.onOptionChange_PreProcessingBrightness}
              preProcessingValue_contrast={preProcessingValue_contrast}
              onOptionChange_PreProcessingContrast={this.onOptionChange_PreProcessingContrast}
              preProcessingValue_saturation={preProcessingValue_saturation}
              onOptionChange_PreProcessingSaturation={this.onOptionChange_PreProcessingSaturation}
              preProcessingValue_backgroundColourSelect={preProcessingValue_backgroundColourSelect}
              onOptionChange_PreProcessingBackgroundColourSelect={this.onOptionChange_PreProcessingBackgroundColourSelect}
              preProcessingValue_backgroundColour={preProcessingValue_backgroundColour}
              onOptionChange_PreProcessingBackgroundColour={this.onOptionChange_PreProcessingBackgroundColour}
              optionValue_extras_moreStaircasingOptions={optionValue_extras_moreStaircasingOptions}
              onOptionChange_extras_moreStaircasingOptions={this.onOptionChange_extras_moreStaircasingOptions}
            />
            <div style={generationDisabled ? { opacity: 0.5, pointerEvents: "none" } : null}>
              <GreenButtons
                getLocaleString={getLocaleString}
                coloursJSON={coloursJSON}
                selectedBlocks={selectedBlocks}
                optionValue_version={optionValue_version}
                optionValue_modeNBTOrMapdat={optionValue_modeNBTOrMapdat}
                optionValue_mapSize_x={optionValue_mapSize_x}
                optionValue_mapSize_y={optionValue_mapSize_y}
                optionValue_cropImage={optionValue_cropImage}
                optionValue_cropImage_zoom={optionValue_cropImage_zoom}
                optionValue_cropImage_percent_x={optionValue_cropImage_percent_x}
                optionValue_cropImage_percent_y={optionValue_cropImage_percent_y}
                optionValue_scaleFactor={optionValue_scaleFactor}
                optionValue_staircasing={optionValue_staircasing}
                optionValue_whereSupportBlocks={optionValue_whereSupportBlocks}
                optionValue_supportBlock={optionValue_supportBlock}
                optionValue_transparency={optionValue_transparency}
                optionValue_transparencyTolerance={optionValue_transparencyTolerance}
                optionValue_mapdatFilenameUseId={optionValue_mapdatFilenameUseId}
                optionValue_mapdatFilenameIdStart={optionValue_mapdatFilenameIdStart}
                optionValue_betterColour={optionValue_betterColour}
                optionValue_dithering={optionValue_dithering}
                optionValue_preprocessingEnabled={optionValue_preprocessingEnabled}
                preProcessingValue_brightness={preProcessingValue_brightness}
                preProcessingValue_contrast={preProcessingValue_contrast}
                preProcessingValue_saturation={preProcessingValue_saturation}
                preProcessingValue_backgroundColourSelect={preProcessingValue_backgroundColourSelect}
                preProcessingValue_backgroundColour={preProcessingValue_backgroundColour}
                preProcessingValue_blur={preProcessingValue_blur}
                preProcessingValue_sharpen={preProcessingValue_sharpen}
                uploadedImage={uploadedImage}
                uploadedImage_baseFilename={uploadedImage_baseFilename}
                currentMaterialsData={currentMaterialsData}
                mapPreviewWorker_inProgress={mapPreviewWorker_inProgress}
                downloadBlobFile={this.downloadBlobFile}
                onGetViewOnlineNBT={this.onGetViewOnlineNBT}
                onSchematicGenerationComplete={this.handleSchematicGenerationComplete}
              />
            </div>
          </div>
          {optionValue_modeNBTOrMapdat === MapModes.SCHEMATIC_NBT.uniqueId ? (
            <Materials
              getLocaleString={getLocaleString}
              coloursJSON={coloursJSON}
              optionValue_version={optionValue_version}
              optionValue_supportBlock={optionValue_supportBlock}
              currentMaterialsData={currentMaterialsData}
            />
          ) : null}
        </div>
        {viewOnline_NBT !== null &&
          (viewOnline_3D ? (
            <ViewOnline3D
              getLocaleString={getLocaleString}
              coloursJSON={coloursJSON}
              optionValue_version={optionValue_version}
              optionValue_mapSize_x={optionValue_mapSize_x}
              optionValue_mapSize_y={optionValue_mapSize_y}
              viewOnline_NBT={viewOnline_NBT}
              handleViewOnline3DEscape={this.handleViewOnline3DEscape}
            />
          ) : (
            <ViewOnline2D
              getLocaleString={getLocaleString}
              coloursJSON={coloursJSON}
              optionValue_version={optionValue_version}
              optionValue_mapSize_x={optionValue_mapSize_x}
              optionValue_mapSize_y={optionValue_mapSize_y}
              optionValue_staircasing={optionValue_staircasing}
              viewOnline_NBT={viewOnline_NBT}
              onGetViewOnlineNBT={this.onGetViewOnlineNBT}
              onChooseViewOnline3D={this.onChooseViewOnline3D}
            />
          ))}
      </div>
    );
  }
}

export default MapartController;
