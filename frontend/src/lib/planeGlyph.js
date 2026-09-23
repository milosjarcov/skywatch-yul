// The aircraft symbol: an airliner seen from above, nose pointing north (up),
// in a 24 x 24 box. Code rotates it to each plane's track. The same path is
// used by the Leaflet map, the 3D map's canvas, the flight list, and the icon.
export const PLANE_PATH =
  "M12 1.6C12.8 1.6 13.3 2.4 13.3 3.6V9.1L21.6 13.7V15L13.3 12.9V18.4L16.4 20.6V21.7L12.6 20.8L12 22.3L11.4 20.8L7.6 21.7V20.6L10.7 18.4V12.9L2.4 15V13.7L10.7 9.1V3.6C10.7 2.4 11.2 1.6 12 1.6Z";

// The same airliner seen from the side, nose to the right, in a 24 x 12 box
// centered on (12, 6). The side view flips it for westbound planes and tips
// it up or down as they climb or descend.
export const SIDE_PATH =
  "M1.6 6.9 3.3 1.8H5.4L8 5.4H18.6C21 5.4 22.6 6.1 22.6 6.9 22.6 7.7 21 8.4 18.6 8.4H3.4C2.3 8.4 1.6 7.8 1.6 6.9ZM9.6 8H14.6L11.6 11H9.8Z";
