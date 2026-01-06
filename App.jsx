import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, MapPin, Clock, Trash2, ChevronRight, ExternalLink, 
  ArrowRight, Calendar, Navigation, Save, User, Loader2, 
  Car, Footprints, Train, AlertCircle, Pencil, Check, Map as MapIcon, List,
  ChevronUp, ChevronDown, Star, BookOpen, X as XIcon, CalendarDays, BedDouble
} from 'lucide-react';
import { ClerkProvider, SignedIn, SignedOut, SignIn, UserButton } from "@clerk/clerk-react";

// --- IMPORTS ---
import { GOOGLE_MAPS_API_KEY, CLERK_PUBLISHABLE_KEY } from './src/utils/config';
import { resolveShortUrl, extractFromUrl } from './src/utils/helpers';
import { Button, Card, ConfirmModal } from './src/components/UI';
import { MapPreview, LocationLibrary } from './src/components/Features';

function Planner() {
  const [view, setView] = useState('home'); 
  const [trips, setTrips] = useState([]);
  const [savedLocations, setSavedLocations] = useState([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isHotelModalOpen, setIsHotelModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, id: null, type: null, message: '', payload: null });

  const [currentTrip, setCurrentTrip] = useState({ 
    name: "Untitled Adventure", points: [], hotels: [], startTime: "09:00", startDate: new Date().toISOString().split('T')[0], dayCount: 1
  });
  
  const [selectedDay, setSelectedDay] = useState(1);
  const [urlInput, setUrlInput] = useState('');
  const [hotelInput, setHotelInput] = useState('');
  const [hotelStartDay, setHotelStartDay] = useState(1);
  const [hotelEndDay, setHotelEndDay] = useState(1);
  const [isApiLoaded, setIsApiLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;
    if (window.google && window.google.maps) { setIsApiLoaded(true); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&loading=async&libraries=places,marker,geocoding`;
    script.async = true;
    script.defer = true;
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
          setCurrentTrip(prev => ({ ...prev, hotels: (prev.hotels || []).filter(h => h.id !== id) }));
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

  // --- IMPROVED SEARCH: Link Only + Reverse POI Mapping ---
  const searchPlaceLogic = async (inputUrl) => {
      // REQUIREMENT: Must be a link
      if (!inputUrl.includes('http') && !inputUrl.includes('maps')) {
          throw new Error("Please paste a valid Google Maps link (URLs only).");
      }

      let targetUrl = inputUrl;
      let extracted = extractFromUrl(targetUrl);
      let pageTitle = null; let bodyCoords = null;

      if ((!extracted.coords && !extracted.name) && (inputUrl.includes('goo.gl') || inputUrl.includes('maps.app') || inputUrl.includes('bit.ly'))) {
          setLoadingMsg('Resolving link...');
          const resolved = await resolveShortUrl(inputUrl);
          targetUrl = resolved.url; 
          if (resolved.title && !/Google\s*Maps?/i.test(resolved.title)) pageTitle = resolved.title;
          bodyCoords = resolved.coords;
          const reExtracted = extractFromUrl(targetUrl);
          extracted = { name: reExtracted.name || extracted.name, coords: reExtracted.coords || extracted.coords };
      }

      setLoadingMsg('Finding location details...');
      
      try {
        const { Place } = await google.maps.importLibrary("places");
        const finalCoords = extracted.coords || bodyCoords;
        
        let request = { fields: ['displayName', 'formattedAddress', 'location', 'regularOpeningHours'] };

        // If we have coordinates, search for the POI at that spot
        if (finalCoords) {
            request.locationRestriction = {
                center: finalCoords,
                radius: 5 // Target strictly within 5 meters
            };
            request.textQuery = pageTitle || extracted.name || "point of interest";
        } else if (extracted.name) {
            request.textQuery = extracted.name;
        } else {
            request.textQuery = inputUrl;
        }

        const { places } = await Place.searchByText(request);

        if (places && places.length > 0) {
            const place = places[0];
            let name = place.displayName;
            // Final safety: if name is generic, use the first part of address
            if (!name || /Google\s*Maps?/i.test(name)) {
                name = place.formattedAddress ? place.formattedAddress.split(',')[0] : "Location";
            }

            return {
                place: {
                    name: name,
                    formatted_address: place.formattedAddress,
                    geometry: { location: place.location },
                    opening_hours: place.regularOpeningHours ? { periods: place.regularOpeningHours.periods } : null
                },
                coords: finalCoords,
                url: inputUrl
            };
        } else if (finalCoords) {
             // If Google finds no "Place", use Geocoder for a raw address name
             const geocoder = new google.maps.Geocoder();
             const geoRes = await geocoder.geocode({ location: finalCoords });
             return {
                 place: {
                     name: geoRes.results[0]?.formatted_address.split(',')[0] || "Custom Stop",
                     formatted_address: geoRes.results[0]?.formatted_address,
                     geometry: { location: finalCoords }
                 },
                 coords: finalCoords,
                 url: inputUrl
             };
        }
        throw new Error("No details found for this link.");
      } catch (e) {
          throw e;
      }
  };

  const addWaypoint = async () => {
    if (!urlInput.trim()) return;
    setIsLoading(true); setError(null);
    try {
        const result = await searchPlaceLogic(urlInput);
        const lat = typeof result.place.geometry.location.lat === 'function' ? result.place.geometry.location.lat() : result.place.geometry.location.lat;
        const lng = typeof result.place.geometry.location.lng === 'function' ? result.place.geometry.location.lng() : result.place.geometry.location.lng;
        
        const newPoint = {
            id: Math.random().toString(36).substr(2, 9),
            name: result.place.name,
            address: result.place.formatted_address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
            lat, lng, url: result.url, stayMinutes: 60, travelMode: 'DRIVING', day: selectedDay, opening_hours: result.place.opening_hours
        };
        const updatedPoints = [...currentTrip.points, newPoint];
        setCurrentTrip(prev => ({ ...prev, points: updatedPoints }));
        setUrlInput(''); updateTravelTimes(updatedPoints); 
    } catch (e) { setError(e.message); } finally { setIsLoading(false); }
  };

  const addHotel = async () => {
      if (!hotelInput.trim()) return;
      setIsLoading(true); setError(null);
      try {
          const result = await searchPlaceLogic(hotelInput);
          const lat = typeof result.place.geometry.location.lat === 'function' ? result.place.geometry.location.lat() : result.place.geometry.location.lat;
          const lng = typeof result.place.geometry.location.lng === 'function' ? result.place.geometry.location.lng() : result.place.geometry.location.lng;
          const newHotel = { id: Math.random().toString(36).substr(2, 9), name: result.place.name, address: result.place.formatted_address, lat, lng, startDay: hotelStartDay, endDay: hotelEndDay };
          setCurrentTrip(prev => ({ ...prev, hotels: [...(prev.hotels||[]), newHotel] }));
          setHotelInput(''); setIsHotelModalOpen(false);
      } catch (e) { setError(e.message); } finally { setIsLoading(false); }
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

  const updateStay = (id, mins) => setCurrentTrip(prev => ({ ...prev, points: prev.points.map(p => p.id === id ? { ...p, stayMinutes: parseInt(mins)||0 } : p) }));
  const updatePointDetails = (id, field, value) => setCurrentTrip(prev => ({ ...prev, points: prev.points.map(p => p.id === id ? { ...p, [field]: value } : p) }));
  const movePoint = (idx, dir) => {
    const dayPoints = currentTrip.points.filter(p => (p.day||1)===selectedDay);
    const itemToMove = dayPoints[idx]; const itemTarget = dir===-1 ? dayPoints[idx-1] : dayPoints[idx+1];
    if (!itemToMove || !itemTarget) return;
    const idxFrom = currentTrip.points.findIndex(p=>p.id===itemToMove.id);
    const idxTo = currentTrip.points.findIndex(p=>p.id===itemTarget.id);
    const newPoints = [...currentTrip.points];
    [newPoints[idxFrom], newPoints[idxTo]] = [newPoints[idxTo], newPoints[idxFrom]];
    setCurrentTrip(prev => ({ ...prev, points: newPoints }));
    updateTravelTimes(newPoints);
  };

  const timelineData = useMemo(() => {
    const dayPoints = currentTrip.points.filter(p => (p.day || 1) === selectedDay);
    const activeHotel = currentTrip.hotels ? currentTrip.hotels.find(h => selectedDay >= h.startDay && selectedDay <= h.endDay) : null;
    let displayPoints = [];
    if (activeHotel) displayPoints.push({ id: `h-s-${selectedDay}`, name: `${activeHotel.name} (Start)`, address: activeHotel.address, lat: activeHotel.lat, lng: activeHotel.lng, isHotel: true });
    displayPoints = [...displayPoints, ...dayPoints];
    if (activeHotel) displayPoints.push({ id: `h-e-${selectedDay}`, name: `${activeHotel.name} (End)`, address: activeHotel.address, lat: activeHotel.lat, lng: activeHotel.lng, isHotel: true });

    let currentTime = new Date(currentTrip.startDate || new Date());
    currentTime.setDate(currentTime.getDate() + (selectedDay - 1));
    const [h, m] = (currentTrip.startTime || "09:00").split(':').map(Number);
    currentTime.setHours(h, m, 0);

    return displayPoints.map((point, index) => {
      const startTime = new Date(currentTime);
      currentTime.setMinutes(currentTime.getMinutes() + (point.stayMinutes || 0));
      const endTime = new Date(currentTime);
      let travelTime = point.isHotel ? 30 : (point.travelData?.duration || 15);
      if (index < displayPoints.length - 1) currentTime.setMinutes(currentTime.getMinutes() + travelTime);
      return {
        ...point,
        startTime: startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        endTime: endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        computedTravel: travelTime
      };
    });
  }, [currentTrip.points, currentTrip.startTime, currentTrip.startDate, currentTrip.hotels, selectedDay]);

  return (
    <div className="min-h-screen bg-[#FBFBFD] text-zinc-900 font-sans">
      <ConfirmModal isOpen={deleteConfirmation.isOpen} message={deleteConfirmation.message} onClose={() => setDeleteConfirmation({ isOpen: false })} onConfirm={handleExecuteDelete} />
      
      {isHotelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
            <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><BedDouble /> Hotels</h2>
                <input className="w-full p-3 border rounded-xl mb-4" placeholder="Paste Hotel Google Maps Link..." value={hotelInput} onChange={(e) => setHotelInput(e.target.value)} />
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsHotelModalOpen(false)}>Cancel</Button>
                    <Button onClick={addHotel} loading={isLoading}>Add Hotel</Button>
                </div>
            </div>
        </div>
      )}

      <nav className="flex items-center justify-between px-6 py-4 border-b bg-white sticky top-0 z-50">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-bold">S</div>
          <span className="text-xl font-bold">Sequence</span>
        </div>
        <UserButton afterSignOutUrl="/" />
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {view === 'home' ? (
          <div className="space-y-12">
            <h1 className="text-6xl font-extrabold tracking-tight">Your Trips</h1>
            <Button onClick={() => setView('planner')} className="px-8 py-4 text-lg" icon={Plus}>Create New Trip</Button>
            <div className="grid gap-4">
              {trips.map(trip => (
                <Card key={trip.id} className="cursor-pointer" onClick={() => loadTrip(trip)}>
                  <h3 className="font-bold">{trip.name}</h3>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in">
            <div className="flex gap-4 items-center">
              <input value={currentTrip.name} onChange={e => setCurrentTrip({...currentTrip, name: e.target.value})} className="text-4xl font-extrabold bg-transparent outline-none flex-1"/>
              <Button onClick={() => setIsHotelModalOpen(true)} variant="outline" icon={BedDouble}>Hotels</Button>
            </div>
            
            <div className="relative flex gap-2">
                <input type="text" placeholder="Paste Google Maps Link only..." value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addWaypoint()} className="w-full p-4 pl-12 bg-white border rounded-2xl shadow-sm outline-none" disabled={isLoading} />
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                <Button onClick={addWaypoint} loading={isLoading} disabled={!isApiLoaded}>Add Stop</Button>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}

            <div className="space-y-4 ml-4 border-l-2 pl-8">
                {timelineData.map((point, idx) => (
                    <Card key={point.id} className={point.isHotel ? 'bg-blue-50/50' : ''}>
                        <div className="flex justify-between items-start">
                            <div>
                                <span className="text-xs font-bold text-zinc-400">{point.startTime} - {point.endTime}</span>
                                <h3 className="text-xl font-bold">{point.name}</h3>
                                <p className="text-sm text-zinc-500">{point.address}</p>
                            </div>
                            {!point.isHotel && <button onClick={() => setDeleteConfirmation({isOpen:true, id: point.id, type: 'point', message: 'Delete?'})}><Trash2 className="text-zinc-300 hover:text-red-500" size={18}/></button>}
                        </div>
                    </Card>
                ))}
            </div>
            <Button onClick={saveTrip} className="w-full">Save and Exit</Button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <SignedOut>
        <div className="min-h-screen bg-[#FBFBFD] flex items-center justify-center p-6"><SignIn /></div>
      </SignedOut>
      <SignedIn><Planner /></SignedIn>
    </ClerkProvider>
  );
}
