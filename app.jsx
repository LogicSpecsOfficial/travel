import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, MapPin, Clock, Trash2, ChevronRight, ExternalLink, 
  ArrowRight, Calendar, Navigation, Save, User, Loader2, 
  Car, Footprints, Train, AlertCircle, Pencil, Check, Map as MapIcon, List,
  ChevronUp, ChevronDown, Star, BookOpen, X as XIcon, CalendarDays, BedDouble
} from 'lucide-react';

// --- CONFIGURATION ---
const GOOGLE_MAPS_API_KEY = "AIzaSyBkmr2ZkRC3SXQI2Py8Q9AdC6KQBdD6FRc"; 

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

// --- Custom Confirmation Modal ---
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
        styles: [
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }],
          },
        ],
      });
    }

    const map = mapInstanceRef.current;

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
    }

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
          label: {
            text: (index + 1).toString(),
            color: "white",
            fontWeight: "bold",
            fontSize: "12px"
          },
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
        marker.addListener("click", () => {
            infoWindow.open(map, marker);
        });

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
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
            <XIcon size={20} />
          </button>
        </div>
        
        <div className="overflow-y-auto p-4 space-y-2 flex-1">
          {savedLocations.length === 0 ? (
            <div className="text-center py-12 text-zinc-400">
              <Star size={32} className="mx-auto mb-2 opacity-20" />
              <p>No saved locations yet.</p>
              <p className="text-xs mt-1">Star locations in your timeline to save them here.</p>
            </div>
          ) : (
            savedLocations.map(loc => (
              <div key={loc.id} className="group flex items-center justify-between p-4 hover:bg-zinc-50 rounded-2xl border border-transparent hover:border-zinc-200 transition-all">
                <div className="flex-1 cursor-pointer" onClick={() => onSelect(loc)}>
                  <h3 className="font-bold text-zinc-900">{loc.name}</h3>
                  <p className="text-xs text-zinc-500 line-clamp-1">{loc.address}</p>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); onDelete(loc.id); }}
                  className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors ml-2"
                  title="Remove from Library"
                >
                  <Trash2 size={16} />
                </button>
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
  
  // Library State
  const [savedLocations, setSavedLocations] = useState([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isHotelModalOpen, setIsHotelModalOpen] = useState(false);

  // Delete Confirmation State
  const [deleteConfirmation, setDeleteConfirmation] = useState({
      isOpen: false,
      id: null,
      type: null, // 'point', 'hotel', 'library', 'duration'
      message: '',
      payload: null // Store complex data like new duration count
  });

  const [currentTrip, setCurrentTrip] = useState({ 
    name: "Untitled Adventure", 
    points: [],
    hotels: [],
    startTime: "09:00",
    startDate: new Date().toISOString().split('T')[0],
    dayCount: 1
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
  const [editingTravelId, setEditingTravelId] = useState(null);
  const [plannerTab, setPlannerTab] = useState('timeline'); 

  // Load Google Maps
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;
    if (window.google) { setIsApiLoaded(true); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => setIsApiLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Persistence
  useEffect(() => {
    const savedTrips = localStorage.getItem('sequence_trips');
    if (savedTrips) setTrips(JSON.parse(savedTrips));
    const savedLocs = localStorage.getItem('sequence_saved_locations');
    if (savedLocs) setSavedLocations(JSON.parse(savedLocs));
  }, []);

  const saveTrip = () => {
    const updatedTrips = [...trips];
    const existingIndex = updatedTrips.findIndex(t => t.id === currentTrip.id);
    if (existingIndex >= 0) {
      updatedTrips[existingIndex] = { ...currentTrip, id: currentTrip.id || Date.now() };
    } else {
      updatedTrips.push({ ...currentTrip, id: Date.now() });
    }
    setTrips(updatedTrips);
    localStorage.setItem('sequence_trips', JSON.stringify(updatedTrips));
    setView('home');
    setCurrentTrip({ name: "Untitled Adventure", points: [], hotels: [], startTime: "09:00", startDate: new Date().toISOString().split('T')[0], dayCount: 1 });
    setSelectedDay(1);
  };

  const loadTrip = (trip) => {
    setCurrentTrip({
      ...trip,
      hotels: trip.hotels || [], 
      startTime: trip.startTime || "09:00",
      dayCount: trip.dayCount || 1
    });
    setPlannerTab('timeline');
    setSelectedDay(1);
    setView('planner');
  };

  // --- DELETE & SAFETY LOGIC ---
  const confirmRemovePoint = (id) => {
      setDeleteConfirmation({ isOpen: true, id, type: 'point', message: 'Are you sure you want to delete this stop?' });
  };
  const confirmRemoveHotel = (id) => {
      setDeleteConfirmation({ isOpen: true, id, type: 'hotel', message: 'Are you sure you want to remove this hotel stay?' });
  };
  const confirmRemoveLibraryItem = (id) => {
      setDeleteConfirmation({ isOpen: true, id, type: 'library', message: 'Remove this location from your saved library?' });
  };

  const handleDurationChange = (val) => {
      const newCount = parseInt(val) || 1;
      if(newCount < 1) return;

      // Check if any points exist on the days about to be deleted
      const hasPointsInDeletedDays = currentTrip.points.some(p => (p.day || 1) > newCount);
      
      if (hasPointsInDeletedDays) {
          setDeleteConfirmation({
              isOpen: true,
              id: newCount, // We abuse 'id' to store the new number value
              type: 'duration',
              message: `Reducing to ${newCount} days will permanently delete locations scheduled on days ${newCount + 1} through ${currentTrip.dayCount}. Are you sure?`
          });
      } else {
          // Safe to update immediately
          setCurrentTrip(prev => ({ ...prev, dayCount: newCount }));
          if (selectedDay > newCount) setSelectedDay(newCount);
      }
  };

  const handleExecuteDelete = () => {
      const { id, type } = deleteConfirmation;
      
      if (type === 'point') {
          const newPoints = currentTrip.points.filter(p => p.id !== id);
          setCurrentTrip(prev => ({ ...prev, points: newPoints }));
          updateTravelTimes(newPoints);
      } else if (type === 'hotel') {
          setCurrentTrip(prev => ({
              ...prev,
              hotels: (prev.hotels || []).filter(h => h.id !== id)
          }));
      } else if (type === 'library') {
          const newLocations = savedLocations.filter(l => l.id !== id);
          setSavedLocations(newLocations);
          localStorage.setItem('sequence_saved_locations', JSON.stringify(newLocations));
      } else if (type === 'duration') {
          const newCount = id; // Retrieved from state payload
          setCurrentTrip(prev => ({
              ...prev,
              dayCount: newCount,
              points: prev.points.filter(p => (p.day || 1) <= newCount)
          }));
          if (selectedDay > newCount) setSelectedDay(newCount);
      }
      
      setDeleteConfirmation({ isOpen: false, id: null, type: null, message: '' });
  };

  // --- GENERAL SEARCH LOGIC ---
  const searchPlace = async (inputUrl) => {
      let targetUrl = inputUrl;
      let extracted = extractFromUrl(targetUrl);
      let pageTitle = null;
      let bodyCoords = null;

      if ((!extracted.coords && !extracted.name) && (inputUrl.includes('goo.gl') || inputUrl.includes('maps.app') || inputUrl.includes('bit.ly'))) {
          setLoadingMsg('Resolving link...');
          const resolved = await resolveShortUrl(inputUrl);
          targetUrl = resolved.url;
          pageTitle = resolved.title;
          bodyCoords = resolved.coords;
          const reExtracted = extractFromUrl(targetUrl);
          extracted = { name: reExtracted.name || extracted.name, coords: reExtracted.coords || extracted.coords };
      }

      setLoadingMsg('Finding place details...');
      const service = new google.maps.places.PlacesService(document.createElement('div'));

      return new Promise((resolve, reject) => {
          const handleResults = (results, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
                  let bestPlace = results[0];
                  if (results.length > 1) {
                      const specific = results.find(r => r.types.includes('establishment') || r.types.includes('point_of_interest'));
                      const currentIsGeneric = bestPlace.types.includes('locality') || bestPlace.types.includes('political');
                      if (specific && currentIsGeneric) bestPlace = specific;
                  }
                  
                  service.getDetails({
                      placeId: bestPlace.place_id,
                      fields: ['name', 'formatted_address', 'geometry', 'opening_hours', 'vicinity']
                  }, (placeDetails, detailStatus) => {
                      if (detailStatus === google.maps.places.PlacesServiceStatus.OK) {
                          resolve({ place: placeDetails, coords: extracted.coords || bodyCoords, url: inputUrl });
                      } else {
                          resolve({ place: bestPlace, coords: extracted.coords || bodyCoords, url: inputUrl });
                      }
                  });
              } else {
                  const finalCoords = extracted.coords || bodyCoords;
                  if (finalCoords) {
                      resolve({ 
                          place: { name: pageTitle || "Pinned Location", geometry: { location: finalCoords } }, 
                          coords: finalCoords, 
                          url: inputUrl,
                          isFallback: true 
                      });
                  } else {
                      reject("Could not find location.");
                  }
              }
          };

          const finalCoords = extracted.coords || bodyCoords;
          if (extracted.name) service.textSearch({ query: extracted.name }, handleResults);
          else if (pageTitle) service.textSearch({ query: pageTitle }, handleResults);
          else if (finalCoords) service.nearbySearch({ location: finalCoords, radius: 50 }, handleResults);
          else service.textSearch({ query: inputUrl }, handleResults);
      });
  };

  // --- WAYPOINT LOGIC ---
  const addWaypoint = async () => {
    if (!urlInput.trim()) return;
    setIsLoading(true); setError(null);
    try {
        const result = await searchPlace(urlInput);
        const lat = result.place.geometry?.location?.lat ? (typeof result.place.geometry.location.lat === 'function' ? result.place.geometry.location.lat() : result.place.geometry.location.lat) : result.coords?.lat;
        const lng = result.place.geometry?.location?.lng ? (typeof result.place.geometry.location.lng === 'function' ? result.place.geometry.location.lng() : result.place.geometry.location.lng) : result.coords?.lng;

        const newPoint = {
            id: Math.random().toString(36).substr(2, 9),
            name: result.place.name,
            address: result.place.formatted_address || result.place.vicinity || (result.isFallback ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : ""),
            lat, lng,
            url: result.url,
            stayMinutes: 60,
            travelMode: 'DRIVING',
            manualTravelTime: null,
            opening_hours: result.place.opening_hours,
            day: selectedDay
        };

        const updatedPoints = [...currentTrip.points, newPoint];
        setCurrentTrip(prev => ({ ...prev, points: updatedPoints }));
        setUrlInput('');
        updateTravelTimes(updatedPoints); 
    } catch (e) {
        setError(String(e.message || e));
    } finally {
        setIsLoading(false);
    }
  };

  // --- HOTEL LOGIC ---
  const addHotel = async () => {
      if (!hotelInput.trim()) return;
      setIsLoading(true); setError(null);
      try {
          const result = await searchPlace(hotelInput);
          const lat = result.place.geometry?.location?.lat ? (typeof result.place.geometry.location.lat === 'function' ? result.place.geometry.location.lat() : result.place.geometry.location.lat) : result.coords?.lat;
          const lng = result.place.geometry?.location?.lng ? (typeof result.place.geometry.location.lng === 'function' ? result.place.geometry.location.lng() : result.place.geometry.location.lng) : result.coords?.lng;

          const newHotel = {
              id: Math.random().toString(36).substr(2, 9),
              name: result.place.name,
              address: result.place.formatted_address || result.place.vicinity,
              lat, lng,
              startDay: hotelStartDay,
              endDay: hotelEndDay
          };

          const updatedHotels = [...(currentTrip.hotels || []), newHotel];
          setCurrentTrip(prev => ({ ...prev, hotels: updatedHotels }));
          setHotelInput('');
          setIsHotelModalOpen(false);
      } catch (e) {
          setError(String(e.message || e));
      } finally {
          setIsLoading(false);
      }
  };

  // --- TRAVEL TIME & CACHING ---
  const updateTravelTimes = async (points) => {
    if (points.length < 2 || !isApiLoaded) return;
    const service = new google.maps.DistanceMatrixService();
    const updatedPoints = [...points];
    let hasChanges = false;
    
    for (let i = 0; i < updatedPoints.length - 1; i++) {
      const origin = updatedPoints[i];
      const destination = updatedPoints[i+1];
      
      if ((origin.day || 1) !== (destination.day || 1)) continue;
      if (origin.travelData && origin.travelData.toId === destination.id && origin.travelData.mode === origin.travelMode) continue;

      try {
        const response = await service.getDistanceMatrix({
          origins: [{ lat: origin.lat, lng: origin.lng }],
          destinations: [{ lat: destination.lat, lng: destination.lng }],
          travelMode: google.maps.TravelMode[origin.travelMode || 'DRIVING'],
        });
        if (response.rows[0].elements[0].status === "OK") {
          const element = response.rows[0].elements[0];
          updatedPoints[i] = {
              ...origin,
              travelData: {
                  toId: destination.id,
                  mode: origin.travelMode || 'DRIVING',
                  distance: element.distance.text,
                  duration: Math.ceil(element.duration.value / 60)
              }
          };
          hasChanges = true;
        }
      } catch (e) {}
    }
    if (hasChanges) setCurrentTrip(prev => ({ ...prev, points: updatedPoints }));
  };

  const updateStay = (id, mins) => {
    setCurrentTrip(prev => ({ ...prev, points: prev.points.map(p => p.id === id ? { ...p, stayMinutes: parseInt(mins) || 0 } : p) }));
  };
  const updatePointDetails = (id, field, value) => {
    setCurrentTrip(prev => ({ ...prev, points: prev.points.map(p => p.id === id ? { ...p, [field]: value } : p) }));
  };
  const updateTravelMode = (id, mode) => {
    const newPoints = currentTrip.points.map(p => p.id === id ? { ...p, travelMode: mode } : p);
    setCurrentTrip(prev => ({ ...prev, points: newPoints }));
    updateTravelTimes(newPoints);
  };
  const updateManualTravelTime = (id, mins) => {
     setCurrentTrip(prev => ({ ...prev, points: prev.points.map(p => p.id === id ? { ...p, manualTravelTime: parseInt(mins) || 0 } : p) }));
  };
  const movePoint = (indexInDay, direction) => {
    const dayPoints = currentTrip.points.filter(p => (p.day || 1) === selectedDay);
    const itemToMove = dayPoints[indexInDay];
    const itemTarget = direction === -1 ? dayPoints[indexInDay - 1] : dayPoints[indexInDay + 1];
    if (!itemToMove || !itemTarget) return;
    const realIndexFrom = currentTrip.points.findIndex(p => p.id === itemToMove.id);
    const realIndexTo = currentTrip.points.findIndex(p => p.id === itemTarget.id);
    const newPoints = [...currentTrip.points];
    [newPoints[realIndexFrom], newPoints[realIndexTo]] = [newPoints[realIndexTo], newPoints[realIndexFrom]];
    setCurrentTrip(prev => ({ ...prev, points: newPoints }));
    updateTravelTimes(newPoints);
  };

  // --- TIMELINE GENERATION WITH HOTELS ---
  function checkOpeningStatus(arrivalDate, opening_hours) {
    if (!opening_hours || !opening_hours.periods) return { status: 'unknown' };
    const dayOfWeek = arrivalDate.getDay(); 
    const arrivalTime = arrivalDate.getHours() * 100 + arrivalDate.getMinutes(); 
    const todaysPeriods = opening_hours.periods.filter(p => p.open.day === dayOfWeek);
    if (todaysPeriods.length === 0) return { status: 'closed', message: 'Closed today' };
    for (const period of todaysPeriods) {
        const openTime = parseInt(period.open.time);
        const closeTime = period.close ? parseInt(period.close.time) : 2400; 
        if (arrivalTime >= openTime && arrivalTime < closeTime) {
            const h = period.close?.time.substring(0, 2) || "??";
            const m = period.close?.time.substring(2) || "00";
            return { status: 'open', message: `Open until ${h}:${m}` };
        }
    }
    const nextOpen = todaysPeriods[0].open.time;
    return { status: 'closed', message: `Closed. Opens ${nextOpen.substring(0,2)}:${nextOpen.substring(2)}` };
  }

  const timelineData = useMemo(() => {
    const dayPoints = currentTrip.points.filter(p => (p.day || 1) === selectedDay);
    
    // Find active hotel for this day
    const activeHotel = currentTrip.hotels ? currentTrip.hotels.find(h => selectedDay >= h.startDay && selectedDay <= h.endDay) : null;

    let displayPoints = [];

    // Inject Hotel Start
    if (activeHotel) {
        displayPoints.push({
            id: `hotel-start-${selectedDay}`,
            name: `${activeHotel.name} (Start)`,
            address: activeHotel.address,
            lat: activeHotel.lat,
            lng: activeHotel.lng,
            type: 'hotel-start',
            stayMinutes: 0,
            isHotel: true
        });
    }

    // Add user points
    displayPoints = [...displayPoints, ...dayPoints];

    // Inject Hotel End
    if (activeHotel) {
        displayPoints.push({
            id: `hotel-end-${selectedDay}`,
            name: `${activeHotel.name} (End)`,
            address: activeHotel.address,
            lat: activeHotel.lat,
            lng: activeHotel.lng,
            type: 'hotel-end',
            stayMinutes: 0,
            isHotel: true
        });
    }

    // Calculate Times
    let currentTime = new Date(currentTrip.startDate || new Date());
    currentTime.setDate(currentTime.getDate() + (selectedDay - 1));
    const [startHour, startMinute] = (currentTrip.startTime || "09:00").split(':').map(Number);
    currentTime.setHours(startHour, startMinute, 0);

    return displayPoints.map((point, index) => {
      const startTime = new Date(currentTime);
      currentTime.setMinutes(currentTime.getMinutes() + (point.stayMinutes || 0));
      const endTime = new Date(currentTime);
      
      // Calculate travel to next
      let travelTime = 0;
      let distanceDisplay = null;

      // Logic for travel time
      // Case 1: Point -> Point (Use cached travelData)
      if (!point.isHotel && index < displayPoints.length - 1 && !displayPoints[index+1].isHotel) {
          const duration = point.travelData ? point.travelData.duration : 15;
          travelTime = point.manualTravelTime ?? duration;
          distanceDisplay = point.travelData ? point.travelData.distance : '...';
      }
      // Case 2: Hotel -> Point or Point -> Hotel (Use manual or default 30m for now)
      else if (index < displayPoints.length - 1) {
          travelTime = 30; // Default estimate for hotel commute
          distanceDisplay = '~';
      }

      currentTime.setMinutes(currentTime.getMinutes() + travelTime);

      const openingStatus = point.isHotel ? { status: 'open' } : checkOpeningStatus(startTime, point.opening_hours);

      return {
        ...point,
        startTime: startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        endTime: endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        computedTravel: travelTime,
        distanceDisplay: distanceDisplay,
        isOpen: openingStatus.status !== 'closed',
        statusMessage: openingStatus.message,
        arrivalDay: startTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
      };
    });
  }, [currentTrip.points, currentTrip.startTime, currentTrip.startDate, currentTrip.hotels, selectedDay]);

  // --- LIBRARY LOGIC ---
  const toggleSaveLocation = (point) => {
    const existing = savedLocations.find(l => (l.lat === point.lat && l.lng === point.lng));
    let newLocations;
    if (existing) newLocations = savedLocations.filter(l => l.id !== existing.id);
    else newLocations = [...savedLocations, { id: Date.now(), name: point.name, address: point.address, lat: point.lat, lng: point.lng, opening_hours: point.opening_hours }];
    setSavedLocations(newLocations);
    localStorage.setItem('sequence_saved_locations', JSON.stringify(newLocations));
  };
  const addPointFromLibrary = (loc) => {
    const newPoint = {
        id: Math.random().toString(36).substr(2, 9),
        name: loc.name, address: loc.address, lat: loc.lat, lng: loc.lng,
        url: '', stayMinutes: 60, travelMode: 'DRIVING', manualTravelTime: null,
        distance: null, duration: null, opening_hours: loc.opening_hours, day: selectedDay
    };
    const updatedPoints = [...currentTrip.points, newPoint];
    setCurrentTrip(prev => ({ ...prev, points: updatedPoints }));
    updateTravelTimes(updatedPoints);
    setIsLibraryOpen(false);
  };
  const deleteFromLibrary = (id) => {
      const newLocations = savedLocations.filter(l => l.id !== id);
      setSavedLocations(newLocations);
      localStorage.setItem('sequence_saved_locations', JSON.stringify(newLocations));
  };
  const isLocationSaved = (point) => savedLocations.some(l => (l.lat === point.lat && l.lng === point.lng));

  return (
    <div className="min-h-screen bg-[#FBFBFD] text-zinc-900 font-sans selection:bg-zinc-200">
      <ConfirmModal 
        isOpen={deleteConfirmation.isOpen}
        message={deleteConfirmation.message}
        title={deleteConfirmation.type === 'duration' ? "Reduce Trip Duration?" : "Confirm Deletion"}
        onClose={() => setDeleteConfirmation({ isOpen: false, id: null, type: null, message: '' })}
        onConfirm={handleExecuteDelete}
      />

      <LocationLibrary 
        isOpen={isLibraryOpen} 
        onClose={() => setIsLibraryOpen(false)} 
        savedLocations={savedLocations} 
        onSelect={addPointFromLibrary} 
        onDelete={confirmRemoveLibraryItem} 
      />
      
      {/* HOTEL MODAL */}
      {isHotelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><BedDouble /> Add Hotel Stay</h2>
                <input 
                    className="w-full p-3 border border-zinc-200 rounded-xl mb-4" 
                    placeholder="Search Hotel (e.g. Hilton Tokyo)..."
                    value={hotelInput}
                    onChange={(e) => setHotelInput(e.target.value)}
                />
                <div className="flex gap-4 mb-6">
                    <div className="flex-1">
                        <label className="text-xs font-bold text-zinc-400 uppercase">From Day</label>
                        <input type="number" min="1" max={currentTrip.dayCount} value={hotelStartDay} onChange={(e) => setHotelStartDay(parseInt(e.target.value))} className="w-full p-2 border border-zinc-200 rounded-lg"/>
                    </div>
                    <div className="flex-1">
                        <label className="text-xs font-bold text-zinc-400 uppercase">To Day</label>
                        <input type="number" min={hotelStartDay} max={currentTrip.dayCount} value={hotelEndDay} onChange={(e) => setHotelEndDay(parseInt(e.target.value))} className="w-full p-2 border border-zinc-200 rounded-lg"/>
                    </div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsHotelModalOpen(false)}>Cancel</Button>
                    <Button onClick={addHotel} loading={isLoading}>Search & Add</Button>
                </div>
                {error && <p className="text-red-500 text-sm mt-2">{String(error)}</p>}
                
                {/* LIST EXISTING HOTELS */}
                {currentTrip.hotels && currentTrip.hotels.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-zinc-100">
                        <h3 className="text-sm font-bold mb-2">My Hotels</h3>
                        <div className="space-y-2">
                            {currentTrip.hotels.map(h => (
                                <div key={h.id} className="flex justify-between items-center text-sm p-2 bg-zinc-50 rounded-lg">
                                    <div>
                                        <div className="font-bold">{h.name}</div>
                                        <div className="text-xs text-zinc-500">Day {h.startDay} - {h.endDay}</div>
                                    </div>
                                    <button onClick={() => confirmRemoveHotel(h.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={14}/></button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
      )}

      <nav className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-white sticky top-0 z-50">
        <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setView('home')}>
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-bold group-hover:scale-105 transition-transform">S</div>
          <span className="text-xl font-bold tracking-tight">Sequence</span>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" icon={User}>Profile</Button>
          {view === 'planner' && <Button onClick={saveTrip} icon={Save}>Save Trip</Button>}
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {view === 'home' ? (
          <div className="space-y-12">
            <header className="space-y-4 text-center md:text-left">
              <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight">Plan with precision.</h1>
              <p className="text-xl text-zinc-500 max-w-xl">
                The visual timeline Google Maps forgot. Using official real-time data for your perfect itinerary.
              </p>
              <div className="flex pt-4 justify-center md:justify-start">
                <Button onClick={() => setView('planner')} className="px-8 py-4 text-lg" icon={Plus}>
                  Create New Trip
                </Button>
              </div>
            </header>

            {trips.length > 0 && (
              <section className="space-y-6">
                <h2 className="text-2xl font-bold">Saved Adventures</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {trips.map(trip => (
                    <Card key={trip.id} className="cursor-pointer group hover:border-black transition-colors" onClick={() => loadTrip(trip)}>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-lg group-hover:text-zinc-600 transition-colors">{trip.name}</h3>
                          <p className="text-zinc-400 text-sm flex items-center gap-2 mt-1">
                            <MapPin size={14} /> {trip.points.length} stops <span>•</span> {trip.dayCount || 1} Day{trip.dayCount > 1 ? 's' : ''}
                          </p>
                        </div>
                        <ChevronRight className="text-zinc-300 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2 flex-1">
                    <input type="text" value={currentTrip.name} onChange={(e) => setCurrentTrip({...currentTrip, name: e.target.value})} className="text-4xl font-extrabold bg-transparent border-none outline-none focus:ring-0 w-full placeholder:text-zinc-200" placeholder="Trip Name..."/>
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-zinc-200 shadow-sm">
                            <CalendarDays size={14} className="text-zinc-400" />
                            <span className="text-xs font-bold text-zinc-400 uppercase">Date</span>
                            <input type="date" value={currentTrip.startDate} onChange={(e) => setCurrentTrip({...currentTrip, startDate: e.target.value})} className="bg-transparent border-none outline-none text-sm font-medium"/>
                        </div>
                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-zinc-200 shadow-sm">
                            <Clock size={14} className="text-zinc-400" />
                            <span className="text-xs font-bold text-zinc-400 uppercase">Start</span>
                            <input type="time" value={currentTrip.startTime} onChange={(e) => setCurrentTrip({...currentTrip, startTime: e.target.value})} className="bg-transparent border-none outline-none text-sm font-medium w-[70px]"/>
                        </div>
                        <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-zinc-200 shadow-sm">
                            <Calendar size={14} className="text-zinc-400" />
                            <span className="text-xs font-bold text-zinc-400 uppercase">Duration</span>
                            <input type="number" min="1" max="30" value={currentTrip.dayCount} onChange={(e) => handleDurationChange(e.target.value)} className="bg-transparent border-none outline-none text-sm font-medium w-10 text-center"/>
                            <span className="text-sm font-medium">Day{currentTrip.dayCount > 1 ? 's' : ''}</span>
                        </div>
                        <Button variant="outline" className="h-[38px] px-3 text-xs" onClick={() => setIsHotelModalOpen(true)} icon={BedDouble}>Hotels</Button>
                    </div>
                </div>
              </div>

              <div className="flex overflow-x-auto gap-2 pb-2 -mx-2 px-2 scrollbar-hide">
                  {Array.from({ length: currentTrip.dayCount }).map((_, i) => {
                      const dayNum = i + 1;
                      const isActive = selectedDay === dayNum;
                      const tabDate = new Date(currentTrip.startDate || new Date());
                      tabDate.setDate(tabDate.getDate() + i);
                      const label = tabDate.toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
                      return (
                          <button key={dayNum} onClick={() => setSelectedDay(dayNum)} className={`flex flex-col items-start px-4 py-2 rounded-xl transition-all min-w-[100px] border ${isActive ? 'bg-black text-white border-black shadow-lg scale-105' : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'}`}>
                              <span className={`text-[10px] font-bold uppercase tracking-wider ${isActive ? 'text-zinc-400' : 'text-zinc-400'}`}>Day {dayNum}</span>
                              <span className="text-sm font-bold">{label}</span>
                          </button>
                      );
                  })}
              </div>
            </div>

            <div className="relative group flex gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-400">
                    <MapPin size={20} />
                </div>
                <input type="text" placeholder={`Paste URL to add to Day ${selectedDay}...`} value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addWaypoint()} className="w-full pl-12 pr-40 py-4 bg-white border border-zinc-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-black outline-none text-lg" disabled={isLoading} />
                <div className="absolute inset-y-2 right-2 flex items-center">
                    <Button onClick={addWaypoint} loading={isLoading} disabled={!isApiLoaded}>
                    {isLoading && loadingMsg ? loadingMsg : 'Add Stop'}
                    </Button>
                </div>
              </div>
              <Button variant="outline" className="h-full rounded-2xl px-4" onClick={() => setIsLibraryOpen(true)} title="Saved Locations"><BookOpen size={20} /></Button>
              {error && <div className="absolute top-full mt-2 text-red-500 text-sm flex items-center gap-1 left-4"><AlertCircle size={14}/> {String(error)}</div>}
            </div>

            {plannerTab === 'map' ? (
                <div className="mt-4 animate-in fade-in">
                    <MapPreview points={timelineData} />
                </div>
            ) : (
                <div className="mt-8 relative animate-in fade-in">
                {timelineData.length === 0 ? (
                    <div className="text-center py-20 border-2 border-dashed border-zinc-100 rounded-3xl">
                    <p className="text-zinc-400">Day {selectedDay} is empty. Paste a link to start.</p>
                    </div>
                ) : (
                    <div className="space-y-0 ml-4 border-l-2 border-zinc-100 pl-8">
                    {timelineData.map((point, idx) => (
                        <div key={point.id} className="relative pb-12 last:pb-0">
                        {/* Number Badge */}
                        <div className={`absolute -left-[45px] top-0 w-8 h-8 rounded-full border-4 border-white shadow-sm flex items-center justify-center text-white font-bold text-sm z-10 ${point.isHotel ? 'bg-blue-600' : point.isOpen ? 'bg-black' : 'bg-red-500'}`} title={point.statusMessage}>
                            {point.isHotel ? <BedDouble size={14}/> : idx - (timelineData[0].isHotel ? 1 : 0) + 1}
                        </div>
                        
                        <Card className={`relative overflow-hidden group transition-all ${point.isHotel ? 'bg-blue-50/50 border-blue-100' : !point.isOpen ? 'border-red-200 bg-red-50/30' : ''}`}>
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                            <div className="space-y-1 flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                <span className={`text-xs font-bold uppercase tracking-widest ${!point.isOpen && !point.isHotel ? 'text-red-500' : 'text-zinc-400'}`}>
                                    {point.startTime}
                                </span>
                                <ArrowRight size={12} className="text-zinc-300" />
                                <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{point.endTime}</span>
                                </div>
                                
                                {editingId === point.id && !point.isHotel ? (
                                    <div className="space-y-2 mb-2">
                                        <input type="text" value={point.name} onChange={(e) => updatePointDetails(point.id, 'name', e.target.value)} className="w-full text-xl font-bold border-b border-black outline-none bg-transparent" autoFocus />
                                        <input type="text" value={point.address} onChange={(e) => updatePointDetails(point.id, 'address', e.target.value)} className="w-full text-sm text-zinc-500 border-b border-zinc-300 outline-none bg-transparent" />
                                        <Button onClick={() => setEditingId(null)} className="py-1 px-3 text-xs h-8" icon={Check}>Done</Button>
                                    </div>
                                ) : (
                                    <div className="group/text cursor-pointer" onClick={() => !point.isHotel && setEditingId(point.id)}>
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-xl font-bold hover:text-zinc-600 transition-colors">{point.name}</h3>
                                            {!point.isHotel && <Pencil size={14} className="text-zinc-300 opacity-0 group-hover/text:opacity-100 transition-opacity" />}
                                        </div>
                                        <p className="text-sm text-zinc-500 mt-1">{point.address}</p>
                                    </div>
                                )}

                                {point.statusMessage && !point.isHotel && (
                                    <div className={`text-xs font-bold mt-1 ${point.isOpen ? 'text-green-600' : 'text-red-500 flex items-center gap-1'}`}>
                                        {!point.isOpen && <AlertCircle size={12}/>}
                                        {point.statusMessage}
                                    </div>
                                )}

                                <div className="flex items-center gap-2 mt-2">
                                    <a href={point.url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(point.name + ' ' + point.address)}`} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                                        View on Maps <ExternalLink size={10} />
                                    </a>
                                </div>
                            </div>

                            {/* Controls */}
                            {!point.isHotel && (
                                <div className="flex flex-col gap-4 items-end">
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => movePoint(currentTrip.points.findIndex(p => p.id === point.id), -1)} className="p-1 text-zinc-300 hover:text-black disabled:opacity-30 transition-colors"><ChevronUp size={20} /></button>
                                        <button onClick={() => movePoint(currentTrip.points.findIndex(p => p.id === point.id), 1)} className="p-1 text-zinc-300 hover:text-black disabled:opacity-30 transition-colors"><ChevronDown size={20} /></button>
                                        <div className="w-px h-4 bg-zinc-200 mx-1"></div>
                                        <button onClick={() => toggleSaveLocation(point)} className={`p-1.5 rounded-full transition-all ${isLocationSaved(point) ? 'text-yellow-400 bg-yellow-50' : 'text-zinc-300 hover:text-zinc-500'}`}><Star size={18} fill={isLocationSaved(point) ? "currentColor" : "none"} /></button>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col items-center">
                                        <label className="text-[10px] font-bold text-zinc-400 uppercase mb-1">Stay</label>
                                        <div className="flex items-center bg-zinc-50 rounded-lg px-2">
                                            <Clock size={14} className="text-zinc-400 mr-2" />
                                            <input type="number" value={point.stayMinutes} onChange={(e) => updateStay(point.id, e.target.value)} className="w-12 py-2 bg-transparent border-none focus:ring-0 font-medium text-center" />
                                            <span className="text-xs text-zinc-400 pr-1">min</span>
                                        </div>
                                        </div>
                                        <button onClick={() => confirmRemovePoint(point.id)} className="p-2 text-zinc-300 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                                    </div>
                                </div>
                            )}
                            </div>

                            {idx < timelineData.length - 1 && (
                            <div className="mt-6 pt-6 border-t border-zinc-100">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        {!point.isHotel && !timelineData[idx+1].isHotel && (
                                            <div className="flex bg-zinc-100 p-1 rounded-lg">
                                                {['DRIVING', 'TRANSIT', 'WALKING'].map(m => (
                                                <button key={m} onClick={() => updateTravelMode(point.id, m)} className={`p-1.5 rounded-md transition-all ${point.travelMode === m ? 'bg-white shadow-sm text-black' : 'text-zinc-400 hover:text-zinc-600'}`}>
                                                    {m === 'DRIVING' ? <Car size={16}/> : m === 'TRANSIT' ? <Train size={16}/> : <Footprints size={16}/>}
                                                </button>
                                                ))}
                                            </div>
                                        )}
                                        <div className="text-xs flex items-center gap-2">
                                            <span className="font-bold">{point.distanceDisplay || '...'}</span>
                                            <span className="text-zinc-300">•</span>
                                            <span className="cursor-pointer border-b border-dashed border-zinc-300 hover:border-black">~{point.computedTravel} min</span>
                                        </div>
                                    </div>
                                    {!point.isHotel && !timelineData[idx+1].isHotel && (
                                        <a href={`https://www.google.com/maps/dir/?api=1&origin=${point.lat},${point.lng}&destination=${timelineData[idx+1].lat},${timelineData[idx+1].lng}&travelmode=${point.travelMode ? point.travelMode.toLowerCase() : 'driving'}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-zinc-500 hover:text-black flex items-center gap-1 transition-colors bg-zinc-50 hover:bg-zinc-100 px-3 py-1.5 rounded-full">
                                            Check Traffic <ExternalLink size={12} />
                                        </a>
                                    )}
                                </div>
                            </div>
                            )}
                        </Card>
                        </div>
                    ))}
                    </div>
                )}
                </div>
            )}
          </div>
        )}
      </main>

      {view === 'planner' && currentTrip.points.length > 0 && (
        <div className="fixed bottom-8 right-8 animate-in slide-in-from-bottom-4">
          <Button onClick={saveTrip} className="px-8 shadow-2xl" icon={Save}>
            Save Adventure
          </Button>
        </div>
      )}
    </div>
  );
}
