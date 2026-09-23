import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Spinner from "./components/Spinner";
import Landing from "./pages/Landing";

// The map page pulls in Leaflet and MapLibre, which is most of the app's
// JavaScript. Loading it lazily means the landing page's text shows up
// without waiting for a map engine. Vite turns import() into its own file.
const MapPage = lazy(() => import("./pages/MapPage"));

// Two pages: "/" introduces SkyWatch, "/map" is the tracker itself.
// Neither needs an account: open the link and you're watching.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
