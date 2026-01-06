import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Plus, MapPin, Clock, Trash2, ChevronRight, ExternalLink, 
  ArrowRight, Calendar, Navigation, Save, User, Loader2, 
  Car, Footprints, Train, AlertCircle, Pencil, Check, Map as MapIcon, List,
  ChevronUp, ChevronDown, Star, BookOpen, X as XIcon, CalendarDays, BedDouble
} from 'lucide-react';
import { ClerkProvider, SignedIn, SignedOut, SignIn, UserButton } from "@clerk/clerk-react";

// --- IMPORTS ---
// If these files exist in src/utils, keep these imports. 
// If you revert to single file, you can paste the helpers back here.
// Assuming we are using the single-file structure for stability based on previous success:
import { GOOGLE_MAPS_API_KEY, CLERK_PUBLISHABLE_KEY } from './src/utils/config';
import { resolveShortUrl, extractFromUrl } from './src/utils/helpers';
// Note: If Vercel fails with "Module not found", delete these import lines 
// and paste the helper functions directly into this file (as shown in the fallback block below).

import { Button, Card, ConfirmModal } from './src/components/UI';
import { MapPreview, LocationLibrary } from './src/components/Features';

// --- PLANNER COMPONENT ---
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
  const [plannerTab, setPlannerTab] = useState('timeline'); 
  const [error, setError] = useState(null);

  // Load Google Maps with the NEW libraries
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;
    if (window.google && window.google.maps) { setIsApiLoaded(true); return; }
    
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&loading=async&libraries=places,marker`;
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
    setCurrentTrip({ name: "Untitled Adventure", points: [], hotels: [], startTime: "09:00", startDate: new Date().toISOString().split('T')[0], dayCount: 1 });
    setSelectedDay(1);
  };

  const loadTrip = (trip) => {
    setCurrentTrip({ ...trip, hotels: trip.hotels || [], startTime: trip.startTime || "09:00", dayCount: trip.dayCount || 1 });
    setPlannerTab('timeline'); setSelectedDay(1); setView('planner');
  };

  const confirmRemovePoint = (id) => setDeleteConfirmation({ isOpen: true, id, type: 'point', message: 'Delete this stop?' });
  const confirmRemoveHotel = (id) => setDeleteConfirmation({ isOpen: true, id, type: 'hotel', message: 'Remove this hotel?' });

  const handleDurationChange = (val) => {
      const newCount = parseInt(val) || 1;
      if(newCount < 1) return;
      if (currentTrip.points.some(p => (p.day || 1) > newCount)) {
          setDeleteConfirmation({ isOpen: true, id: newCount, type: 'duration', message: `Reducing to ${newCount} days will delete stops on later days.` });
      } else {
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

  // --- SMART SEARCH FUNCTION ---
  const searchPlace = async (inputUrl) => {
      let targetUrl = inputUrl;
      let extracted = extractFromUrl(targetUrl);
      let pageTitle = null; let bodyCoords = null;

      // 1. Resolve Links
      if ((!extracted.coords && !extracted.name) && (inputUrl.includes('goo.gl') || inputUrl.includes('maps.app') || inputUrl.includes('bit.ly'))) {
          setLoadingMsg('Resolving link...');
          try {
            const resolved = await resolveShortUrl(inputUrl);
            targetUrl = resolved.url; 
            
            // FIX: STRICT TITLE CHECK
            // If the title is "Google Maps" or "Google Map", ignore it.
            if (resolved.title && !/Google\s*Maps?/i.test(resolved.title)) {
                pageTitle = resolved.title;
            } else {
                pageTitle = null;
            }
            
            bodyCoords = resolved.coords;
            const reExtracted = extractFromUrl(targetUrl);
            extracted = { name: reExtracted.name || extracted.name, coords: reExtracted.coords || extracted.coords };
          } catch (e) { console.warn("Link resolution skipped", e); }
      }

      setLoadingMsg('Searching Google Maps...');
      
      // 2. Use the NEW 'Place' Library
      try {
        const { Place } = await google.maps.importLibrary("places");
        
        let request = {
            fields: ['displayName', 'formattedAddress', 'location', 'regularOpeningHours'],
        };

        // Decide what to search for
        if (extracted.name) {
            request.textQuery = extracted.name;
        } else if (pageTitle) {
            request.textQuery = pageTitle;
        } else if (extracted.coords || bodyCoords) {
            const c = extracted.coords || bodyCoords;
            request.textQuery = `${c.lat},${c.lng}`;
        } else {
            request.textQuery = inputUrl;
        }

        // 3. Execute Search
        const { places } = await Place.searchByText(request);

        if (places && places.length > 0) {
            const place = places[0];
            
            // FIX: NAME VALIDATION
            // If the API returns "Google Maps" as the name, use the address instead.
            let bestName = place.displayName;
            if (!bestName || /Google\s*Maps?/i.test(bestName)) {
                bestName = place.formattedAddress ? place.formattedAddress.split(',')[0] : "Pinned Location";
            }

            return {
                place: {
                    name: bestName,
                    formatted_address: place.formattedAddress,
                    geometry: { location: place.location },
                    opening_hours: place.regularOpeningHours ? { periods: place.regularOpeningHours.periods } : null
                },
                coords: extracted.coords || bodyCoords,
                url: inputUrl
            };
        } else {
            throw new Error("No results found");
        }
      } catch (e) {
          // Fallback if API fails but we have coords
          const finalCoords = extracted.coords || bodyCoords;
          if (finalCoords) {
             // FIX: FALLBACK NAME
             // If we rely on pageTitle but it was nullified because it was "Google Map", use "Pinned Location"
             return { place: { name: pageTitle || "Pinned Location", geometry: { location: finalCoords } }, coords: finalCoords, url: inputUrl, isFallback: true };
          }
          throw new Error("Google Maps could not find this place. Try searching for the name directly.");
      }
  };

  const addWaypoint = async () => {
    if (!urlInput.trim()) return;
    setIsLoading(true); setError(null);
    try {
        const result = await searchPlace(urlInput);
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
    } catch (e) { setError(String(e.message || e)); } finally { setIsLoading(false); }
  };

  const addHotel = async () => {
      if (!hotelInput.trim()) return;
      setIsLoading(true); setError(null);
      try {
          const result = await searchPlace(hotelInput);
          const lat = typeof result.place.geometry.location.lat === 'function' ? result.place.geometry.location.lat() : result.place.geometry.location.lat;
          const lng = typeof result.place.geometry.location.lng === 'function' ? result.place.geometry.location.lng() : result.place.geometry.location.lng;
          const newHotel = { id: Math.random().toString(36).substr(2, 9), name: result.place.name, address: result.place.formatted_address, lat, lng, startDay: hotelStartDay, endDay: hotelEndDay };
          setCurrentTrip(prev => ({ ...prev, hotels: [...(prev.hotels||[]), newHotel] }));
          setHotelInput(''); setIsHotelModalOpen(false);
      } catch (e) { setError(String(e.message || e)); } finally { setIsLoading(false); }
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

  function checkOpeningStatus(arrivalDate, opening_hours) {
    if (!opening_hours || !opening_hours.periods) return { status: 'unknown' };
    const dayOfWeek = arrivalDate.getDay(); 
    const arrivalTime = arrivalDate.getHours() * 100 + arrivalDate.getMinutes();
    const todaysPeriods = opening_hours.periods.filter(p => p.open.day === dayOfWeek);
    if (todaysPeriods.length === 0) return { status: 'closed', message: 'Closed today' };
    for (const period of todaysPeriods) {
        const openTime = parseInt(period.open.time || (period.open.hour * 100 + period.open.minute)); 
        const closeTime = period.close ? parseInt(period.close.time || (period.close.hour * 100 + period.close.minute)) : 2400; 
        if (arrivalTime >= openTime && arrivalTime < closeTime) return { status: 'open', message: 'Open' };
    }
    return { status: 'closed', message: `Closed` };
  }

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
      const openingStatus = point.isHotel ? { status: 'open' } : checkOpeningStatus(startTime, point.opening_hours);
      return {
        ...point,
        startTime: startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        endTime: endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        computedTravel: travelTime, isOpen: openingStatus.status !== 'closed', statusMessage: openingStatus.message
      };
    });
  }, [currentTrip.points, currentTrip.startTime, currentTrip.startDate, currentTrip.hotels, selectedDay]);

  const toggleSaveLocation = (point) => {
    const existing = savedLocations.find(l => (l.lat === point.lat && l.lng === point.lng));
    let newLocations = existing ? savedLocations.filter(l => l.id !== existing.id) : [...savedLocations, { id: Date.now(), name: point.name, address: point.address, lat: point.lat, lng: point.lng, opening_hours: point.opening_hours }];
    setSavedLocations(newLocations); localStorage.setItem('sequence_saved_locations', JSON.stringify(newLocations));
  };
  const addPointFromLibrary = (loc) => {
    const newPoint = { id: Math.random().toString(36).substr(2, 9), name: loc.name, address: loc.address, lat: loc.lat, lng: loc.lng, stayMinutes: 60, travelMode: 'DRIVING', day: selectedDay, opening_hours: loc.opening_hours };
    const updatedPoints = [...currentTrip.points, newPoint];
    setCurrentTrip(prev => ({ ...prev, points: updatedPoints })); updateTravelTimes(updatedPoints); setIsLibraryOpen(false);
  };
  const isLocationSaved = (point) => savedLocations.some(l => (l.lat === point.lat && l.lng === point.lng));

  return (
    <div className="min-h-screen bg-[#FBFBFD] text-zinc-900 font-sans">
      <ConfirmModal isOpen={deleteConfirmation.isOpen} message={deleteConfirmation.message} title={deleteConfirmation.type === 'duration' ? "Reduce Trip?" : "Delete Stop?"} onClose={() => setDeleteConfirmation({ isOpen: false })} onConfirm={handleExecuteDelete} />
      <LocationLibrary isOpen={isLibraryOpen} onClose={() => setIsLibraryOpen(false)} savedLocations={savedLocations} onSelect={addPointFromLibrary} onDelete={(id) => setDeleteConfirmation({isOpen:true, id, type: 'library', message: 'Remove from saved?'})} />
      
      {isHotelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm">
            <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><BedDouble /> Hotels</h2>
                <input className="w-full p-3 border rounded-xl mb-4" placeholder="Search Hotel..." value={hotelInput} onChange={(e) => setHotelInput(e.target.value)} />
                <div className="flex gap-4 mb-6">
                    <div className="flex-1"><label className="text-xs font-bold text-zinc-400">Day From</label><input type="number" min="1" max={currentTrip.dayCount} value={hotelStartDay} onChange={(e) => setHotelStartDay(parseInt(e.target.value))} className="w-full p-2 border rounded-lg"/></div>
                    <div className="flex-1"><label className="text-xs font-bold text-zinc-400">Day To</label><input type="number" min={hotelStartDay} max={currentTrip.dayCount} value={hotelEndDay} onChange={(e) => setHotelEndDay(parseInt(e.target.value))} className="w-full p-2 border rounded-lg"/></div>
                </div>
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsHotelModalOpen(false)}>Cancel</Button>
                    <Button onClick={addHotel} loading={isLoading}>Add Hotel</Button>
                </div>
                {currentTrip.hotels?.length > 0 && (
                    <div className="mt-6 pt-6 border-t space-y-2">
                        {currentTrip.hotels.map(h => (
                            <div key={h.id} className="flex justify-between items-center text-sm p-2 bg-zinc-50 rounded-lg">
                                <div><div className="font-bold">{h.name}</div><div className="text-xs text-zinc-400">Day {h.startDay}-{h.endDay}</div></div>
                                <button onClick={() => confirmRemoveHotel(h.id)} className="text-red-500"><Trash2 size={14}/></button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
      )}

      <nav className="flex items-center justify-between px-6 py-4 border-b bg-white sticky top-0 z-50">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('home')}>
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-bold">S</div>
          <span className="text-xl font-bold tracking-tight">Sequence</span>
        </div>
        <div className="flex items-center gap-4">
          <UserButton afterSignOutUrl="/" />
          {view === 'planner' && <Button onClick={saveTrip} icon={Save}>Save Trip</Button>}
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {view === 'home' ? (
          <div className="space-y-12">
            <header className="space-y-4">
              <h1 className="text-6xl font-extrabold tracking-tight">Plan with precision.</h1>
              <Button onClick={() => setView('planner')} className="px-8 py-4 text-lg" icon={Plus}>Create New Trip</Button>
            </header>
            {trips.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {trips.map(trip => (
                  <Card key={trip.id} className="cursor-pointer" onClick={() => loadTrip(trip)}>
                    <h3 className="font-bold text-lg">{trip.name}</h3>
                    <p className="text-zinc-400 text-sm">{trip.points.length} stops • {trip.dayCount} Days</p>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in">
            <div className="space-y-4">
                <input type="text" value={currentTrip.name} onChange={(e) => setCurrentTrip({...currentTrip, name: e.target.value})} className="text-4xl font-extrabold bg-transparent border-none outline-none w-full" placeholder="Trip Name..."/>
                <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border"><CalendarDays size={14}/><input type="date" value={currentTrip.startDate} onChange={(e) => setCurrentTrip({...currentTrip, startDate: e.target.value})} className="bg-transparent text-sm"/></div>
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border"><Clock size={14}/><input type="time" value={currentTrip.startTime} onChange={(e) => setCurrentTrip({...currentTrip, startTime: e.target.value})} className="bg-transparent text-sm w-[70px]"/></div>
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border"><Calendar size={14}/><input type="number" min="1" value={currentTrip.dayCount} onChange={(e) => handleDurationChange(e.target.value)} className="bg-transparent text-sm w-10"/> Days</div>
                    <Button variant="outline" onClick={() => setIsHotelModalOpen(true)} icon={BedDouble}>Hotels</Button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                    {Array.from({ length: currentTrip.dayCount }).map((_, i) => (
                        <button key={i} onClick={() => setSelectedDay(i+1)} className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${selectedDay === i+1 ? 'bg-black text-white' : 'bg-white text-zinc-400'}`}>Day {i+1}</button>
                    ))}
                </div>
            </div>

            <div className="relative flex gap-2">
                <input type="text" placeholder={`Paste URL or Name (e.g., 'Tokyo Tower')`} value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addWaypoint()} className="w-full p-4 pl-12 bg-white border rounded-2xl shadow-sm outline-none" disabled={isLoading} />
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" />
                <Button onClick={addWaypoint} loading={isLoading} disabled={!isApiLoaded}>Add Stop</Button>
                <Button variant="outline" onClick={() => setIsLibraryOpen(true)}><BookOpen size={20}/></Button>
            </div>

            <div className="space-y-4 ml-4 border-l-2 pl-8">
                {timelineData.map((point, idx) => (
                    <div key={point.id} className="relative pb-12 last:pb-0">
                        <div className={`absolute -left-[45px] top-0 w-8 h-8 rounded-full border-4 border-white shadow-sm flex items-center justify-center text-white font-bold text-sm ${point.isHotel ? 'bg-blue-600' : point.isOpen ? 'bg-black' : 'bg-red-500'}`}>
                            {point.isHotel ? <BedDouble size={14}/> : idx - (timelineData[0].isHotel ? 1 : 0) + 1}
                        </div>
                        <Card className={`${point.isHotel ? 'bg-blue-50/50' : !point.isOpen ? 'bg-red-50/30' : ''}`}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs font-bold uppercase text-zinc-400">{point.startTime} - {point.endTime}</span>
                                    </div>
                                    {editingId === point.id ? (
                                        <input value={point.name} onChange={(e) => updatePointDetails(point.id, 'name', e.target.value)} onBlur={() => setEditingId(null)} autoFocus className="text-xl font-bold bg-transparent outline-none border-b border-black" />
                                    ) : (
                                        <h3 className="text-xl font-bold cursor-pointer" onClick={() => !point.isHotel && setEditingId(point.id)}>{point.name}</h3>
                                    )}
                                    <p className="text-sm text-zinc-500">{point.address}</p>
                                    {point.statusMessage && <p className={`text-xs font-bold mt-1 ${point.isOpen ? 'text-green-600' : 'text-red-500'}`}>{point.statusMessage}</p>}
                                </div>
                                {!point.isHotel && (
                                    <div className="flex flex-col gap-4 items-end">
                                        <div className="flex gap-2">
                                            <button onClick={() => movePoint(currentTrip.points.findIndex(p => p.id === point.id), -1)} className="text-zinc-300 hover:text-black"><ChevronUp size={20}/></button>
                                            <button onClick={() => movePoint(currentTrip.points.findIndex(p => p.id === point.id), 1)} className="text-zinc-300 hover:text-black"><ChevronDown size={20}/></button>
                                            <button onClick={() => toggleSaveLocation(point)} className={isLocationSaved(point) ? "text-yellow-400" : "text-zinc-300"}><Star size={18} fill={isLocationSaved(point) ? "currentColor" : "none"} /></button>
                                            <button onClick={() => confirmRemovePoint(point.id)} className="text-zinc-300 hover:text-red-500"><Trash2 size={18}/></button>
                                        </div>
                                        <div className="flex items-center gap-2 bg-zinc-50 px-2 rounded-lg">
                                            <Clock size={14} className="text-zinc-400"/>
                                            <input type="number" value={point.stayMinutes} onChange={(e) => updateStay(point.id, e.target.value)} className="w-12 bg-transparent text-center font-medium"/>
                                            <span className="text-xs text-zinc-400">min</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {idx < timelineData.length - 1 && (
                                <div className="mt-6 pt-6 border-t flex items-center justify-between text-xs text-zinc-400">
                                    <div className="flex items-center gap-2">
                                        <Car size={14}/>
                                        <span className="font-bold text-zinc-900">{point.travelData?.distance || "~"}</span>
                                        <span>•</span>
                                        <span>~{point.computedTravel} min travel</span>
                                    </div>
                                    <a href={`https://www.google.com/maps/dir/?api=1&origin=${point.lat},${point.lng}&destination=${timelineData[idx+1].lat},${timelineData[idx+1].lng}`} target="_blank" className="hover:text-black flex items-center gap-1">Directions <ExternalLink size={10}/></a>
                                </div>
                            )}
                        </Card>
                    </div>
                ))}
            </div>
          </div>
        )}
      </main>
      {view === 'planner' && currentTrip.points.length > 0 && (
        <div className="fixed bottom-8 right-8"><Button onClick={saveTrip} className="px-8 shadow-2xl" icon={Save}>Save Adventure</Button></div>
      )}
    </div>
  );
}

export default function App() {
  if (!CLERK_PUBLISHABLE_KEY) {
      return <div className="p-8 text-center text-red-500 font-bold">Missing Clerk Publishable Key in Vercel!</div>
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <SignedOut>
        <div className="min-h-screen bg-[#FBFBFD] flex flex-col items-center justify-center p-6">
          <div className="text-center mb-8 space-y-4">
             <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center text-white font-bold text-3xl mx-auto mb-4">S</div>
             <h1 className="text-4xl font-extrabold tracking-tight">Sequence Planner</h1>
             <p className="text-zinc-500">Sign in to access your travel plans.</p>
          </div>
          <SignIn />
        </div>
      </SignedOut>
      <SignedIn>
        <Planner />
      </SignedIn>
    </ClerkProvider>
  );
}
