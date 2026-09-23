import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Spinner from "./components/Spinner";

// The map page pulls in Leaflet and MapLibre, which is most of the app's
// JavaScript. Loading it lazily gets a spinner on screen right away instead
// of a blank page while it downloads. Vite turns import() into its own file.
const MapPage = lazy(() => import("./pages/MapPage"));

// The tracker lives at "/map". No account needed: open the link and you're
// watching.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/map"
          element={
            <Suspense
              fallback={
                <div className="page-center">
                  <Spinner />
                </div>
              }
            >
              <MapPage />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/map" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
