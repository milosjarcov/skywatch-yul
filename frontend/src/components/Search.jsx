import { useId, useMemo, useState } from "react";
import { altitudeColor, altitudeFeet, byCallsign, displayName, formatNumber, matchesSearch, operatorLine } from "../lib/flights";
import { ClearIcon, SearchIcon } from "./Icons";
import PlaneGlyph from "./PlaneGlyph";

// The search box, and the list of aircraft that drops down under it.
//
// It follows the ARIA "combobox" pattern: focus stays in the text box while
// the arrow keys move a highlight through the list, Enter picks, Escape
// backs out. Screen readers hear which option is highlighted through
// aria-activedescendant. With the box empty, the list shows every aircraft.
export default function Search({ flights, query, onQueryChange, onPick, onHover, inputRef }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const results = useMemo(
    () => flights.filter((flight) => matchesSearch(flight, query)).sort(byCallsign),
    [flights, query],
  );
  const activeIndex = Math.min(active, results.length - 1);

  function pick(flight) {
    onPick(flight);
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (Math.min(i, results.length - 1) + step + results.length) % Math.max(results.length, 1));
    } else if (event.key === "Enter" && open && results[activeIndex]) {
      event.preventDefault();
      pick(results[activeIndex]);
    } else if (event.key === "Escape") {
      if (query) onQueryChange("");
      else {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
  }

  const optionId = (i) => `${listId}-${i}`;

  return (
    <div className={open ? "search is-open" : "search"}>
      <div className="search-field">
        <SearchIcon className="search-icon" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && results.length ? optionId(activeIndex) : undefined}
          aria-label="Search aircraft"
          placeholder="Search callsign or airline"
          autoComplete="off"
          spellCheck="false"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {query ? (
          <button
            type="button"
            className="search-clear"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onQueryChange("")}
          >
            <ClearIcon />
          </button>
        ) : (
          <kbd className="search-key" aria-hidden="true">
            /
          </kbd>
        )}
      </div>

      {open && (
        <div className="search-results">
          <p className="search-count">
            {results.length === 0
              ? "No aircraft match"
              : `${results.length} aircraft${query ? " match" : " in range"}`}
          </p>
          <ul id={listId} role="listbox" aria-label="Aircraft">
            {results.map((flight, i) => {
              const ft = altitudeFeet(flight);
              return (
                <li
                  key={flight.icao24}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={i === activeIndex ? "result is-active" : "result"}
                  // mousedown would blur the box and close the list before the click lands.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(flight)}
                  onMouseEnter={() => {
                    setActive(i);
                    onHover?.(flight.icao24);
                  }}
                  onMouseLeave={() => onHover?.(null)}
                >
                  <span className="result-glyph" style={{ color: altitudeColor(flight) }}>
                    <PlaneGlyph heading={flight.heading ?? 0} size={20} />
                  </span>
                  <span className="result-text">
                    <span className="result-name">{displayName(flight)}</span>
                    <span className="result-sub">{operatorLine(flight)}</span>
                  </span>
                  <span className="result-altitude">
                    {flight.on_ground ? "Ground" : ft == null ? "" : `${formatNumber(ft)} ft`}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
