import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider } from "convex/react";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { convex } from "./convex";
import { ThemeModeProvider } from "./contexts/ThemeModeContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeModeProvider>
      <ConvexProvider client={convex}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ConvexProvider>
    </ThemeModeProvider>
  </React.StrictMode>
);
