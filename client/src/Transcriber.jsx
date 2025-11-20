import React, { useEffect, useState, useRef } from "react";

/*
Improved Transcriber:
- Robust creation and lifecycle management of SpeechRecognition instance
- Proper handling for `InvalidStateError` when start() is called twice
- Graceful handling of network errors with user-facing status
- Debounced translate behavior unchanged
*/

export default function Transcriber() {
  const [listening, setListening] = useState(false);
  const [original, setOriginal] = useState("");
  const [translated, setTranslated] = useState("");
  const [inputLang, setInputLang] = useState("en-US");
  const [outputLang, setOutputLang] = useState("bn");
  const [status, setStatus] = useState("idle"); // idle | no-speech-api | listening | translating | translated | network-error | error
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const lastResultRef = useRef(""); // to avoid repeated appends from interim results

  // Helper: check speech recognition support
  function hasSpeechRecognition() {
    return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
  }

  // Factory: create a new SpeechRecognition instance with handlers
  function createRecognition(lang) {
    if (!hasSpeechRecognition()) return null;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      console.log("Recognition started");
      setListening(true);
      setStatus("listening");
    };

    rec.onend = () => {
      console.log("Recognition ended");
      setListening(false);
      // if ended because of network error, status already set; otherwise go idle
      setStatus(prev => (prev === "network-error" ? prev : "idle"));
    };

    rec.onresult = (ev) => {
      let interim = "";
      let final = "";
      for (let i = ev.resultIndex; i < ev.results.length; ++i) {
        if (ev.results[i].isFinal) final += ev.results[i][0].transcript + " ";
        else interim += ev.results[i][0].transcript;
      }
      // combine final + interim but avoid duplicating text that was already appended
      // We keep a small lastResultRef to manage repeated interim updates.
      const combined = (original + " " + final + " " + interim).trim();
      lastResultRef.current = combined;
      setOriginal(combined);
    };

    rec.onerror = (e) => {
      console.error("Recognition error", e);
      // common error types: 'no-speech', 'audio-capture', 'not-allowed', 'network', 'aborted', 'service-not-allowed'
      if (e && e.error === "network") {
        setStatus("network-error");
        // Stop recognition if network errors occur
        try { rec.abort(); } catch (_) {}
      } else if (e && e.error === "not-allowed") {
        setStatus("permission-denied");
        try { rec.abort(); } catch (_) {}
      } else {
        setStatus("error");
      }
    };

    return rec;
  }

  // (Re)create recognition when inputLang changes or when not present
  useEffect(() => {
    if (!hasSpeechRecognition()) {
      setStatus("no-speech-api");
      return;
    }
    // Create a fresh recognizer and store in ref
    recognitionRef.current = createRecognition(inputLang);
    // Clean up on unmount
    return () => {
      const r = recognitionRef.current;
      if (r) {
        try { r.onresult = null; r.onend = null; r.onerror = null; r.onstart = null; r.abort(); } catch (e) {}
        recognitionRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputLang]);

  // Debounced translate call (1s after last original change)
  useEffect(() => {
    const id = setTimeout(() => {
      if (original.trim().length > 0) {
        translateText(original);
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [original, outputLang]);

  async function translateText(text) {
    setStatus("translating");
    try {
      // const resp = await fetch("http://localhost:3000/api/translate", {
      const backend = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";
      const resp = await fetch(`${backend}/api/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, outputLang }),
      });
      const data = await resp.json();
      if (data.translated) {
        setTranslated(data.translated);
        setStatus("translated");
      } else {
        setTranslated("Translation failed, You exceeded your current quota, please check your plan and billing details.");
        setStatus("error");
      }
    } catch (err) {
      console.error(err);
      setTranslated("Translation error");
      setStatus("error");
    }
  }

  // Toggle listening: robustly handle invalid state and network errors
  function toggleListening() {
    const rec = recognitionRef.current;
    if (!rec) {
      // try creating one (maybe support is present but was not created)
      if (!hasSpeechRecognition()) {
        setStatus("no-speech-api");
        return;
      }
      recognitionRef.current = createRecognition(inputLang);
    }

    const r = recognitionRef.current;

    if (!listening) {
      // start listening
      try {
        // If the recognizer is in a weird state, abort first then start
        r.start();
        // We rely on onstart to set listening state
      } catch (err) {
        console.warn("Failed to start recognition:", err);
        // If invalid state (already started), abort and try starting again
        if (err && err.name === "InvalidStateError") {
          try {
            r.abort();
          } catch (e) {}
          // recreate and start
          recognitionRef.current = createRecognition(inputLang);
          try {
            recognitionRef.current.start();
          } catch (e2) {
            console.error("Start failed after abort:", e2);
            setStatus("error");
          }
        } else {
          setStatus("error");
        }
      }
    } else {
      // stop listening
      try {
        // Prefer stop() so final results are delivered; fallback to abort if stop fails
        if (typeof r.stop === "function") {
          r.stop();
        } else {
          r.abort();
        }
      } catch (e) {
        console.warn("Error stopping recognition:", e);
        try { r.abort(); } catch (e2) {}
      } finally {
        // onend will update listening -> idle
      }
    }
  }

  function speak() {
    if (!translated) return;
    if (synthRef.current.speaking) synthRef.current.cancel();
    const utter = new SpeechSynthesisUtterance(translated);
    const voices = synthRef.current.getVoices();
    // choose a voice that starts with outputLang (e.g., 'bn' or 'en')
    const match = voices.find((v) => v.lang && v.lang.startsWith(outputLang));
    if (match) utter.voice = match;
    // speechSynthesis wants the BCP-47 language (e.g., 'en-US' or 'bn-BD'); if the chosen outputLang is short (like 'bn'), leave it
    utter.lang = outputLang;
    synthRef.current.speak(utter);
  }

  function clearAll() {
    setOriginal("");
    setTranslated("");
    lastResultRef.current = "";
  }

  return (
    <div>
      <div className="controls">
        <div className="row">
          <label className="small">Input language:</label>
          <select
            value={inputLang}
            onChange={(e) => {
              // stop existing recognition then change language which will recreate recognizer in effect
              try {
                if (recognitionRef.current) recognitionRef.current.abort();
              } catch (e) {}
              setInputLang(e.target.value);
            }}
          >
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="bn-BD">Bengali (Bangla)</option>
            <option value="hi-IN">Hindi</option>
            <option value="es-ES">Spanish</option>
          </select>
        </div>
        <div className="row">
          <label className="small">Output language:</label>
          <select value={outputLang} onChange={(e) => setOutputLang(e.target.value)}>
            <option value="en">English</option>
            <option value="bn">Bengali</option>
            <option value="hi">Hindi</option>
            <option value="es">Spanish</option>
          </select>
        </div>

        <div className="row">
          <button onClick={toggleListening}>{listening ? "Stop" : "Start"} Recording</button>
        </div>

        <div className="row">
          <button onClick={speak}>Speak</button>
        </div>

        <div className="row">
          <button onClick={clearAll} style={{ background: "#ef4444" }}>
            Clear
          </button>
        </div>
      </div>

      <div className="transcripts">
        <div className="panel">
          <h3>Original Transcript</h3>
          <div style={{ whiteSpace: "pre-wrap" }}>{original || <span className="small">No transcript yet</span>}</div>
        </div>
        <div className="panel">
          <h3>Translated / Corrected Transcript</h3>
          <div style={{ whiteSpace: "pre-wrap" }}>{translated || <span className="small">Translation will appear here</span>}</div>
        </div>
      </div>

      <div style={{ marginTop: 10 }} className="small">Status: {status}</div>
      <div style={{ marginTop: 6 }} className="small">Tip: Use Chrome/Edge on localhost or HTTPS and allow microphone permission.</div>
    </div>
  );
}
