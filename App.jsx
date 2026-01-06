import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, MapPin, Clock, Trash2, ChevronRight, ExternalLink, 
  ArrowRight, Calendar, Navigation, Save, User, Loader2, 
  Car, Footprints, Train, AlertCircle, Pencil, Check, Map as MapIcon, List,
  ChevronUp, ChevronDown, Star, BookOpen, X as XIcon, CalendarDays, BedDouble
} from 'lucide-react';

// --- CONFIGURATION ---
// We use VITE_ prefix so the web host (Vercel) can find your key securely
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY; 

// --- HELPER LOGIC ---

const resolveShortUrl = async (url) => {
    if (!url || (!url.includes('goo.gl') && !url.includes('bit.ly') && !url.includes('maps.app'))) {
        return { url, title: null, coords: null };
    }
    const proxies = [
      { url: `https://corsproxy.io/?${encodeURIComponent(url)}`, type: 'text' },
      { url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, type: 'json' },
      { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, type: 'text' }
    ];
    const fetchProxy = async (proxy) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 4000); 
        try {
            const response = await fetch(proxy.url, { signal: controller.signal });
            clearTimeout(id);
            if (!response.ok) throw new Error('Status ' + response.status);
            let text = '';
            let finalUrl = '';
            if (proxy.type === 'json') {
                const json = await response.json();
                text = json.contents;
                if (json.status?.url) finalUrl = json.status.url;
            } else {
                text = await response.text();
                if (response.url && response.url.includes('google.com')) finalUrl = response.url;
            }
            let pageTitle = null;
            const titleMatch = text.match(/<title>(.*?)<\/title>/);
            if (titleMatch) {
                pageTitle = titleMatch[1].replace(' - Google Maps', '').trim();
                if (pageTitle.includes("Google Maps")) pageTitle = null;
            }
            let foundUrl = finalUrl && finalUrl.includes('google.com') ? finalUrl : null;
            if (!foundUrl) {
                const ogMatch = text.match(/property="og:url" content="([^"]+)"/);
                if (ogMatch && ogMatch[1].includes('google.com')) foundUrl = ogMatch[1];
            }
            if (!foundUrl) {
                const longLinkMatch = text.match(/https:\/\/(www\.)?google\.com\/maps\/place\/[^"'\s<]+/);
                if (longLinkMatch) foundUrl = longLinkMatch[0];
            }
            let foundCoords = null;
            const jsCoordMatch = text.match(/\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/);
            if (jsCoordMatch) {
                foundCoords = { lat: parseFloat(jsCoordMatch[1]), lng: parseFloat(jsCoordMatch[2]) };
            }
            if (foundUrl || pageTitle || foundCoords) {
                return { url: foundUrl || url, title: pageTitle, coords: foundCoords };
            }
            throw new Error("No data");
        } catch (e) { clearTimeout(id); throw e; }
    };
    try { return await Promise.any(proxies.map(p => fetchProxy(p))); } 
    catch (e) { return { url, title: null, coords: null }; }
};

const extractFromUrl = (url) => {
    let name = null;
    let coords = null;
    if (!url) return { name, coords };
    try {
        const placeMatch = url.match(/\/place\/([^\/]+)/);
        if (placeMatch) name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
        else {
            const queryMatch = url.match(/[?&]q=([^&]+)/);
            if (queryMatch) name = decodeURIComponent(queryMatch[1].replace(/\+/g, ' '));
        }
    } catch (e) {}
    const patterns = [
      /@(-?\d+\.\d+),(-?\d+\.\d+)/,
      /!3d(-?\d+\.\d+).*!4d(-?\d+\.\d+)/,
      /\/place\/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/,
      /[?&](?:q|ll|daddr)=(-?\d+\.\d+),(-?\d+\.\d+)/
    ];
    for (const p of patterns) {
      const match = url.match(p);
      if (match) {
          coords = { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
          break;
      }
    }
    if (name && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(name)) name = null;
    return { name, coords };
};

// --- UI COMPONENTS ---

const Button = ({ children, onClick, variant = 'primary', className = '', icon: Icon, disabled, loading, title }) => {
  const variants = {
    primary: 'bg-black text-white hover:bg-zinc-800 disabled:bg-zinc-400',
    secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
    ghost: 'hover:bg-zinc-100 text-zinc-600',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100',
    outline: 'border border-zinc-200 hover:bg-zinc-50 text-zinc-700'
  };
  return (
    <button 
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={`flex items-center justify-center gap-2 px-4 py-2 rounded-full transition-all active:scale-95 font-medium disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {loading ? <Loader2 className="animate-spin" size={18} /> : Icon && <Icon size={18} />}
      {children}
    </button>
  );
};

const Card = ({ children, className = "", onClick, style }) => (
  <div 
    onClick={onClick}
    style={style}
    className={`bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all ${className}`}
  >
    {children}
  </div>
);

const ConfirmModal = ({ isOpen, onClose, onConfirm, message, title = "Confirm Deletion" }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3 text-red-500">
          <AlertCircle size={24} />
          <h3 className="text-lg font-bold text-zinc-900">{title}</h3>
        </div>
        <p className="text-zinc-500 text-sm">{message}</p>
        <div className="flex gap-3 justify-end mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>Confirm</Button>
        </div>
      </div>
    </div>
  );
};

// --- SUB COMPONENTS ---

const MapPreview = ({ points }) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const polylineRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current || !window.google) return;
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new window.google.maps.Map(mapContainerRef.current, {
        zoom: 2,
        center: { lat: 20, lng: 0 },
        disableDefaultUI: true,
        zoomControl: true,
        styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }],
      });
    }
    const map = mapInstanceRef.current;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (polylineRef.current) { polylineRef.current.setMap(null); polylineRef.current = null; }

    const bounds = new window.google.maps.LatLngBounds();
    const pathCoordinates = [];
    points.forEach((point, index) => {
      if (point.lat && point.lng) {
        const position = { lat: point.lat, lng: point.lng };
        pathCoordinates.push(position);
        bounds.extend(position);
        const marker = new window.google.maps.Marker({
          position,
          map,
          label: { text: (index + 1).toString(), color: "white", fontWeight: "bold", fontSize: "12px" },
          icon: {
             path: window.google.maps.SymbolPath.CIRCLE,
             scale: 14,
             fillColor: point.isOpen === false ? "#EF4444" : "#000000",
             fillOpacity: 1,
             strokeColor: "#ffffff",
             strokeWeight: 2,
          },
          title: point.name,
        });
        const infoWindow = new window.google.maps.InfoWindow({
            content: `<div style="font-family: sans-serif; padding: 5px;"><strong>${index + 1}. ${point.name}</strong><br/>${point.address}</div>`
        });
        marker.addListener("click", () => { infoWindow.open(map, marker); });
        markersRef.current.push(marker);
      }
    });
    if (pathCoordinates.length > 1) {
      polylineRef.current = new window.google.maps.Polyline({
        path: pathCoordinates,
        geodesic: true,
        strokeColor: "#000000",
        strokeOpacity: 0.8,
        strokeWeight: 3,
        map: map,
      });
    }
    if (pathCoordinates.length > 0) {
      map.fitBounds(bounds);
      const listener = window.google.maps.event.addListenerOnce(map, "idle", () => { 
        if (map.getZoom() > 15) map.setZoom(15); 
      });
    }
  }, [points]);
  return <div ref={mapContainerRef} className="w-full h-[600px] bg-zinc-100 rounded-3xl shadow-inner" />;
};

const LocationLibrary = ({ isOpen, onClose, savedLocations, onSelect, onDelete }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-6 border-b border-zinc-100 flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <BookOpen className="text-zinc-900" size={20} />
            Saved Locations
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors"><XIcon size={20} /></button>
        </div>
        <div className="overflow-y-auto p-4 space-y-2 flex-1">
          {savedLocations.length === 0 ? (
            <div className="text-center py-12 text-zinc-400">
              <Star size={32} className="mx-auto mb-2 opacity-20" />
              <p>No saved locations yet.</p>
            </div>
          ) : (
            savedLocations.map(loc => (
              <div key={loc.id} className="group flex items-center justify-between p-4 hover:bg-zinc-50 rounded-2xl border border-transparent hover:border-zinc-200 transition-all">
                <div className="flex-1 cursor-pointer" onClick={() => onSelect(loc)}>
                  <h3 className="font-bold text-zinc-900">{loc.name}</h3>
                  <p className="text-xs text-zinc-500 line-clamp-1">{loc.address}</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); onDelete(loc.id); }} className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors ml-2"><Trash2 size={16} /></button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// --- CORE APP COMPONENT ---

export default function App() {
  const [view, setView] = useState('home'); 
  const [trips, setTrips] = useState([]);
  const [savedLocations, setSavedLocations] = useState([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isHotelModalOpen, setIsHotelModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, id: null, type: null, message: '' });

  const [currentTrip, setCurrentTrip] = useState({ 
    name: "Untitled Adventure", points: [], hotels: [], startTime: "09:00", startDate: new Date().toISOString().split('T')[0], dayCount: 1 
  });
  const [selectedDay, setSelectedDay] = useState(1);
  const [urlInput, setUrlInput] = useState('');
  const [hotelInput, setHotelInput] = useState('');
  const [hotelStartDay, setHotelStartDay] = useState(1);
  const [hotelEndDay, setHotelEndDay] = useState(1);
  const [error, setError] = useState(null);
  const [isApiLoaded, setIsApiLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [plannerTab, setPlannerTab] = useState('timeline'); 

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;
    if (window.google) { setIsApiLoaded(true); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true; script.defer = true;
    script.onload = () => setIsApiLoaded(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const savedTrips = localStorage.getItem('sequence_trips');
    if (savedTrips) setTrips(JSON.parse(savedTrips));
    const savedLocs = localStorage.getItem('sequence_saved_locations');
    if (savedLocs) setSavedLocations(JSON.parse(savedLocs));
  }, []);

  const saveTrip = () => {
    const updatedTrips = [...trips];
    const existingIndex = updatedTrips.findIndex(t => t.id === currentTrip.id);
    if (existingIndex >= 0) updatedTrips[existingIndex] = { ...currentTrip, id: currentTrip.id || Date.now() };
    else updatedTrips.push({ ...currentTrip, id: Date.now() });
    setTrips(updatedTrips);
    localStorage.setItem('sequence_trips', JSON.stringify(updatedTrips));
    setView('home');
  };

  const loadTrip = (trip) => {
    setCurrentTrip({ ...trip, hotels: trip.hotels || [], startTime: trip.startTime || "09:00", dayCount: trip.dayCount || 1 });
    setSelectedDay(1); setView('planner');
  };

  const handleExecuteDelete = () => {
      const { id, type } = deleteConfirmation;
      if (type === 'point') {
          const newPoints = currentTrip.points.filter(p => p.id !== id);
          setCurrentTrip(prev => ({ ...prev, points: newPoints }));
          updateTravelTimes(newPoints);
      } else if (type === 'hotel') {
          setCurrentTrip(prev => ({ ...prev, hotels: prev.hotels.filter(h => h.id !== id) }));
      } else if (type === 'library') {
          const newLocations = savedLocations.filter(l => l.id !== id);
          setSavedLocations(newLocations);
          localStorage.setItem('sequence_saved_locations', JSON.stringify(newLocations));
      } else if (type === 'duration') {
          const newCount = id;
          setCurrentTrip(prev => ({ ...prev, dayCount: newCount, points: prev.points.filter(p => (p.day || 1) <= newCount) }));
          if (selectedDay > newCount) setSelectedDay(newCount);
      }
      setDeleteConfirmation({ isOpen: false, id: null, type: null, message: '' });
  };

  const searchPlace = async (inputUrl) => {
      let targetUrl = inputUrl;
      let extracted = extractFromUrl(targetUrl);
      let pageTitle = null; let bodyCoords = null;
      if ((!extracted.coords && !extracted.name) && (inputUrl.includes('goo.gl') || inputUrl.includes('maps.app') || inputUrl.includes('bit.ly'))) {
          setLoadingMsg('Resolving link...');
          const resolved = await resolveShortUrl(inputUrl);
          targetUrl = resolved.url; pageTitle = resolved.title; bodyCoords = resolved.coords;
          const reExtracted = extractFromUrl(targetUrl);
          extracted = { name: reExtracted.name || extracted.name, coords: reExtracted.coords || extracted.coords };
      }
      setLoadingMsg('Finding details...');
      const service = new google.maps.places.PlacesService(document.createElement('div'));
      return new Promise((resolve, reject) => {
          const handleResults = (results, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && results[0]) {
                  service.getDetails({ placeId: results[0].place_id, fields: ['name', 'formatted_address', 'geometry', 'opening_hours', 'vicinity'] }, (p, s) => {
                      if (s === google.maps.places.PlacesServiceStatus.OK) resolve({ place: p, coords: extracted.coords || bodyCoords, url: inputUrl });
                      else resolve({ place: results[0], coords: extracted.coords || bodyCoords, url: inputUrl });
                  });
              } else {
                  const finalCoords = extracted.coords || bodyCoords;
                  if (finalCoords) resolve({ place: { name: pageTitle || "Pinned", geometry: { location: finalCoords } }, coords: finalCoords, url: inputUrl, isFallback: true });
                  else reject("Not found");
              }
          };
          if (extracted.name) service.textSearch({ query: extracted.name }, handleResults);
          else if (pageTitle) service.textSearch({ query: pageTitle }, handleResults);
          else service.textSearch({ query: inputUrl }, handleResults);
      });
  };

  const updateTravelTimes = async (points) => {
    const dayPoints = points.filter(p => (p.day || 1) === selectedDay);
    if (dayPoints.length < 2 || !isApiLoaded) return;
    const service = new google.maps.DistanceMatrixService();
    const origins = dayPoints.slice(0, -1).map(p => ({ lat: p.lat, lng: p.lng }));
    const destinations = dayPoints.slice(1).map(p => ({ lat: p.lat, lng: p.lng }));
    try {
      const response = await service.getDistanceMatrix({ origins, destinations, travelMode: google.maps.TravelMode.DRIVING });
      if (response.rows) {
        const updatedPoints = [...points];
        dayPoints.forEach((point, i) => {
          if (i < dayPoints.length - 1) {
            const el = response.rows[i].elements[i];
            if (el.status === "OK") {
              const idx = updatedPoints.findIndex(p => p.id === point.id);
              updatedPoints[idx] = { ...point, travelData: { toId: dayPoints[i+1].id, mode: 'DRIVING', distance: el.distance.text, duration: Math.ceil(el.duration.value / 60) } };
            }
          }
        });
        setCurrentTrip(prev => ({ ...prev, points: updatedPoints }));
      }
    } catch (e) {}
  };

  const addWaypoint = async () => {
    if (!urlInput.trim()) return;
    setIsLoading(true); setError(null);
    try {
        const result = await searchPlace(urlInput);
        const lat = result.place.geometry.location.lat();
        const lng = result.place.geometry.location.lng();
        const newPoint = {
            id: Math.random().toString(36).substr(2, 9),
            name: result.place.name,
            address: result.place.formatted_address || result.place.vicinity || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
            lat, lng, url: result.url, stayMinutes: 60, travelMode: 'DRIVING', day: selectedDay, opening_hours: result.place.opening_hours
        };
        const updatedPoints = [...currentTrip.points, newPoint];
        setCurrentTrip(prev => ({ ...prev, points: updatedPoints }));
        setUrlInput(''); updateTravelTimes(updatedPoints);
    } catch (e) { setError("Could not find location."); } finally { setIsLoading(false); }
  };

  const timelineData = useMemo(() => {
    const dayPoints = currentTrip.points.filter(p => (p.day || 1) === selectedDay);
    const activeHotel = (currentTrip.hotels || []).find(h => selectedDay >= h.startDay && selectedDay <= h.endDay);
    let display = [];
    if (activeHotel) display.push({ ...activeHotel, id: `h-s-${selectedDay}`, isHotel: true, type: 'start' });
    display = [...display, ...dayPoints];
    if (activeHotel) display.push({ ...activeHotel, id: `h-e-${selectedDay}`, isHotel: true, type: 'end' });

    let time = new Date(currentTrip.startDate);
    time.setDate(time.getDate() + (selectedDay - 1));
    const [h, m] = currentTrip.startTime.split(':').map(Number);
    time.setHours(h, m, 0);

    return display.map((p, i) => {
      const start = new Date(time);
      time.setMinutes(time.getMinutes() + (p.stayMinutes || 0));
      const end = new Date(time);
      const travel = p.isHotel ? 30 : (p.travelData?.duration || 15);
      if (i < display.length - 1) time.setMinutes(time.getMinutes() + travel);
      return { ...p, startTime: start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), endTime: end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), computedTravel: travel };
    });
  }, [currentTrip.points, currentTrip.startTime, currentTrip.startDate, currentTrip.hotels, selectedDay]);

  return (
    <div className="min-h-screen bg-[#FBFBFD] text-zinc-900 font-sans">
      <ConfirmModal isOpen={deleteConfirmation.isOpen} message={deleteConfirmation.message} onClose={() => setDeleteConfirmation({ isOpen: false })} onConfirm={handleExecuteDelete} />
      
      <nav className="flex items-center justify-between px-6 py-4 border-b bg-white sticky top-0 z-50">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-bold">S</div>
          <span className="text-xl font-bold">Sequence</span>
        </div>
        <Button onClick={() => setView(view === 'home' ? 'planner' : 'home')}>{view === 'home' ? 'New Trip' : 'Home'}</Button>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {view === 'home' ? (
          <div className="space-y-8">
            <h1 className="text-5xl font-extrabold">Your Adventures.</h1>
            <div className="grid gap-4">
              {trips.map(t => (
                <Card key={t.id} onClick={() => loadTrip(t)} className="cursor-pointer">
                  <h3 className="font-bold">{t.name}</h3>
                  <p className="text-sm text-zinc-500">{t.points.length} stops • {t.dayCount} Days</p>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <input value={currentTrip.name} onChange={e => setCurrentTrip({...currentTrip, name: e.target.value})} className="text-4xl font-bold bg-transparent border-none outline-none w-full" />
            <div className="flex gap-2">
                <input type="text" placeholder="Paste Google Maps URL..." value={urlInput} onChange={e => setUrlInput(e.target.value)} className="flex-1 p-4 border rounded-2xl" onKeyDown={e => e.key === 'Enter' && addWaypoint()}/>
                <Button onClick={addWaypoint} loading={isLoading}>Add Stop</Button>
            </div>
            <div className="space-y-4">
                {timelineData.map((p, i) => (
                    <Card key={p.id} className={p.isHotel ? "bg-blue-50" : ""}>
                        <div className="flex justify-between">
                            <div>
                                <span className="text-xs font-bold text-zinc-400">{p.startTime}</span>
                                <h3 className="text-xl font-bold">{p.name}</h3>
                                <p className="text-sm text-zinc-500">{p.address}</p>
                            </div>
                            {!p.isHotel && <button onClick={() => setDeleteConfirmation({isOpen:true, id: p.id, type: 'point', message: 'Delete stop?'})}><Trash2 size={18} className="text-zinc-300 hover:text-red-500"/></button>}
                        </div>
                    </Card>
                ))}
            </div>
            <Button onClick={saveTrip} className="w-full">Save Trip</Button>
          </div>
        )}
      </main>
    </div>
  );
}
