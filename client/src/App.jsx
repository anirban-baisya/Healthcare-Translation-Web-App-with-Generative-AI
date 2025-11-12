import React from "react";
import Transcriber from "./Transcriber";

export default function App(){
  return (
    <div className="app">
      <header>
        <h1>Healthcare Translation Web App</h1>
        <p>Real-time voice transcription → AI-enhanced translation → speak</p>
      </header>
      <main>
        <Transcriber />
      </main>
      <footer>
        <small>Prototype — ensure you set OPENAI_API_KEY in server for translation API.</small>
      </footer>
    </div>
  )
}
