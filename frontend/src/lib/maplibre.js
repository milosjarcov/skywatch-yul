// Every file that uses MapLibre imports it from here, so this setup runs once.
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre decodes tiles in a Web Worker and works out the worker's file path
// at runtime, which bundlers can't follow. "?worker&url" makes Vite bundle the
// worker as its own file and hand us the URL, and we pass that to MapLibre.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

setWorkerUrl(workerUrl);

export * from "maplibre-gl";
