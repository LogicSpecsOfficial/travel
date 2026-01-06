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
      } else if (type === 'hotel') {
          setCurrentTrip(prev => ({ ...prev, hotels: (prev.hotels || []).filter(h => h.id !== id) }));
      }
      setDeleteConfirmation({ isOpen: false, id: null, type: null, message: '' });
  };

  // --- FIXED SEARCH LOGIC ---
 const searchPlaceLogic = async (inputUrl) => {
      if (!inputUrl.includes('http') && !inputUrl.includes('maps')) {
          throw new Error("Please paste a valid Google Maps link.");
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

      setLoadingMsg('Fetching details...');
      
      try {
        const { Place } = await google.maps.importLibrary("places");
        const finalCoords = extracted.coords || bodyCoords;
        
        // Use the query from the link or name, or fallback to URL
        const query = pageTitle || extracted.name || inputUrl;

        let request = { 
            fields: ['displayName', 'formattedAddress', 'location'],
            textQuery: query
        };

        // FIX: Ensure center is a google.maps.LatLng object
        if (finalCoords) {
            request.locationRestriction = {
                center: new google.maps.LatLng(finalCoords.lat, finalCoords.lng),
                radius: 50.0 
            };
        }

        const { places } = await Place.searchByText(request);

        if (places && places.length > 0) {
            const place = places[0];
            let name = place.displayName;
            if (typeof name === 'object') name = name.text; // Handle object structure
            
            if (!name || /Google\s*Maps?/i.test(name)) {
                name = place.formattedAddress ? place.formattedAddress.split(',')[0] : "Location";
            }

            return {
                place: {
                    name: name,
                    formatted_address: place.formattedAddress,
                    geometry: { location: place.location }
                },
                coords: finalCoords,
                url: inputUrl
            };
        } else if (finalCoords) {
             // Fallback to Geocoder if Search returns 0 results
             const geocoder = new google.maps.Geocoder();
             const geoRes = await geocoder.geocode({ location: finalCoords });
             return {
                 place: {
                     name: geoRes.results[0]?.formatted_address.split(',')[0] || "Pinned Location",
                     formatted_address: geoRes.results[0]?.formatted_address,
                     geometry: { location: finalCoords }
                 },
                 coords: finalCoords,
                 url: inputUrl
             };
        }
        throw new Error("No place found for this link.");
      } catch (e) {
          console.error("Maps API Error:", e);
          throw new Error("Google Maps Error: " + (e.message || "Check Console"));
      }
  };
        const { places } = await Place.searchByText(request);

        if (places && places.length > 0) {
            const place = places[0];
            // Accessing displayName correctly based on the new API object structure
            let name = typeof place.displayName === 'string' ? place.displayName : place.displayName?.text || place.displayName;
            
            if (!name || /Google\s*Maps?/i.test(name)) {
                name = place.formattedAddress ? place.formattedAddress.split(',')[0] : "Location";
            }

            return {
                place: {
                    name: name,
                    formatted_address: place.formattedAddress,
                    geometry: { location: place.location }
                },
                coords: finalCoords,
                url: inputUrl
            };
        } else if (finalCoords) {
             const geocoder = new google.maps.Geocoder();
             const geoRes = await geocoder.geocode({ location: finalCoords });
             return {
                 place: {
                     name: geoRes.results[0]?.formatted_address.split(',')[0] || "Pinned Location",
                     formatted_address: geoRes.results[0]?.formatted_address,
                     geometry: { location: finalCoords }
                 },
                 coords: finalCoords,
                 url: inputUrl
             };
        }
        throw new Error("No place found for this link.");
      } catch (e) {
          console.error(e);
          throw new Error("Search failed. Ensure your link is correct.");
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
            address: result.place.formatted_address,
            lat, lng, url: result.url, stayMinutes: 60, day: selectedDay
        };
        setCurrentTrip(prev => ({ ...prev, points: [...prev.points, newPoint] }));
        setUrlInput('');
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

  const timelineData = useMemo(() => {
    const dayPoints = currentTrip.points.filter(p => (p.day || 1) === selectedDay);
    let currentTime = new Date(currentTrip.startDate || new Date());
    currentTime.setDate(currentTime.getDate() + (selectedDay - 1));
    const [h, m] = (currentTrip.startTime || "09:00").split(':').map(Number);
    currentTime.setHours(h, m, 0);

    return dayPoints.map((point) => {
      const startTime = new Date(currentTime);
      currentTime.setMinutes(currentTime.getMinutes() + (point.stayMinutes || 0));
      const endTime = new Date(currentTime);
      return {
        ...point,
        startTime: startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        endTime: endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
    });
  }, [currentTrip.points, currentTrip.startTime, currentTrip.startDate, selectedDay]);

  return (
    <div className="min-h-screen bg-[#FBFBFD] text-zinc-900 font-sans">
      <ConfirmModal isOpen={deleteConfirmation.isOpen} message={deleteConfirmation.message} onClose={() => setDeleteConfirmation({ isOpen: false })} onConfirm={handleExecuteDelete} />
      
      {isHotelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
            <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><BedDouble /> Add Hotel</h2>
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
                <input type="text" placeholder="Paste Google Maps Link..." value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addWaypoint()} className="w-full p-4 pl-12 bg-white border rounded-2xl shadow-sm outline-none" disabled={isLoading} />
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                <Button onClick={addWaypoint} loading={isLoading} disabled={!isApiLoaded}>Add Stop</Button>
            </div>
            {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

            <div className="space-y-4 ml-4 border-l-2 pl-8">
                {timelineData.length === 0 ? <p className="text-zinc-400">No stops added yet.</p> : timelineData.map((point) => (
                    <Card key={point.id}>
                        <div className="flex justify-between items-start">
                            <div>
                                <span className="text-xs font-bold text-zinc-400">{point.startTime} - {point.endTime}</span>
                                <h3 className="text-xl font-bold">{point.name}</h3>
                                <p className="text-sm text-zinc-500">{point.address}</p>
                            </div>
                            <button onClick={() => setDeleteConfirmation({isOpen:true, id: point.id, type: 'point', message: 'Delete this stop?'})}><Trash2 className="text-zinc-300 hover:text-red-500" size={18}/></button>
                        </div>
                    </Card>
                ))}
            </div>
            <Button onClick={saveTrip} className="w-full py-4 text-lg">Save and Exit</Button>
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
