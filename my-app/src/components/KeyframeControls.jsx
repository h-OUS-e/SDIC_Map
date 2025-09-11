"use client";

import React, { useState } from "react";
import { COLOR_MODES } from "./RouteLayer";

export default function KeyframeControls({
  currentKeyframeIndex,
  totalKeyframes,
  isPlaying,
  isPaused,
  isAutoPlaying,
  onNext,
  onPrevious,
  onPlaySequence,
  onResume,
  onStop,
  onReset,
  isZoomedOut = false,
  onToggleView = () => {},
  showSmoothed = true,
  onToggleSmoothed = () => {},
  viewInfo = null,
  setColorMode = () => {},
  colorMode = COLOR_MODES.NONE, 

}) {

  const [isHidden, setIsHidden] = React.useState(true);
  const [localColorMode, setLocalColorMode] = useState(colorMode);

  // Frosted glass panel
  const panelStyle = {
    position: "absolute",
    top: "20px",
    right: "20px",
    zIndex: 10,
    // glassmorphism background
    background: "rgba(17, 25, 40, 0.45)",
    border: "1px solid rgba(255, 255, 255, 0.16)",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.35)",
    backdropFilter: "blur(12px) saturate(140%)",
    WebkitBackdropFilter: "blur(12px) saturate(140%)",
    borderRadius: "14px",
    color: "rgba(255,255,255,0.95)",
    padding: "12px",
    minWidth: "200px",
  };

  // Icon button base
  const iconBtn = {
    width: 40,
    height: 40,
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.95)",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: "40px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "transform 0.12s ease, background 0.12s ease, border-color 0.12s ease",
  };

  const iconBtnHover = {
    background: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.28)",
  };

  const iconBtnActive = {
    background: "rgba(59,130,246,0.22)", // blue tint
    borderColor: "rgba(59,130,246,0.55)",
    color: "white",
  };

  const iconBtnDisabled = {
    background: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.45)",
    cursor: "not-allowed",
    width: 40,
    height: 40,
    borderRadius: "10px",
  };

  // visually hidden text for screen readers
  const srOnly = {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    whiteSpace: "nowrap",
    border: 0,
  };

  const pillBtn = {
    ...iconBtn,
    height: 32,
    lineHeight: "32px",
    fontSize: 13,
    borderRadius: "9999px",
    padding: "0 12px",
    width: "auto",
  };

  const chipRow = {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 10,
  };
  const chip = {
    fontFamily: "monospace",
    fontSize: 12,
    padding: "6px 8px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.18)",
    color: "rgba(255,255,255,0.95)",
    pointerEvents: "none",
  };
  const divider = {
    height: 1,
    background: "rgba(255,255,255,0.12)",
    marginTop: 8,
    marginBottom: 6,
  };

  // small helper so we can add simple hover styles with inline CSS
  const withHover = (base, hover) => ({
    ...base,
    onMouseEnter: (e) => Object.assign(e.currentTarget.style, hover),
    onMouseLeave: (e) => Object.assign(e.currentTarget.style, base),
    onMouseDown: (e) => (e.currentTarget.style.transform = "scale(0.98)"),
    onMouseUp: (e) => (e.currentTarget.style.transform = "scale(1)"),
  });

  const hotspotStyle = {
    position: "fixed",
    top: 0,
    right: 0,
    width: 72,   // adjust hit area as desired
    height: 72,
    opacity: 0,  // invisible but still clickable
    background: "transparent",
    border: "none",
    zIndex: 11,  // above most content
    cursor: "pointer",
    // show a focus ring if keyboard users tab to it
    outline: "none",
  };

  const hotspotBase = {
    position: "fixed",
    top: 15,
    right: 15,
    width: 72,
    height: 72,
    opacity: 0, // invisible until hover/focus
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 14,
    zIndex: 11,
    cursor: "pointer",
    outline: "none",
    transition:
      "opacity 160ms ease, background 200ms ease, border-color 200ms ease, box-shadow 200ms ease, transform 120ms ease",
  };

  const hotspotHover = {
    // frosted glass + glow
    opacity: 1,
    background: "rgba(17, 25, 40, 0.45)",
    border: "1px solid rgba(255, 255, 255, 0.16)",
    backdropFilter: "blur(12px) saturate(160%)",
    WebkitBackdropFilter: "blur(12px) saturate(160%)",
    boxShadow:
      "0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08), 0 0 22px rgba(59,130,246,0.55)",
    borderRadius: 14,
  };


  

  if (isHidden) {
    return (
      <button
        aria-label="Show keyframe controls"
        title="Show controls"
        style={hotspotBase}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, hotspotHover)}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, hotspotBase)}
        onFocus={(e) => Object.assign(e.currentTarget.style, hotspotHover)} // keyboard support
        onBlur={(e) => Object.assign(e.currentTarget.style, hotspotBase)}
        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
        onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
        onClick={() => setIsHidden(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsHidden(false);
          }
        }}
      >
        <span style={srOnly}>Show keyframe controls</span>
      </button>
    );
  }

  return (
    <div style={panelStyle}>

      {/* close (hide) button in the panel's top-right */}
      <button
        onClick={() => setIsHidden(true)}
        aria-label="Hide controls"
        title="Hide controls"
        style={{
          ...withHover({ ...iconBtn, fontSize: 16 }, iconBtnHover),
          position: "absolute",
          top: 8,
          right: 8,
          width: 28,
          height: 28,
          lineHeight: "28px",
          borderRadius: 8,
        }}
      >
        ×
        <span style={srOnly}>Hide</span>
      </button>

      <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: "0.02em" }}>
        Camera Keyframes
      </div>

      <div
        style={{
          fontSize: 12,
          opacity: 0.85,
          marginTop: 4,
          marginBottom: 10,
        }}
      >
        {currentKeyframeIndex + 1} / {totalKeyframes}
      </div>

      {/* Controls: Prev • Play/Stop • Next • Reset */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={onPrevious}
          disabled={currentKeyframeIndex === 0}
          title="Previous"
          aria-label="Previous keyframe"
          style={
            currentKeyframeIndex === 0
              ? iconBtnDisabled
              : withHover(iconBtn, iconBtnHover)
          }
        >
          ←<span style={srOnly}>Previous</span>
        </button>

        {isPlaying ? (
          <button
            onClick={onStop}
            title="Stop"
            aria-label="Stop autoplay"
            style={withHover({ ...iconBtn, ...iconBtnActive }, iconBtnActive)}
          >
            ⏹<span style={srOnly}>Stop</span>
          </button>
        ) : (
          <button
            onClick={onResume}
            title="Play"
            aria-label="Play sequence"
            style={
              isPlaying
                ? iconBtnDisabled
                : withHover({ ...iconBtn, ...iconBtnActive }, iconBtnActive)
            }
          >
            ▶<span style={srOnly}>Play</span>
          </button>
        )}

        <button
          onClick={onNext}
          disabled={currentKeyframeIndex >= totalKeyframes - 1}
          title="Next"
          aria-label="Next keyframe"
          style={
            currentKeyframeIndex >= totalKeyframes - 1
              ? iconBtnDisabled
              : withHover(iconBtn, iconBtnHover)
          }
        >
          →<span style={srOnly}>Next</span>
        </button>

        <button
          onClick={onReset}
          title="Reset"
          aria-label="Reset camera"
          style={withHover(iconBtn, iconBtnHover)}
        >
          ↺<span style={srOnly}>Reset</span>
        </button>
      </div>

      <div style={{ fontSize: 11, opacity: 0.75, marginTop: 10 }}>
        {isAutoPlaying ? "Auto-playing…" : "Manual control"}
      </div>



      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
          Map View & Layers
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={onToggleView}
            title="Toggle view"
            aria-label="Toggle between SF and Bay Area"
            style={withHover(pillBtn, iconBtnHover)}
          >
            {isZoomedOut ? "San Francisco" : "Bay Area"}
          </button>

          <button
            onClick={onToggleSmoothed}
            aria-pressed={showSmoothed}
            title="Toggle smooth/original routes"
            aria-label="Toggle smooth/original routes"
            style={
              showSmoothed
                ? withHover({ ...pillBtn, ...iconBtnActive }, iconBtnActive)
                : withHover(pillBtn, iconBtnHover)
            }
          >
            {showSmoothed ? "Show Original" : "Show Smooth"}
          </button>
        </div>     
      </div>
        
        {/* NEW: Color Mode toggle buttons */}
      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
          Color Mode
        </div>

        <div
          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
          role="group"
          aria-label="Color mode selection"
        >
          <button
            onClick={() =>  {setColorMode(COLOR_MODES.NONE); setLocalColorMode(COLOR_MODES.NONE)}}
            aria-pressed={localColorMode === COLOR_MODES.NONE}
            title="No color coding"
            style={
              localColorMode === COLOR_MODES.NONE
                ? withHover({ ...pillBtn, ...iconBtnActive }, iconBtnActive)
                : withHover(pillBtn, iconBtnHover)
            }
          >
            None
          </button>

          <button
            onClick={() => {setColorMode(COLOR_MODES.TEAM); setLocalColorMode(COLOR_MODES.TEAM)}}
            aria-pressed={localColorMode === COLOR_MODES.TEAM}
            title="Color by team"
            style={
              localColorMode === COLOR_MODES.TEAM
                ? withHover({ ...pillBtn, ...iconBtnActive }, iconBtnActive)
                : withHover(pillBtn, iconBtnHover)
            }
          >
            Team
          </button>
            <button
            onClick={() =>  {setColorMode(COLOR_MODES.MONTH); setLocalColorMode(COLOR_MODES.MONTH)}}
            aria-pressed={localColorMode === COLOR_MODES.MONTH}
            title="Color by month"
            style={
              localColorMode === COLOR_MODES.MONTH
                ? withHover({ ...pillBtn, ...iconBtnActive }, iconBtnActive)
                : withHover(pillBtn, iconBtnHover)
            }
          >
            Month
          </button>
        </div>
      </div>
      
      

      <div style={divider} />
      {viewInfo && (
        <>
          <div style={chipRow}>
            <span style={chip}>lng: {viewInfo.lng.toFixed(5)}, lat: {viewInfo.lat.toFixed(5)}</span>
          </div>
          <div style={chipRow}>
            <span style={chip}>zoom: {viewInfo.zoom.toFixed(2)}</span>
          </div>
        </>
        
      )}

    </div>
  );
}
