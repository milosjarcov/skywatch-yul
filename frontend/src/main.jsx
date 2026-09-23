import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Leaflet's stylesheet first, so ours can restyle its controls.
import "leaflet/dist/leaflet.css";
import "./index.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
