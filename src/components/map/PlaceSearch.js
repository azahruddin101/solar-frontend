'use client';

import { Loader2, LocateFixed, MapPin, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { importLibrary, MAPS_API_KEY } from '@/lib/googleMaps';
import { cx } from '../ui';

const COORDS_RE = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

function parseCoords(q) {
  const m = q.match(COORDS_RE);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

async function geocode(request) {
  const { Geocoder } = await importLibrary('geocoding');
  const { results } = await new Geocoder().geocode(request);
  if (!results?.length) throw new Error('No results found');
  const r = results[0];
  return {
    name: r.formatted_address.split(',')[0],
    address: r.formatted_address,
    location: r.geometry.location.toJSON(),
    viewport: r.geometry.viewport?.toJSON(),
  };
}

export default function PlaceSearch({ onSelect }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tokenRef = useRef(null);
  const reqRef = useRef(0);
  const placesBroken = useRef(false);

  const q = query.trim();
  const coords = parseCoords(q);
  const isCoords = Boolean(coords);

  useEffect(() => {
    if (q.length < 3 || isCoords || !MAPS_API_KEY) return undefined;
    const id = ++reqRef.current;
    const timer = setTimeout(async () => {
      if (placesBroken.current) {
        setItems([{ kind: 'geocode', main: q, secondary: 'Search address' }]);
        return;
      }
      try {
        const places = await importLibrary('places');
        tokenRef.current ||= new places.AutocompleteSessionToken();
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          sessionToken: tokenRef.current,
        });
        if (id !== reqRef.current) return;
        const list = suggestions
          .filter((s) => s.placePrediction)
          .map((s) => ({
            kind: 'prediction',
            main: s.placePrediction.mainText?.text || s.placePrediction.text?.text,
            secondary: s.placePrediction.secondaryText?.text || '',
            prediction: s.placePrediction,
          }));
        setItems(list.length ? list : [{ kind: 'geocode', main: q, secondary: 'Search address' }]);
        setActive(0);
      } catch (e) {
        // Places API (New) not enabled for this key — fall back to the Geocoding API.
        console.warn('[PlaceSearch] autocomplete unavailable, using geocoder', e);
        placesBroken.current = true;
        if (id === reqRef.current) setItems([{ kind: 'geocode', main: q, secondary: 'Search address' }]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, isCoords]);

  const visible =
    q.length < 3 ? [] : coords ? [{ kind: 'coords', main: `${coords.lat}, ${coords.lng}`, secondary: 'Go to coordinates', coords }] : items;

  async function choose(item) {
    if (!item) return;
    setBusy(true);
    setError('');
    try {
      let place;
      if (item.kind === 'prediction') {
        const p = item.prediction.toPlace();
        await p.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'viewport'] });
        tokenRef.current = null;
        place = {
          name: p.displayName || item.main,
          address: p.formattedAddress || `${item.main}, ${item.secondary}`,
          location: p.location.toJSON(),
          viewport: p.viewport?.toJSON(),
        };
      } else if (item.kind === 'coords') {
        place = { name: 'Dropped pin', address: item.main, location: item.coords };
        try {
          const r = await geocode({ location: item.coords });
          place.address = r.address;
        } catch {
          /* keep raw coordinates */
        }
      } else {
        place = await geocode({ address: item.main });
      }
      setQuery(place.address);
      setOpen(false);
      setItems([]);
      onSelect(place);
    } catch (e) {
      setError(e.message || 'Could not find that place');
    } finally {
      setBusy(false);
    }
  }

  function locateMe() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser');
      return;
    }
    setBusy(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        let place = { name: 'My location', address: `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`, location: coords };
        try {
          const r = await geocode({ location: coords });
          place = { ...place, address: r.address };
        } catch {
          /* ignore */
        }
        setBusy(false);
        setQuery(place.address);
        onSelect(place);
      },
      (err) => {
        setBusy(false);
        setError(err.message || 'Could not get your location');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div>
      <div className="relative">
        <div className="flex h-[52px] items-center gap-3 rounded-md border border-slate-300 bg-white px-4 shadow-sm focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-muted">
          {busy ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : <Search className="h-4 w-4 text-slate-400" />}
          <input
            value={query}
            disabled={!MAPS_API_KEY}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, visible.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (visible[active]) choose(visible[active]);
                else if (query.trim()) choose({ kind: 'geocode', main: query.trim() });
              } else if (e.key === 'Escape') setOpen(false);
            }}
            placeholder={MAPS_API_KEY ? 'Search address or paste “lat, lng”' : 'Add an API key to enable search'}
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-slate-400"
          />
          <button type="button" title="Use my current location" onClick={locateMe} disabled={busy} className="text-slate-400 hover:text-slate-700">
            <LocateFixed className="h-5 w-5" />
          </button>
        </div>
        {open && visible.length > 0 && (
          <ul className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-md bg-white py-1 shadow-xl ring-1 ring-slate-200">
            {visible.map((it, i) => (
              <li key={`${it.main}-${i}`}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(it)}
                  className={cx('flex w-full items-start gap-2.5 px-4 py-3 text-left', i === active && 'bg-slate-50')}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-slate-900">{it.main}</span>
                    {it.secondary && <span className="block truncate text-xs text-slate-500">{it.secondary}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
