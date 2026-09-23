import { useId } from "react";
import { useNow } from "../hooks/useNow";
import { HISTORY_SECONDS } from "../hooks/useFlights";

const MIN_SECONDS = 30; // not worth replaying less than this

export function formatAgo(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} ago`;
}

// A scrubber for the last ten minutes. Drag back to see where every plane
// was; press play to watch it catch up at ten times speed; press Live (or
// drag all the way right) to return. It can only replay what this page has
// recorded, so it fills up while you watch.
export default function ReplayBar({ recordingSince, clockOffset, replayAt, playing, onSeek, onPlay, onLive }) {
  const now = useNow(1000);
  const sliderId = useId();
  const liveNow = (now + clockOffset) / 1000;
  // Measured from the first snapshot this page received, not from the
  // oldest report in it: a parked plane's last report can be minutes old.
  const available = recordingSince == null ? 0 : Math.min(Math.max(liveNow - recordingSince, 0), HISTORY_SECONDS);
  const ready = available >= MIN_SECONDS;
  const offset = replayAt == null ? 0 : Math.max(replayAt - liveNow, -available);

  return (
    <div className={replayAt == null ? "replay" : "replay is-active"}>
      <button
        type="button"
        className="replay-play"
        disabled={!ready}
        onClick={() => (playing ? onPlay(false) : onPlay(true, replayAt ?? liveNow - available))}
        aria-label={playing ? "Pause replay" : "Replay from the start"}
      >
        {playing ? (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 3h3v10H4zM9 3h3v10H9z" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 2.5v11L13 8z" />
          </svg>
        )}
      </button>

      <label htmlFor={sliderId} className="sr-only">
        Replay time
      </label>
      <input
        id={sliderId}
        type="range"
        className="replay-slider"
        min={-Math.round(available)}
        max={0}
        step={1}
        value={Math.round(offset)}
        disabled={!ready}
        onChange={(e) => {
          const value = Number(e.target.value);
          if (value >= -2) onLive();
          else onSeek(liveNow + value);
        }}
        style={{ "--fill": ready ? `${((available + offset) / available) * 100}%` : "0%" }}
      />

      <p className="replay-label">
        {!ready
          ? `Recording, replay in ${Math.ceil(MIN_SECONDS - available)} s`
          : replayAt == null
            ? `${available >= 60 ? `${Math.floor(available / 60)} min ` : ""}${Math.floor(available % 60)} s recorded`
            : formatAgo(-offset)}
      </p>

      <button type="button" className={replayAt == null ? "replay-live is-live" : "replay-live"} onClick={onLive}>
        Live
      </button>
    </div>
  );
}
