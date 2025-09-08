"use client";

import React from 'react';

export default function KeyframeControls({
  currentKeyframeIndex,
  totalKeyframes,
  isPlaying,
  isAutoPlaying,
  onNext,
  onPrevious,
  onPlaySequence,
  onStop,
  onReset,
}) {
  const buttonStyle = {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #555',
    background: '#333',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px',
    margin: '0 4px',
    transition: 'all 0.2s ease',
  };

  const disabledStyle = {
    ...buttonStyle,
    background: '#222',
    color: '#666',
    cursor: 'not-allowed',
  };

  const activeStyle = {
    ...buttonStyle,
    background: '#3b82f6',
    borderColor: '#3b82f6',
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        zIndex: 10,
        background: 'rgba(20,20,20,0.9)',
        color: 'white',
        padding: '12px',
        border: '1px solid #444',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minWidth: '200px',
      }}
    >
      <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>
        Camera Keyframes
      </div>
      
      <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '8px' }}>
        {currentKeyframeIndex + 1} / {totalKeyframes}
      </div>

      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        <button
          onClick={onPrevious}
          disabled={currentKeyframeIndex === 0}
          style={currentKeyframeIndex === 0 ? disabledStyle : buttonStyle}
        >
          ← Prev
        </button>
        
        <button
          onClick={onNext}
          disabled={currentKeyframeIndex >= totalKeyframes - 1}
          style={currentKeyframeIndex >= totalKeyframes - 1 ? disabledStyle : buttonStyle}
        >
          Next →
        </button>
      </div>

      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {isAutoPlaying ? (
          <button
            onClick={onStop}
            style={activeStyle}
          >
            ⏹ Stop
          </button>
        ) : (
          <button
            onClick={onPlaySequence}
            disabled={isPlaying}
            style={isPlaying ? disabledStyle : activeStyle}
          >
            ▶ Play All
          </button>
        )}
        
        <button
          onClick={onReset}
          style={buttonStyle}
        >
          🔄 Reset
        </button>
      </div>

      <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '4px' }}>
        {isAutoPlaying ? 'Auto-playing sequence...' : 'Manual control'}
      </div>
    </div>
  );
}
